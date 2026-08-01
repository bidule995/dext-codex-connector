import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("packaging security", () => {
  it("excludes local secrets and generated artifacts from Docker contexts", async () => {
    const dockerignore = await readFile(".dockerignore", "utf8");
    for (const required of [
      ".env",
      ".env.*",
      ".git",
      "node_modules",
      "dist",
      "coverage",
      "*.log"
    ]) {
      expect(dockerignore.split(/\r?\n/u)).toContain(required);
    }
  });

  it("keeps Docker copies explicit and binds local Postgres to loopback", async () => {
    const dockerfile = await readFile("Dockerfile", "utf8");
    const compose = await readFile("compose.yaml", "utf8");
    expect(dockerfile).not.toMatch(/^COPY\s+\.\s+\./mu);
    expect(dockerfile).toContain("ENV HOST=0.0.0.0");
    expect(compose).toContain('"127.0.0.1:54329:5432"');
  });

  it("keeps npm configuration free of registry credentials", async () => {
    const npmrc = await readFile(".npmrc", "utf8");
    expect(npmrc).not.toMatch(/_authToken|password|username/iu);
  });

  it("includes the installable Codex plugin in the package archive", async () => {
    const destination = await mkdtemp(join(tmpdir(), "dext-pack-"));
    const pnpmCli = process.env["npm_execpath"];
    expect(pnpmCli).toBeTruthy();
    try {
      execFileSync(
        process.execPath,
        [pnpmCli!, "pack", "--pack-destination", destination],
        { stdio: "pipe" }
      );
      const archive = (await readdir(destination)).find((name) =>
        name.endsWith(".tgz")
      );
      expect(archive).toBeDefined();
      const listing = execFileSync("tar", ["-tf", join(destination, archive!)], {
        encoding: "utf8"
      });
      for (const required of [
        "package/.agents/plugins/marketplace.json",
        "package/.codex-plugin/plugin.json",
        "package/.mcp.json",
        "package/assets/icon.svg",
        "package/plugin/runtime/dext-fixture-stdio.mjs",
        "package/THIRD_PARTY_NOTICES.md"
      ]) {
        expect(listing).toContain(required);
      }
      const files = listing.split(/\r?\n/u).filter(Boolean);
      expect(files).not.toContain("package/.env");
      expect(
        files.some(
          (path) =>
            path.startsWith("package/.env.") && path !== "package/.env.example"
        )
      ).toBe(false);
      expect(files.some((path) => path.includes("node_modules/"))).toBe(false);
      expect(files.some((path) => /cookie|\.log$/iu.test(path))).toBe(false);
    } finally {
      await rm(destination, { recursive: true, force: true });
    }
  });
});
