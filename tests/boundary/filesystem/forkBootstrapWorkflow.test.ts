import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const workflowPath = join(root, ".github/workflows/fork-bootstrap.yml");

describe("independent fork bootstrap workflow", () => {
  it("uses a deliberately dispatched, commit-pinned release", async () => {
    const workflow = YAML.parse(await readFile(workflowPath, "utf8"));
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.on.workflow_dispatch.inputs.source_sha.required).toBe(true);
    expect(workflow.jobs.publish.permissions).toEqual({
      contents: "write",
      "id-token": "write",
    });
    const steps = workflow.jobs.publish.steps;
    const admission = steps.find((step: { name?: string }) =>
      step.name?.includes("Require exact source"),
    );
    expect(admission.run).toContain('"refs/heads/main"');
    expect(admission.run).toContain('"naytewilson/rea"');
    expect(admission.run).toContain('"${SOURCE_SHA}" != "${GITHUB_SHA}"');
    expect(admission.run).toContain('p.name !== "rea-agents-nayte"');
  });

  it("checks published immutable npm provenance before MCP publishing and release tags", async () => {
    const workflow = YAML.parse(await readFile(workflowPath, "utf8"));
    const steps: Array<{ name?: string; run?: string }> =
      workflow.jobs.publish.steps;
    const publisher = steps.findIndex((step) =>
      step.name?.includes("Publish npm"),
    );
    const canary = steps.findIndex((step) =>
      step.name?.includes("Verify published provenance"),
    );
    const mcp = steps.findIndex((step) =>
      step.name?.includes("Publish or recover independent MCP"),
    );
    const mcpVerified = steps.findIndex((step) =>
      step.name?.includes("Require public MCP"),
    );
    const release = steps.findIndex((step) =>
      step.name?.includes("Create source-pinned tag"),
    );
    expect(publisher).toBeGreaterThan(0);
    expect(publisher).toBeLessThan(canary);
    expect(canary).toBeLessThan(mcp);
    expect(mcp).toBeLessThan(mcpVerified);
    expect(mcpVerified).toBeLessThan(release);
    expect(steps[publisher]?.run).toContain(
      "node scripts/verify-unclaimed-release.mjs",
    );
    expect(steps[publisher]?.run).toContain(
      "npm publish --access public --provenance",
    );
    expect(steps[publisher]?.run).toContain('"${GITHUB_SHA}"');
    expect(steps[canary]?.run).toContain(
      "verify-existing-published-release.mjs",
    );
    expect(steps[mcp]?.run).toContain("mcp-publisher login github-oidc");
    expect(steps[release]?.run).toContain('"${actual}" != "${GITHUB_SHA}"');
  });

  it("uses the current package name for real recorded-crash installation", async () => {
    const manifest = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    );
    const workflow = await readFile(
      join(root, ".github/workflows/real-recorded-crash.yml"),
      "utf8",
    );
    expect(workflow).toContain(
      "node_modules/" + manifest.name + "/scripts/rea.mjs",
    );
  });
});
