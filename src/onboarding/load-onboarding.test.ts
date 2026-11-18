import type { ModuleContext } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { issueAccessToken, verifyAccessToken } from "@softure-ai/mcp-access/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import config from "../../softure.config.ts";
import { createFakeEmbedder, createVaultFixture, type VaultFixture } from "../mcp/testing/vault-fixture.ts";
import { loadOnboarding } from "./load-onboarding.ts";

const VAULT = {
  "Recipes/Bread.md": "# Bread\nFlour, water, salt.\n",
  "Recipes/Soup.md": "# Soup\nLeeks and potatoes.\n",
  "Journal/2026-11-17.md": "# Monday\nA quiet day.\n",
};
const MODEL = "fake";

let fixture: VaultFixture;
let ctx: ModuleContext<Queryable>;

beforeAll(async () => {
  fixture = await createVaultFixture();
  ctx = { db: fixture.database.db, clock: fixture.clock, config };
});

afterAll(async () => {
  await fixture.close();
});

describe("loadOnboarding", () => {
  it("reads nothing done for a new account", async () => {
    const userId = await fixture.createAccount("new@example.test");

    const loaded = await loadOnboarding(ctx, { userId, model: MODEL });

    expect(loaded.facts).toEqual({
      hasSource: false,
      sharedFolders: 0,
      sync: "none",
      notes: 0,
      indexed: 0,
      hasIndexFailure: false,
      isAssistantConnected: false,
    });
    expect([loaded.latestRun, loaded.progress]).toEqual([null, null]);
  });

  it("reads a connected source with no folder shared yet", async () => {
    const userId = await fixture.createAccount("source@example.test");
    await fixture.connect(userId, VAULT);

    const { facts } = await loadOnboarding(ctx, { userId, model: MODEL });

    expect([facts.hasSource, facts.sharedFolders, facts.sync]).toEqual([true, 0, "none"]);
  });

  it("reads the shared folders, the finished copy and the searchable notes", async () => {
    const userId = await fixture.createAccount("synced@example.test");
    await fixture.connect(userId, VAULT, ["Recipes"]);

    const loaded = await loadOnboarding(ctx, { userId, model: createFakeEmbedder().modelId });

    expect(loaded.facts).toMatchObject({ hasSource: true, sharedFolders: 1, sync: "succeeded", notes: 2, indexed: 2, hasIndexFailure: false });
    expect(loaded.latestRun?.status).toBe("succeeded");
    expect((await loadOnboarding(ctx, { userId, model: "another-model" })).facts.indexed).toBe(0);
  });

  it("counts an assistant only once its token has reached the server", async () => {
    const userId = await fixture.createAccount("assistant@example.test");
    await fixture.connect(userId, VAULT, ["Journal"]);
    const issued = await issueAccessToken(ctx, { userId, name: "CLI", canWrite: false });
    if (!issued.ok) throw new Error(issued.error);

    expect((await loadOnboarding(ctx, { userId, model: MODEL })).facts.isAssistantConnected).toBe(false);

    expect(await verifyAccessToken(ctx, issued.value.token)).not.toBeNull();
    expect((await loadOnboarding(ctx, { userId, model: MODEL })).facts.isAssistantConnected).toBe(true);
  });
});
