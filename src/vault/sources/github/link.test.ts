// The link flow end to end against fake GitHub: install, setup redirect, user authorization, callback; and the checks
// that refuse a link (someone else's installation id, a used or foreign state, more than one repository, write access)
// and that notice a removed installation later.
import { auth } from "@softure-ai/auth";
import { createTestAccount } from "@softure-ai/auth/testing";
import { createTestClock, type TestClock } from "@softure-ai/core";
import { createTestDatabase, type TestDatabase } from "@softure-ai/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vault } from "../../module.ts";
import { createFakeGithub, createGithubPerson, type FakeGithub } from "../../testing/fake-github.ts";
import { findSource } from "../store.ts";
import {
  checkGithubSource,
  completeGithubLink,
  continueGithubLink,
  createAccountGithubSource,
  GITHUB_CALLBACK_PATH,
  isSourceCheckDue,
  SOURCE_CHECK_INTERVAL_MS,
  startGithubLink,
  type GithubLinkContext,
} from "./link.ts";

const APP_ORIGIN = "https://app.example.com";
const ALICE = createGithubPerson(1001, "alice");
const MALLORY = createGithubPerson(2002, "mallory");
const NOTES = { id: 501, fullName: "alice/notes", defaultBranch: "main" };

let database: TestDatabase;
let clock: TestClock;
let github: FakeGithub;
let ctx: GithubLinkContext;
let aliceId: string;
let malloryId: string;

beforeEach(async () => {
  database = await createTestDatabase([auth(), vault()]);
  clock = createTestClock(new Date("2026-11-17T12:00:00Z"));
  github = createFakeGithub({ setupUrl: `${APP_ORIGIN}/panel/source/github/setup` });
  ctx = { db: database.db, clock, settings: github.settings, appOrigin: APP_ORIGIN, fetch: github.fetch };
  aliceId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
  malloryId = (await createTestAccount(database.db, { email: "mallory@example.com", password: "a long test password" })).id;
});

afterEach(async () => {
  await database.close();
});

/** Steps 1 and 2: the account starts, the person installs the App on `repositories`, GitHub redirects to setup. */
async function installAs(userId: string, person: typeof ALICE, repositories = [NOTES]) {
  const installUrl = await startGithubLink(ctx, userId);
  const setup = github.app.install(installUrl.toString(), { account: { login: person.login, id: person.id }, userIds: [person.id], repositories });
  return { setup, installationId: Number(setup.searchParams.get("installation_id")) };
}

function setupParams(setup: URL) {
  return { state: setup.searchParams.get("state"), installationId: setup.searchParams.get("installation_id"), setupAction: setup.searchParams.get("setup_action") };
}

/** Step 3: the person authorizes the App; answers the callback's parameters. */
function authorizeAs(authorizeUrl: URL, person: typeof ALICE) {
  const callback = github.signIn.signIn(authorizeUrl.toString(), person);
  return { state: callback.searchParams.get("state"), code: callback.searchParams.get("code"), error: callback.searchParams.get("error") };
}

async function linkAs(userId: string, person: typeof ALICE, repositories = [NOTES]) {
  const { setup } = await installAs(userId, person, repositories);
  const authorize = await continueGithubLink(ctx, userId, setupParams(setup));
  if (!authorize.ok) throw new Error(`setup refused: ${authorize.error}`);
  return completeGithubLink(ctx, userId, authorizeAs(authorize.value, person));
}

