import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadLocalPluginConfig } from "../../src/plugin/local-config.js";

async function writeConfig(
  directory: string,
  config: Record<string, unknown>
): Promise<string> {
  const path = join(directory, "config.json");
  await writeFile(path, JSON.stringify(config), "utf8");
  return path;
}

const liveConfig = {
  version: 1,
  mode: "live",
  dataHealth: { enabled: true },
  commerce: { enabled: false, environment: "sandbox" },
  riskDetailRequestBudget: 40
};

describe("local plugin configuration", () => {
  it("defaults to disabled without reading credentials", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dext-local-config-"));
    const decryptDpapi = vi.fn(async () => "unexpected-secret");
    const config = await loadLocalPluginConfig({
      environment: { DEXT_LOCAL_CONFIG_PATH: join(directory, "missing.json") },
      platform: "win32",
      decryptDpapi
    });

    expect(config.mode).toBe("disabled");
    expect(config.dataHealth).toMatchObject({
      enabled: false,
      credentialSource: "missing"
    });
    expect(config.commerce.enabled).toBe(false);
    expect(decryptDpapi).not.toHaveBeenCalled();
  });

  it("loads Windows DPAPI ciphertext through the injected decryptor", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dext-local-config-"));
    const configPath = await writeConfig(directory, liveConfig);
    await writeFile(
      join(directory, "credentials.dpapi.json"),
      JSON.stringify({
        version: 1,
        provider: "windows-dpapi-current-user",
        dataHealthToken: "encrypted-health-token"
      }),
      "utf8"
    );
    const decryptDpapi = vi.fn(async (ciphertext: string) => {
      expect(ciphertext).toBe("encrypted-health-token");
      return "synthetic-health-token";
    });

    const config = await loadLocalPluginConfig({
      environment: { DEXT_LOCAL_CONFIG_PATH: configPath },
      platform: "win32",
      decryptDpapi
    });

    expect(config.dataHealth).toMatchObject({
      enabled: true,
      token: "synthetic-health-token",
      credentialSource: "windows-dpapi"
    });
    expect(JSON.stringify(config.capabilityStatus)).not.toContain(
      "synthetic-health-token"
    );
  });

  it("prefers explicit environment credentials over stored credentials", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dext-local-config-"));
    const configPath = await writeConfig(directory, liveConfig);
    await writeFile(
      join(directory, "credentials.dpapi.json"),
      JSON.stringify({
        version: 1,
        provider: "windows-dpapi-current-user",
        dataHealthToken: "stored-health-token"
      }),
      "utf8"
    );
    const decryptDpapi = vi.fn(async () => "stored-decrypted-token");

    const config = await loadLocalPluginConfig({
      environment: {
        DEXT_LOCAL_CONFIG_PATH: configPath,
        DEXT_DATA_HEALTH_TOKEN: "environment-health-token"
      },
      platform: "win32",
      decryptDpapi
    });

    expect(config.dataHealth).toMatchObject({
      token: "environment-health-token",
      credentialSource: "environment"
    });
    expect(decryptDpapi).not.toHaveBeenCalled();
  });

  it("rejects invalid local overrides before starting MCP", async () => {
    await expect(
      loadLocalPluginConfig({
        environment: {
          DEXT_LOCAL_CONFIG_PATH: join(tmpdir(), "missing-dext-config.json"),
          DEXT_DATA_HEALTH_ENABLED: "yes"
        },
        platform: "linux"
      })
    ).rejects.toThrow("DEXT_DATA_HEALTH_ENABLED must be true or false");
  });
});
