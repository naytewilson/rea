import { describe, expect, it } from "vitest";

import { createAnalysisExecution } from "../../../src/application/AnalysisProvider.js";
import {
  REA_WORKFLOW_PROVIDER,
  workflowAnalysisProfile,
} from "../../../src/application/InvestigationProviders.js";
import { createEvidence } from "../../../src/domain/evidence.js";
import { ok } from "../../../src/domain/result.js";
import {
  createBinarySessionTargets,
  createCacheProvider,
  createTestBinarySession,
} from "../../fixtures/binarySession.js";

const parameters = { address: "0x1000", document: "fixture" };

/** Edit a consumer-owned payload without replacing its enclosing execution. */
const editPayload = (payload: unknown): void => {
  if (typeof payload !== "object" || payload === null)
    throw new Error("Expected an object result");
  const nested: unknown = Reflect.get(payload, "nested");
  if (typeof nested !== "object" || nested === null)
    throw new Error("Expected a nested result");
  Reflect.set(nested, "name", "consumer edit");
};

describe("session snapshot ownership", () => {
  it.each(["result", "rawResult"] as const)(
    "keeps provider replay and exports stable after a caller edits %s",
    async (field) => {
      const [target] = await createBinarySessionTargets();
      const provider = createCacheProvider([]);
      const capabilities = provider.capabilities();
      provider.capabilities = () =>
        capabilities
          .filter((entry) => entry.operation === "address_name")
          .map((entry) => ({
            ...entry,
            operation: "procedure_info" as const,
            effects: { ...entry.effects, mutatesArtifact: false },
          }));
      let providerCalls = 0;
      provider.createClient = (subject) => ({
        execute: (operation) => {
          if (operation !== "health") providerCalls += 1;
          return Promise.resolve(
            ok(
              createAnalysisExecution(
                { nested: { name: "original" } },
                provider.identity(),
                {
                  subject,
                  rawResult: { nested: { name: "raw original" } },
                },
              ),
            ),
          );
        },
        close: () => Promise.resolve(ok(null)),
      });
      const session = createTestBinarySession(provider);
      try {
        expect((await session.open(target)).ok).toBe(true);
        const first = await session.execute("procedure_info", parameters);
        if (!first.ok) throw first.error;
        const before = session.exportAnalysisSnapshot();
        if (!before.ok) throw before.error;

        editPayload(first.value[field]);

        const replay = await session.execute("procedure_info", parameters);
        if (!replay.ok) throw replay.error;
        expect(replay.value.result).toEqual({ nested: { name: "original" } });
        expect(replay.value.rawResult).toEqual({
          nested: { name: "raw original" },
        });
        expect(providerCalls).toBe(1);
        expect(session.exportAnalysisSnapshot()).toEqual(before);
      } finally {
        await session.close();
      }
    },
  );

  it.each(["result", "rawResult", "profile"] as const)(
    "owns a workflow snapshot independently of its caller's %s",
    async (field) => {
      const [path] = await createBinarySessionTargets();
      const session = createTestBinarySession(createCacheProvider([]));
      try {
        expect((await session.open(path)).ok).toBe(true);
        const target = session.activeTarget();
        const profile = session.analysisProfile();
        if (target === undefined || profile === undefined)
          throw new Error("Expected a bound target and profile");
        const execution = {
          ...createAnalysisExecution(
            { nested: { name: "original" } },
            REA_WORKFLOW_PROVIDER,
            {
              subject: target,
              rawResult: { nested: { name: "raw original" } },
            },
          ),
          analysisProfile: workflowAnalysisProfile(profile),
        };
        const evidence = createEvidence(target, execution.provider, {
          operation: "analyze_function",
          confidence: "derived",
          parameters,
          result: execution.result,
          rawResult: execution.rawResult,
          analysisProfile: execution.analysisProfile,
          limitations: execution.limitations,
          locations: execution.locations,
        });
        expect(session.recordEvidence(evidence).ok).toBe(true);
        expect(
          session.recordWorkflowSnapshot({
            operation: "analyze_function",
            parameters,
            execution,
          }).ok,
        ).toBe(true);
        const before = session.exportAnalysisSnapshot();
        if (!before.ok) throw before.error;

        if (field === "profile")
          Reflect.set(
            execution.analysisProfile.provider,
            "name",
            "consumer edit",
          );
        else editPayload(execution[field]);

        expect(session.exportAnalysisSnapshot()).toEqual(before);
      } finally {
        await session.close();
      }
    },
  );
});
