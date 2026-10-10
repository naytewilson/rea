import { describe, expect, it } from "vitest";

import {
  createBinarySessionTargets,
  createCacheProvider,
  createTestBinarySession,
} from "../../fixtures/binarySession.js";
import { parseBinaryTarget } from "../../../src/application/BinaryTargetResolver.js";

describe("session target ownership", () => {
  it.each(["open", "reopen", "resolved"] as const)(
    "does not expose active artifact identity through the %s result",
    async (mode) => {
      const [path] = await createBinarySessionTargets();
      const session = createTestBinarySession(createCacheProvider([]));
      try {
        const first = await session.open(path);
        if (!first.ok) throw first.error;
        const expected = session.activeTarget();
        const preview = await session.previewTarget(first.value);
        if (!preview.ok) throw preview.error;
        const opened =
          mode === "open"
            ? first
            : mode === "reopen"
              ? await session.open(path)
              : await session.openResolvedTarget(preview.value);
        if (!opened.ok) throw opened.error;

        Reflect.set(opened.value, "path", `${path}.consumer-copy`);
        Reflect.set(opened.value, "sha256", "0".repeat(64));

        expect(session.activeTarget()).toEqual(expected);
        const result = await session.execute("address_name", {
          address: "0x1000",
          document: "fixture",
        });
        if (!result.ok) throw result.error;
        expect(result.value.subject).toMatchObject({
          path,
          sha256: expected?.sha256,
        });
        expect(session.exportAnalysisSnapshot().ok).toBe(true);
      } finally {
        await session.close();
      }
    },
  );

  it("owns the previewed target after admitting a resolved open", async () => {
    const [path] = await createBinarySessionTargets();
    const session = createTestBinarySession(createCacheProvider([]));
    try {
      const parsed = await parseBinaryTarget(path);
      if (!parsed.ok) throw parsed.error;
      const preview = await session.previewTarget(parsed.value);
      if (!preview.ok) throw preview.error;
      expect((await session.openResolvedTarget(preview.value)).ok).toBe(true);
      const expected = session.activeTarget();

      Reflect.set(preview.value.target, "path", `${path}.consumer-copy`);
      Reflect.set(preview.value.target, "sha256", "0".repeat(64));

      expect(session.activeTarget()).toEqual(expected);
      expect(session.exportAnalysisSnapshot().ok).toBe(true);
    } finally {
      await session.close();
    }
  });
});
