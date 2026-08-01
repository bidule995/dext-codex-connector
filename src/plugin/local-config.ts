import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { z } from "zod";

import type {
  LocalCapabilityStatus,
  LocalCredentialSource
} from "../services/capability-service.js";

const LocalConfigSchema = z.object({
  version: z.literal(1),
  mode: z.enum(["disabled", "live"]).default("disabled"),
  dataHealth: z
    .object({ enabled: z.boolean().default(true) })
    .default({ enabled: true }),
  commerce: z
    .object({
      enabled: z.boolean().default(false),
      environment: z.enum(["sandbox", "production"]).default("sandbox")
    })
    .default({ enabled: false, environment: "sandbox" }),
  riskDetailRequestBudget: z.number().int().min(1).max(50).default(40)
});

const WindowsCredentialFileSchema = z.object({
  version: z.literal(1),
  provider: z.literal("windows-dpapi-current-user"),
  dataHealthToken: z.string().min(1).optional(),
  commerceApiKey: z.string().min(1).optional()
});

type LocalFileConfig = z.infer<typeof LocalConfigSchema>;
type WindowsCredentialFile = z.infer<typeof WindowsCredentialFileSchema>;

export interface LocalPluginConfig {
  mode: "disabled" | "live";
  dataHealth: {
    enabled: boolean;
    token?: string;
    credentialSource: LocalCredentialSource;
  };
  commerce: {
    enabled: boolean;
    environment: "sandbox" | "production";
    apiKey?: string;
    credentialSource: LocalCredentialSource;
  };
  riskDetailRequestBudget: number;
  configPath: string;
  capabilityStatus: LocalCapabilityStatus;
}

export interface LoadLocalPluginConfigOptions {
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  decryptDpapi?: (ciphertext: string) => Promise<string>;
}

const DpapiDecryptCommand = String.raw`
$ErrorActionPreference = 'Stop'
$encrypted = [Console]::In.ReadToEnd().Trim()
$secure = ConvertTo-SecureString -String $encrypted
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
`;

function defaultConfigPath(
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): string {
  if (environment["DEXT_LOCAL_CONFIG_PATH"]) {
    return environment["DEXT_LOCAL_CONFIG_PATH"];
  }
  if (platform === "win32") {
    const localAppData = environment["LOCALAPPDATA"];
    return join(
      localAppData || join(homedir(), "AppData", "Local"),
      "dext-codex-connector",
      "config.json"
    );
  }
  return join(
    environment["XDG_CONFIG_HOME"] || join(homedir(), ".config"),
    "dext-codex-connector",
    "config.json"
  );
}

async function optionalJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw new Error(`Could not read local Dext configuration at ${path}.`, {
      cause: error
    });
  }
}

function booleanOverride(
  value: string | undefined,
  fallback: boolean,
  name: string
): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

function integerOverride(
  value: string | undefined,
  fallback: number,
  name: string
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new Error(`${name} must be an integer from 1 through 50.`);
  }
  return parsed;
}

function modeOverride(
  value: string | undefined,
  fallback: LocalFileConfig["mode"]
): LocalFileConfig["mode"] {
  if (value === undefined) return fallback;
  if (value === "disabled" || value === "live") return value;
  throw new Error("DEXT_CONNECTOR_MODE must be disabled or live.");
}

function commerceEnvironmentOverride(
  value: string | undefined,
  fallback: "sandbox" | "production"
): "sandbox" | "production" {
  if (value === undefined) return fallback;
  if (value === "sandbox" || value === "production") return value;
  throw new Error(
    "DEXT_COMMERCE_ENVIRONMENT must be sandbox or production."
  );
}

function credential(
  value: string | undefined,
  source: LocalCredentialSource
): { value?: string; source: LocalCredentialSource } {
  if (!value) return { source: "missing" };
  if (value.length < 8 || value.length > 20_000) {
    throw new Error("A configured Dext credential has an invalid length.");
  }
  return { value, source };
}

export async function decryptWindowsDpapi(ciphertext: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => name.toLocaleUpperCase() !== "PSMODULEPATH"
      )
    );
    const child = spawn(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", DpapiDecryptCommand],
      {
        env: environment,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      }
    );
    const stdout: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.resume();
    child.once("error", () => {
      reject(new Error("Windows could not start the DPAPI credential helper."));
    });
    child.once("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            "Windows could not decrypt the local Dext credential for this user."
          )
        );
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
    child.stdin.end(ciphertext, "utf8");
  });
}

async function loadWindowsCredentials(
  path: string,
  decrypt: (ciphertext: string) => Promise<string>,
  requested: { dataHealth: boolean; commerce: boolean }
): Promise<{ dataHealthToken?: string; commerceApiKey?: string }> {
  const raw = await optionalJson(path);
  if (raw === undefined) return {};
  const parsed: WindowsCredentialFile = WindowsCredentialFileSchema.parse(raw);
  const [dataHealthToken, commerceApiKey] = await Promise.all([
    requested.dataHealth && parsed.dataHealthToken
      ? decrypt(parsed.dataHealthToken)
      : Promise.resolve(undefined),
    requested.commerce && parsed.commerceApiKey
      ? decrypt(parsed.commerceApiKey)
      : Promise.resolve(undefined)
  ]);
  return {
    ...(dataHealthToken ? { dataHealthToken } : {}),
    ...(commerceApiKey ? { commerceApiKey } : {})
  };
}

