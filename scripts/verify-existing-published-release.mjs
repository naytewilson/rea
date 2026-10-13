#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { requireMatchingPublishedRelease } from "./lib/published-release-identity.mjs";

const [version, sourceSha] = process.argv.slice(2);
const repository = process.env.GITHUB_REPOSITORY;

async function readRegistryJson(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(
      "Could not contact npm registry for publication identity.",
      {
        cause: error,
      },
    );
  }
  if (!response.ok) {
    throw new Error(
      `npm publication identity lookup failed (HTTP ${response.status}).`,
    );
  }
  return response.json();
}

try {
  const packageName = JSON.parse(await readFile("package.json", "utf8")).name;
  const metadata = await readRegistryJson(
    `https://registry.npmjs.org/${packageName}/${encodeURIComponent(version ?? "")}`,
  );
  const attestations = await readRegistryJson(
    `https://registry.npmjs.org/-/npm/v1/attestations/${packageName}@${encodeURIComponent(version ?? "")}`,
  );
  const identity = requireMatchingPublishedRelease({
    packageName,
    version,
    repository,
    sourceSha,
    metadata,
    attestations,
  });
  process.stdout.write(
    `Existing published package belongs to this release: ${JSON.stringify(identity)}\n`,
  );
} catch (error) {
  process.stderr.write(
    `Cannot reuse published npm package: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
