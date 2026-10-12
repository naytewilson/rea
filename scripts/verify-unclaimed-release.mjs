#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { requireUnclaimedRelease } from "./lib/release-claim.mjs";

const execFileAsync = promisify(execFile);
const { name, version } = JSON.parse(await readFile("package.json", "utf8"));

async function inspectTag(tag) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-remote", "--exit-code", "--refs", "--tags", "origin", tag],
      { timeout: 20_000 },
    );
    if (stdout.trim() === "") {
      throw new Error("Git returned success without a matching tag.");
    }
    return "claimed";
  } catch (error) {
    if (error && typeof error === "object" && error.code === 2) return "absent";
    throw new Error("Could not establish remote Git tag availability.", {
      cause: error,
    });
  }
}

async function inspectRegistry(packageName, releaseVersion) {
  let response;
  try {
    response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(releaseVersion)}`,
      {
        signal: AbortSignal.timeout(20_000),
        headers: { accept: "application/json" },
      },
    );
  } catch (error) {
    throw new Error("Could not establish npm registry publication state.", {
      cause: error,
    });
  }
  return response.status;
}

try {
  const result = await requireUnclaimedRelease({
    packageName: name,
    version,
    inspectTag,
    inspectRegistry,
  });
  process.stdout.write(
    `Release identity is available: ${JSON.stringify(result)}\n`,
  );
} catch (error) {
  process.stderr.write(
    `Release identity check refused publication: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
