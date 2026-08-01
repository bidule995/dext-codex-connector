import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { decryptWindowsDpapi } from "../../src/plugin/local-config.js";

const describeWindows = process.platform === "win32" ? describe : describe.skip;

describeWindows("Windows DPAPI", () => {
  it("round-trips a synthetic current-user secret", async () => {
    const secret = `synthetic-dext-token-${crypto.randomUUID()}`;
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => name.toLocaleUpperCase() !== "PSMODULEPATH"
      )
    );
    const encrypted = spawnSync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$value = [Console]::In.ReadToEnd(); ConvertTo-SecureString -String $value -AsPlainText -Force | ConvertFrom-SecureString"
      ],
      {
        env: environment,
        input: secret,
        encoding: "utf8",
        windowsHide: true
      }
    );
    if (encrypted.status !== 0) {
      throw new Error(
        `Synthetic DPAPI encryption failed: ${encrypted.stderr.trim() || "no error text"}`
      );
    }
    expect(encrypted.stderr).toBe("");

    await expect(decryptWindowsDpapi(encrypted.stdout.trim())).resolves.toBe(
      secret
    );
  });
});
