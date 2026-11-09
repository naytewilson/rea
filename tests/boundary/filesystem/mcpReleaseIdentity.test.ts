import { describe, expect, it } from "vitest";

const { requireMatchingMcpRelease } = (await import(
  new URL("../../../scripts/lib/mcp-release-identity.mjs", import.meta.url).href
)) as {
  requireMatchingMcpRelease: (
    expected: unknown,
    record: unknown,
  ) => { name: string; version: string; package: string };
};

const release = {
  name: "io.github.naytewilson/rea",
  version: "6.4.0",
  repository: { url: "https://github.com/naytewilson/rea", source: "github" },
  websiteUrl: "https://github.com/naytewilson/rea",
  packages: [
    {
      registryType: "npm",
      registryBaseUrl: "https://registry.npmjs.org",
      identifier: "rea-agents-nayte",
      version: "6.4.0",
      runtimeHint: "npx",
      transport: { type: "stdio" },
      packageArguments: [{ type: "positional", value: "mcp" }],
    },
  ],
};

describe("fork MCP Registry identity", () => {
  it("accepts an exact public registry entry", () => {
    expect(requireMatchingMcpRelease(release, { server: release })).toEqual({
      name: "io.github.naytewilson/rea",
      version: "6.4.0",
      package: "rea-agents-nayte",
    });
  });
  it.each([
    { name: "io.github.morluto/rea" },
    { version: "6.5.0" },
    { repository: { url: "https://github.com/morluto/rea", source: "github" } },
    { packages: [{ ...release.packages[0], identifier: "rea-agents" }] },
    { packages: [{ ...release.packages[0], version: "6.3.0" }] },
    { packages: [{ ...release.packages[0], transport: { type: "http" } }] },
  ])("rejects conflicting publication identity %j", (delta) => {
    expect(() =>
      requireMatchingMcpRelease(release, { server: { ...release, ...delta } }),
    ).toThrow("does not match");
  });
  it("rejects absent and malformed registry data", () => {
    expect(() => requireMatchingMcpRelease(release, null)).toThrow(
      "does not match",
    );
    expect(() =>
      requireMatchingMcpRelease(release, { server: { name: release.name } }),
    ).toThrow("does not match");
  });
});
