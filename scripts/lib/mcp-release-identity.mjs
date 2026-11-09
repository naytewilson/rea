/**
 * Verify an existing MCP Registry record before treating a publication retry
 * as successful. A matching version number alone is never enough.
 */
export function requireMatchingMcpRelease(expected, registryRecord) {
  const actual = registryRecord?.server;
  const desiredPackage = expected?.packages?.[0];
  const actualPackage = actual?.packages?.[0];
  if (
    actual?.name !== expected?.name ||
    actual?.version !== expected?.version ||
    actual?.repository?.source !== "github" ||
    actual?.repository?.url !== expected?.repository?.url ||
    actual?.websiteUrl !== expected?.websiteUrl ||
    actual?.packages?.length !== 1 ||
    actualPackage?.registryType !== "npm" ||
    actualPackage?.registryBaseUrl !== "https://registry.npmjs.org" ||
    actualPackage?.identifier !== desiredPackage?.identifier ||
    actualPackage?.version !== desiredPackage?.version ||
    actualPackage?.runtimeHint !== "npx" ||
    actualPackage?.transport?.type !== "stdio" ||
    actualPackage?.packageArguments?.length !== 1 ||
    actualPackage.packageArguments[0]?.type !== "positional" ||
    actualPackage.packageArguments[0]?.value !== "mcp"
  ) {
    throw new Error(
      "Existing MCP Registry entry does not match this fork's exact release metadata.",
    );
  }
  return {
    name: actual.name,
    version: actual.version,
    package: actualPackage.identifier,
  };
}
