import { expect, it } from "vitest";

type PublishedIdentityInput = {
  packageName: string;
  version: string;
  repository: string;
  sourceSha: string;
  metadata: unknown;
  attestations: unknown;
};

const { requireMatchingPublishedRelease } = (await import(
  new URL(
    "../../../scripts/lib/published-release-identity.mjs",
    import.meta.url,
  ).href
)) as {
  requireMatchingPublishedRelease: (input: PublishedIdentityInput) => {
    repository: string;
    sourceSha: string;
    sha512: string;
  };
};

const sha = "a".repeat(40);
const digest = Buffer.alloc(64, 7);
const asHex = digest.toString("hex");

function fixture({
  repository = "naytewilson/rea",
  sourceSha = sha,
  subjectDigest = asHex,
  metadataVersion = "6.4.0",
  attestedRepository = repository,
  attestedSourceSha = sourceSha,
}: {
  repository?: string;
  sourceSha?: string;
  subjectDigest?: string;
  metadataVersion?: string;
  attestedRepository?: string;
  attestedSourceSha?: string;
} = {}): PublishedIdentityInput {
  const payload = {
    predicateType: "https://slsa.dev/provenance/v1",
    subject: [
      {
        name: "pkg:npm/rea-agents@6.4.0",
        digest: { sha512: subjectDigest },
      },
    ],
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            repository: `https://github.com/${attestedRepository}`,
            ref: "refs/heads/main",
          },
        },
        resolvedDependencies: [
          {
            uri: `git+https://github.com/${attestedRepository}@refs/heads/main`,
            digest: { gitCommit: attestedSourceSha },
          },
        ],
      },
    },
  };
  return {
    packageName: "rea-agents",
    version: "6.4.0",
    repository,
    sourceSha,
    metadata: {
      name: "rea-agents",
      version: metadataVersion,
      dist: { integrity: `sha512-${digest.toString("base64")}` },
    },
    attestations: {
      attestations: [
        {
          bundle: {
            dsseEnvelope: {
              payload: Buffer.from(JSON.stringify(payload)).toString("base64"),
            },
          },
        },
      ],
    },
  };
}

it("permits idempotent recovery only when npm provenance binds exact repository, source and integrity", () => {
  expect(requireMatchingPublishedRelease(fixture())).toMatchObject({
    repository: "naytewilson/rea",
    sourceSha: sha,
    sha512: asHex,
  });
});

it.each([
  { attestedRepository: "morluto/rea", message: "does not have matching" },
  { attestedSourceSha: "b".repeat(40), message: "does not have matching" },
  { subjectDigest: "f".repeat(128), message: "does not have matching" },
  { metadataVersion: "6.5.0", message: "identity" },
])("rejects an independently published artifact: %j", (change) => {
  expect(() => requireMatchingPublishedRelease(fixture(change))).toThrow(
    change.message,
  );
});

it("rejects absent or malformed npm attestation records", () => {
  expect(() =>
    requireMatchingPublishedRelease({ ...fixture(), attestations: {} }),
  ).toThrow("absent");
  expect(() =>
    requireMatchingPublishedRelease({
      ...fixture(),
      attestations: {
        attestations: [{ bundle: { dsseEnvelope: { payload: "!?" } } }],
      },
    }),
  ).toThrow("does not have matching");
});

it("requires an exact release source SHA and package metadata", () => {
  expect(() =>
    requireMatchingPublishedRelease({
      ...fixture(),
      sourceSha: "not-an-exact-commit",
    }),
  ).toThrow("exact GitHub release commit");
  expect(() =>
    requireMatchingPublishedRelease({
      ...fixture(),
      metadata: { name: "different-package", version: "6.4.0" },
    }),
  ).toThrow("identity");
});