export async function loadLocalPluginConfig(
  options: LoadLocalPluginConfigOptions = {}
): Promise<LocalPluginConfig> {
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const configPath = defaultConfigPath(environment, platform);
  const rawConfig = await optionalJson(configPath);
  const fileConfig = LocalConfigSchema.parse(
    rawConfig ?? {
      version: 1,
      mode: "disabled",
      dataHealth: { enabled: true },
      commerce: { enabled: false, environment: "sandbox" },
      riskDetailRequestBudget: 40
    }
  );
  const mode = modeOverride(environment["DEXT_CONNECTOR_MODE"], fileConfig.mode);
  const dataHealthEnabled = booleanOverride(
    environment["DEXT_DATA_HEALTH_ENABLED"],
    fileConfig.dataHealth.enabled,
    "DEXT_DATA_HEALTH_ENABLED"
  );
  const commerceEnabled = booleanOverride(
    environment["DEXT_COMMERCE_ENABLED"],
    fileConfig.commerce.enabled,
    "DEXT_COMMERCE_ENABLED"
  );
  const commerceEnvironment = commerceEnvironmentOverride(
    environment["DEXT_COMMERCE_ENVIRONMENT"],
    fileConfig.commerce.environment
  );
  const riskDetailRequestBudget = integerOverride(
    environment["DEXT_RISK_DETAIL_REQUEST_BUDGET"],
    fileConfig.riskDetailRequestBudget,
    "DEXT_RISK_DETAIL_REQUEST_BUDGET"
  );

  const environmentHealthToken = environment["DEXT_DATA_HEALTH_TOKEN"];
  const environmentCommerceKey = environment["DEXT_COMMERCE_API_KEY"];
  let stored: { dataHealthToken?: string; commerceApiKey?: string } = {};
  if (
    mode === "live" &&
    platform === "win32" &&
    ((dataHealthEnabled && !environmentHealthToken) ||
      (commerceEnabled && !environmentCommerceKey))
  ) {
    stored = await loadWindowsCredentials(
      join(dirname(configPath), "credentials.dpapi.json"),
      options.decryptDpapi ?? decryptWindowsDpapi,
      {
        dataHealth: dataHealthEnabled && !environmentHealthToken,
        commerce: commerceEnabled && !environmentCommerceKey
      }
    );
  }

  const dataHealthCredential = credential(
    environmentHealthToken ?? stored.dataHealthToken,
    environmentHealthToken ? "environment" : "windows-dpapi"
  );
  const commerceCredential = credential(
    environmentCommerceKey ?? stored.commerceApiKey,
    environmentCommerceKey ? "environment" : "windows-dpapi"
  );
  const live = mode === "live";
  const dataHealthConfigured =
    live && dataHealthEnabled && dataHealthCredential.value !== undefined;
  const commerceConfigured =
    live && commerceEnabled && commerceCredential.value !== undefined;

  return {
    mode,
    dataHealth: {
      enabled: dataHealthConfigured,
      ...(dataHealthConfigured
        ? { token: dataHealthCredential.value }
        : {}),
      credentialSource: dataHealthConfigured
        ? dataHealthCredential.source
        : "missing"
    },
    commerce: {
      enabled: commerceConfigured,
      environment: commerceEnvironment,
      ...(commerceConfigured ? { apiKey: commerceCredential.value } : {}),
      credentialSource: commerceConfigured
        ? commerceCredential.source
        : "missing"
    },
    riskDetailRequestBudget,
    configPath,
    capabilityStatus: {
      dataHealth: {
        configured: dataHealthConfigured,
        enabled: dataHealthConfigured,
        connected: dataHealthConfigured,
        mode: dataHealthConfigured ? "live" : "disabled",
        credentialSource: dataHealthConfigured
          ? dataHealthCredential.source
          : "missing",
        ...(!live
          ? { reason: "Set local connector mode to live to enable Data Health." }
          : !dataHealthEnabled
            ? { reason: "Data Health is disabled in local configuration." }
            : !dataHealthConfigured
              ? {
                  reason:
                    "Configure a personal Dext Data Health API token outside Codex conversations."
                }
              : {})
      },
      commerce: {
        configured: commerceConfigured,
        enabled: commerceConfigured,
        connected: commerceConfigured,
        mode: commerceConfigured ? "live" : "disabled",
        credentialSource: commerceConfigured
          ? commerceCredential.source
          : "missing",
        environment: commerceEnvironment,
        ...(!live
          ? { reason: "Set local connector mode to live to enable Commerce." }
          : !commerceEnabled
            ? {
                reason:
                  "Dext Commerce is optional and disabled in local configuration."
              }
            : !commerceConfigured
              ? {
                  reason:
                    "Configure a separate Dext Commerce API key outside Codex conversations."
                }
              : {})
      }
    }
  };
}
