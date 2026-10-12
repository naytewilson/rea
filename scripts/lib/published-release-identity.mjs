/**
 * Check that an immutable existing npm package was produced from this exact
 * GitHub release commit. Used only when recovering a partially published
 * release; a coincidental package version is never sufficient to skip publish.
 */
export function requireMatchingPublishedRelease({
  packageName,
  version,
  repository,
  sourceSha,
  metadata,
  attestations,
}) {
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(packageName))
    throw new Error("Invalid npm package identity.");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository))
    throw new Error("Invalid GitHub release repository.");
  if (!/^[0-9a-f]{40}$/u.test(sourceSha))
    throw new Error("Missing exact GitHub release commit.");
  if (
    metadata?.name !== packageName ||
    metadata?.version !== version ||
    typeof metadata.dist?.integrity !== "string" ||
    !metadata.dist.integrity.startsWith("sha512-")
  ) {
    throw new Error(
      "Registry package identity or SHA-512 integrity is missing.",
    );
  }
  if (!Array.isArray(attestations?.attestations)) {
    throw new Error("npm registry provenance attestations are absent.");
  }

  const expectedDigest = Buffer.from(
    metadata.dist.integrity.slice("sha512-".length),
    "base64",
  ).toString("hex");
  if (!/^[0-9a-f]{128}$/u.test(expectedDigest)) {
    throw new Error("Invalid registry SHA-512 integrity.");
  }

  for (const attestation of attestations.attestations) {
    const payload = attestation?.bundle?.dsseEnvelope?.payload;
    if (typeof payload !== "string") continue;
    let statement;
    try {
      statement = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    } catch {
      continue;
    }
    if (statement.predicateType !== "https://slsa.dev/provenance/v1") continue;
    const workflow =
      statement.predicate?.buildDefinition?.externalParameters?.workflow;
    const sources = statement.predicate?.buildDefinition?.resolvedDependencies;
    const matchingSubject = statement.subject?.some(
      (subject) =>
        subject.name === `pkg:npm/${packageName}@${version}` &&
        subject.digest?.sha512 === expectedDigest,
    );
    const matchingSource = sources?.some(
      (source) =>
        source.digest?.gitCommit === sourceSha &&
        typeof source.uri === "string" &&
        source.uri.startsWith(`git+https://github.com/${repository}@`),
    );
    if (
      matchingSubject &&
      workflow?.repository === `https://github.com/${repository}` &&
      matchingSource
    ) {
      return {
        packageName,
        version,
        repository,
        sourceSha,
        sha512: expectedDigest,
      };
    }
  }
  throw new Error(
    `Published ${packageName}@${version} does not have matching npm provenance for ${repository}@${sourceSha}; refusing to reuse another release.`,
  );
}
