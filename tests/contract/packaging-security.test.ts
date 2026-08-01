import { readFile } from "node:fs/promises";

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
});
