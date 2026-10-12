import { expect, it } from "vitest";

type ClaimResult = {
  packageName: string;
  version: string;
  tag: string;
  registryStatus: number;
};
type ClaimLookup = {
  packageName: string;
  version: string;
  inspectTag: (tag: string) => Promise<string>;
  inspectRegistry: (name: string, version: string) => Promise<number>;
};
const { requireUnclaimedRelease } = (await import(
  new URL("../../../scripts/lib/release-claim.mjs", import.meta.url).href
)) as {
  requireUnclaimedRelease: (input: ClaimLookup) => Promise<ClaimResult>;
};

const fixture = ({
  tagState = "absent",
  registryStatus = 404,
}: {
  tagState?: string;
  registryStatus?: number;
} = {}): ClaimLookup => ({
  packageName: "rea-agents",
  version: "6.4.0",
  inspectTag: async () => tagState,
  inspectRegistry: async () => registryStatus,
});

it("allows release only when both remote Git and npm registry prove the identity unclaimed", async () => {
  await expect(requireUnclaimedRelease(fixture())).resolves.toEqual({
    packageName: "rea-agents",
    version: "6.4.0",
    tag: "refs/tags/rea-agents-6.4.0",
    registryStatus: 404,
  });
});

it.each([
  { tagState: "claimed", registryStatus: 404, expected: "Git tag" },
  { tagState: "absent", registryStatus: 200, expected: "npm package" },
  { tagState: "claimed", registryStatus: 200, expected: "already claimed" },
])(
  "blocks colliding release identities: $tagState/$registryStatus",
  async ({ tagState, registryStatus, expected }) => {
    await expect(
      requireUnclaimedRelease(fixture({ tagState, registryStatus })),
    ).rejects.toThrow(expected);
  },
);

it.each([
  { tagState: "unknown", registryStatus: 404 },
  { tagState: "absent", registryStatus: 429 },
  { tagState: "absent", registryStatus: 503 },
])(
  "fails closed when the lookups are inconclusive: $tagState/$registryStatus",
  async ({ tagState, registryStatus }) => {
    await expect(
      requireUnclaimedRelease(fixture({ tagState, registryStatus })),
    ).rejects.toThrow();
  },
);

it("does not mistake lookup failures for an unclaimed identity", async () => {
  await expect(
    requireUnclaimedRelease({
      ...fixture(),
      inspectTag: async () => {
        throw new Error("Git transport unavailable");
      },
    }),
  ).rejects.toThrow("Git transport unavailable");
  await expect(
    requireUnclaimedRelease({
      ...fixture(),
      inspectRegistry: async () => {
        throw new Error("npm unavailable");
      },
    }),
  ).rejects.toThrow("npm unavailable");
});

it("rejects invalid identity syntax before remote calls", async () => {
  await expect(
    requireUnclaimedRelease({ ...fixture(), version: "6.4.0/unsafe" }),
  ).rejects.toThrow("valid SemVer");
  await expect(
    requireUnclaimedRelease({ ...fixture(), packageName: "../other" }),
  ).rejects.toThrow("valid unscoped npm package name");
});