describe("linking an account to a repository", () => {
  it("saves the one repository of an installation the person authorized", async () => {
    const linked = await linkAs(aliceId, ALICE);

    expect(linked.ok).toBe(true);
    const source = await findSource(database.db, aliceId);
    expect(source).toMatchObject({ kind: "github", status: "connected", repositoryId: 501, repositoryFullName: "alice/notes", defaultBranch: "main" });
    expect(await findSource(database.db, malloryId)).toBeNull();
  });

  it("sends the browser to the App's install page with a state, then to the authorization with PKCE", async () => {
    const installUrl = await startGithubLink(ctx, aliceId);
    expect(`${installUrl.origin}${installUrl.pathname}`).toBe("https://github.com/apps/vault-test-app/installations/new");
    expect(installUrl.searchParams.get("state")).toMatch(/^[\w-]{43}$/);

    const { setup } = await installAs(aliceId, ALICE);
    const authorize = await continueGithubLink(ctx, aliceId, setupParams(setup));
    if (!authorize.ok) throw new Error(authorize.error);
    expect(authorize.value.searchParams.get("redirect_uri")).toBe(`${APP_ORIGIN}${GITHUB_CALLBACK_PATH}`);
    expect(authorize.value.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.value.searchParams.get("state")).toBe(setup.searchParams.get("state"));
  });

  it("refuses an installation id that belongs to someone else", async () => {
    const { installationId: alicesInstallation } = await installAs(aliceId, ALICE);
    const installUrl = await startGithubLink(ctx, malloryId);
    const state = installUrl.searchParams.get("state");

    const authorize = await continueGithubLink(ctx, malloryId, { state, installationId: String(alicesInstallation), setupAction: "install" });
    if (!authorize.ok) throw new Error(authorize.error);
    const linked = await completeGithubLink(ctx, malloryId, authorizeAs(authorize.value, MALLORY));

    expect(linked).toEqual({ ok: false, error: "vault.link_not_yours" });
    expect(await findSource(database.db, malloryId)).toBeNull();
  });

  it("refuses another account's state at setup and at the callback", async () => {
    const { setup } = await installAs(aliceId, ALICE);

    expect(await continueGithubLink(ctx, malloryId, setupParams(setup))).toEqual({ ok: false, error: "vault.link_expired" });
    const authorize = await continueGithubLink(ctx, aliceId, setupParams(setup));
    if (!authorize.ok) throw new Error(authorize.error);
    const callback = authorizeAs(authorize.value, ALICE);
    expect(await completeGithubLink(ctx, malloryId, callback)).toEqual({ ok: false, error: "vault.link_expired" });
  });

  it("uses a state once and only for ten minutes", async () => {
    const { setup } = await installAs(aliceId, ALICE);
    const authorize = await continueGithubLink(ctx, aliceId, setupParams(setup));
    if (!authorize.ok) throw new Error(authorize.error);
    expect(await continueGithubLink(ctx, aliceId, setupParams(setup))).toEqual({ ok: false, error: "vault.link_expired" });

    const callback = authorizeAs(authorize.value, ALICE);
    expect((await completeGithubLink(ctx, aliceId, callback)).ok).toBe(true);
    expect(await completeGithubLink(ctx, aliceId, callback)).toEqual({ ok: false, error: "vault.link_expired" });

    const late = await installAs(aliceId, ALICE);
    clock.advance(10 * 60 * 1000);
    expect(await continueGithubLink(ctx, aliceId, setupParams(late.setup))).toEqual({ ok: false, error: "vault.link_expired" });
  });

  it("refuses a callback without the setup step", async () => {
    const installUrl = await startGithubLink(ctx, aliceId);
    const linked = await completeGithubLink(ctx, aliceId, { state: installUrl.searchParams.get("state"), code: "any", error: null });
    expect(linked).toEqual({ ok: false, error: "vault.link_expired" });
  });

  it("refuses an installation with more than one repository", async () => {
    const linked = await linkAs(aliceId, ALICE, [NOTES, { id: 502, fullName: "alice/other", defaultBranch: "main" }]);
    expect(linked).toEqual({ ok: false, error: "vault.link_one_repository" });
  });

  it("refuses an App that can write to contents", async () => {
    github = createFakeGithub({ permissions: { contents: "write", metadata: "read" }, setupUrl: `${APP_ORIGIN}/panel/source/github/setup` });
    ctx = { ...ctx, settings: github.settings, fetch: github.fetch };
    expect(await linkAs(aliceId, ALICE)).toEqual({ ok: false, error: "vault.link_permissions" });
  });

  it("names a declined authorization and an installation waiting for approval", async () => {
    const { setup } = await installAs(aliceId, ALICE);
    expect(await continueGithubLink(ctx, aliceId, { ...setupParams(setup), setupAction: "request" })).toEqual({ ok: false, error: "vault.link_pending_approval" });
    const authorize = await continueGithubLink(ctx, aliceId, setupParams(setup));
    if (!authorize.ok) throw new Error(authorize.error);
    const callback = github.signIn.signIn(authorize.value.toString(), ALICE, { deny: true });
    const linked = await completeGithubLink(ctx, aliceId, { state: callback.searchParams.get("state"), code: null, error: callback.searchParams.get("error") });
    expect(linked).toEqual({ ok: false, error: "vault.link_denied" });
  });
});

describe("checking a saved link", () => {
  it("stays connected while the installation reaches the repository", async () => {
    const linked = await linkAs(aliceId, ALICE);
    if (!linked.ok) throw new Error(linked.error);
    clock.advance(60_000);

    const checked = await checkGithubSource(ctx, aliceId, linked.value);
    expect(checked).toMatchObject({ status: "connected", disconnectedAt: null });
    expect(checked.checkedAt).toEqual(clock.now());
  });

  it("marks the source disconnected when the installation is removed", async () => {
    const linked = await linkAs(aliceId, ALICE);
    if (!linked.ok) throw new Error(linked.error);
    github.app.uninstall(linked.value.installationId);

    expect(await checkGithubSource(ctx, aliceId, linked.value)).toMatchObject({ status: "disconnected", disconnectedAt: clock.now() });
  });

  it("marks the source disconnected when the repository leaves the installation", async () => {
    const linked = await linkAs(aliceId, ALICE);
    if (!linked.ok) throw new Error(linked.error);
    github.app.setRepositories(linked.value.installationId, [{ id: 777, fullName: "alice/elsewhere" }]);

    expect(await checkGithubSource(ctx, aliceId, linked.value)).toMatchObject({ status: "disconnected" });
  });

  it("keeps the stored status while GitHub is unavailable", async () => {
    const linked = await linkAs(aliceId, ALICE);
    if (!linked.ok) throw new Error(linked.error);
    github.app.failNext("unavailable");

    expect(await checkGithubSource(ctx, aliceId, linked.value)).toEqual(linked.value);
  });

  it("is due once a minute, so reloading the screen does not spend the App's rate limit", async () => {
    const linked = await linkAs(aliceId, ALICE);
    if (!linked.ok) throw new Error(linked.error);
    expect(isSourceCheckDue(linked.value, clock.now())).toBe(false);
    clock.advance(SOURCE_CHECK_INTERVAL_MS - 1);
    expect(isSourceCheckDue(linked.value, clock.now())).toBe(false);
    clock.advance(1);
    expect(isSourceCheckDue(linked.value, clock.now())).toBe(true);
  });

  it("reads the repository through a token of that repository only", async () => {
    const linked = await linkAs(aliceId, ALICE);
    if (!linked.ok) throw new Error(linked.error);
    const source = createAccountGithubSource(ctx, linked.value);
    github.app.uninstall(linked.value.installationId);

    expect(await source.getCursor()).toMatchObject({ ok: false, error: "source.disconnected" });
  });
});
