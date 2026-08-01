import { randomBytes } from "node:crypto";
import {
  cp,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const temporaryRoot = await mkdtemp(join(tmpdir(), "dext-docker-secret-test-"));
const contextRoot = join(temporaryRoot, "context");
const imageArchive = join(temporaryRoot, "image.tar");
const imageTag = `dext-connector-secret-test:${process.pid}`;
const canary = `DEXT_FAKE_SECRET_${randomBytes(24).toString("hex")}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${result.status}.`
    );
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

try {
  run("docker", ["info"], { capture: true });
  await cp(projectRoot, contextRoot, {
    recursive: true,
    filter: (source) => {
      const relative = source.slice(projectRoot.length).replaceAll("\\", "/");
      return ![
        "/node_modules",
        "/dist",
        "/coverage",
        "/.git"
      ].some((blocked) => relative === blocked || relative.startsWith(`${blocked}/`));
    }
  });
  await writeFile(join(contextRoot, ".env"), `DEXT_TOKEN=${canary}\n`, "utf8");
  run("docker", ["build", "--tag", imageTag, contextRoot]);
  const history = run(
    "docker",
    ["history", "--no-trunc", imageTag],
    { capture: true }
  );
  if (history.includes(canary)) {
    throw new Error("The fake .env secret appeared in Docker image history.");
  }
  run("docker", ["save", "--output", imageArchive, imageTag]);
  const archive = await readFile(imageArchive);
  if (archive.includes(Buffer.from(canary))) {
    throw new Error("The fake .env secret appeared in a Docker image layer.");
  }
  const filesystemSearch = run(
    "docker",
    [
      "run",
      "--rm",
      imageTag,
      "sh",
      "-c",
      `if grep -R -F '${canary}' /app >/dev/null 2>&1; then exit 9; fi`
    ],
    { capture: true }
  );
  if (filesystemSearch.includes(canary)) {
    throw new Error("The fake .env secret appeared in the image filesystem.");
  }
  process.stdout.write("Docker secret-boundary canary passed.\n");
} finally {
  spawnSync("docker", ["image", "rm", "--force", imageTag], {
    stdio: "ignore"
  });
  await rm(temporaryRoot, { recursive: true, force: true });
}
