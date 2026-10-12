import { valid as validSemver } from "semver";

/**
 * Refuse to mint a release tag or publish a name/version that was claimed
 * before the reviewed release was created. Both lookups must succeed; an
 * unavailable Git remote or npm registry is not evidence of availability.
 */
export async function requireUnclaimedRelease({
  packageName,
  version,
  inspectTag,
  inspectRegistry,
}) {
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(packageName)) {
    throw new Error(
      "Release claim check requires a valid unscoped npm package name.",
    );
  }
  if (validSemver(version) !== version) {
    throw new Error(
      "Release claim check requires an exact valid SemVer version.",
    );
  }

  const tag = `refs/tags/${packageName}-${version}`;
  const [tagState, registryStatus] = await Promise.all([
    inspectTag(tag),
    inspectRegistry(packageName, version),
  ]);

  if (!["claimed", "absent"].includes(tagState)) {
    throw new Error(`Unrecognized Git tag lookup result: ${String(tagState)}.`);
  }
  if (![200, 404].includes(registryStatus)) {
    throw new Error(
      `npm registry lookup did not establish package availability (HTTP ${String(registryStatus)}).`,
    );
  }

  const collisions = [];
  if (tagState === "claimed") collisions.push(`Git tag ${tag} already exists`);
  if (registryStatus === 200)
    collisions.push(
      `npm package ${packageName}@${version} is already published`,
    );
  if (collisions.length > 0) {
    throw new Error(
      `Release identity is already claimed: ${collisions.join("; ")}. Do not retag, overwrite npm bytes, or treat existing publication as this release.`,
    );
  }

  return { packageName, version, tag, registryStatus };
}
