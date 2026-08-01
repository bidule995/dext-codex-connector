import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CONNECTOR_VERSION } from "../../src/version.js";

async function projectFile(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("public release metadata", () => {
  it("keeps package, changelog, and release tag conventions aligned", async () => {
    const packageJson = JSON.parse(await projectFile("package.json")) as {
      version: string;
      license: string;
      repository: { url: string };
    };
    const changelog = await projectFile("CHANGELOG.md");

    const plugin = JSON.parse(
      await projectFile(".codex-plugin/plugin.json")
    ) as { version: string };

    expect(packageJson.version).toBe("0.2.0-beta.1");
    expect(CONNECTOR_VERSION).toBe(packageJson.version);
    expect(plugin.version).toBe(packageJson.version);
    expect(packageJson.license).toBe("Apache-2.0");
    expect(packageJson.repository.url).toContain(
      "github.com/bidule995/dext-codex-connector"
    );
    expect(changelog).toContain(`## [${packageJson.version}]`);
  });

  it("publishes only from version tags with immutable action pins", async () => {
    const workflows = await Promise.all([
      projectFile(".github/workflows/ci.yml"),
      projectFile(".github/workflows/codeql.yml"),
      projectFile(".github/workflows/release.yml")
    ]);
    const release = workflows[2];

    expect(release).toContain('      - "v*.*.*"');
    expect(release).toContain("pnpm pack --pack-destination release");
    expect(release).toContain("pnpm release:verify-local");
    expect(release).toContain("dext-codex-plugin-");
    expect(release).toContain("plugin/runtime/dext-local-stdio.mjs");
    expect(release).toContain("scripts/configure-local.ps1");
    expect(release).not.toContain("docker/build-push-action");
    expect(release).toContain("--prerelease");
    for (const workflow of workflows) {
      expect(workflow).not.toMatch(/uses:\s+[^\s]+@v\d/u);
    }
  });

  it("refuses placeholder hosted endpoints and verifies the local release", () => {
    const prepare = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../scripts/prepare-hosted-plugin.mjs", import.meta.url)
        ),
        "--url",
        "https://example.com/mcp"
      ],
      { encoding: "utf8" }
    );
    expect(prepare.status).not.toBe(0);
    expect(prepare.stderr).toContain("real public HTTPS origin");

    const verify = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../scripts/verify-local-release.mjs", import.meta.url)
        )
      ],
      { encoding: "utf8" }
    );
    expect(verify.status).toBe(0);
    expect(verify.stdout).toContain("Local live Codex plugin release checks passed");
  });

  it("documents unofficial status and private vulnerability reporting", async () => {
    await expect(projectFile("README.md")).resolves.toContain(
      "independent, unofficial project"
    );
    await expect(projectFile("SECURITY.md")).resolves.toContain(
      "private vulnerability reporting"
    );
  });
});
