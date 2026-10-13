#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { requireMatchingMcpRelease } from "./lib/mcp-release-identity.mjs";

const expected = JSON.parse(await readFile("server.json", "utf8"));
const name = encodeURIComponent(expected.name);
const version = encodeURIComponent(expected.version);
const url = `https://registry.modelcontextprotocol.io/v0.1/servers/${name}/versions/${version}`;
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (response.status === 404) {
    process.stdout.write("missing\n");
  } else if (response.ok) {
    requireMatchingMcpRelease(expected, await response.json());
    process.stdout.write("matching\n");
  } else {
    throw new Error(
      `MCP Registry returned HTTP ${response.status}; publication state is unknown.`,
    );
  }
} catch (error) {
  process.stderr.write(
    `MCP Registry identity check failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
