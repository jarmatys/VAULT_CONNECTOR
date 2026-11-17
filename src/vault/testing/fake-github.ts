// GitHub for the source tests: auth's fake sign-in (the user authorization, `/user`) and connections' fake App
// (installations, installation tokens, the repositories a token reaches) behind one `fetch`. The App asks the sign-in
// fake who holds a user token, so "the person who installed it" and "the person who authorized" are one fake user.
import { createFakeGithubProvider, type FakeGithubProvider, type FakeGithubUser } from "@softure-ai/auth/testing";
import { createFakeGithubApp, type FakeGithubApp, type FakeGithubAppOptions } from "@softure-ai/connections/testing";
import type { FetchFunction } from "@softure-ai/core";
import type { ConfiguredGithubSettings } from "../sources/github/link.ts";

const SIGN_IN_PATHS = new Set(["https://github.com/login/oauth/access_token", "https://api.github.com/user", "https://api.github.com/user/emails"]);

export interface FakeGithub {
  readonly app: FakeGithubApp;
  readonly signIn: FakeGithubProvider;
  readonly fetch: FetchFunction;
  readonly settings: ConfiguredGithubSettings;
}

export function createFakeGithub(options: Pick<FakeGithubAppOptions, "permissions" | "setupUrl"> = {}): FakeGithub {
  const signIn = createFakeGithubProvider();
  const fetchSignIn = signIn.fetch;
  const app = createFakeGithubApp({ ...options, slug: "vault-test-app", resolveUserId: (token) => resolveUserId(fetchSignIn, token) });
  const fetch: FetchFunction = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    return SIGN_IN_PATHS.has(`${url.origin}${url.pathname}`) ? signIn.fetch(input, init) : app.fetch(input, init);
  };
  const env = signIn.env;
  const clientId = Object.entries(env).find(([name]) => name.endsWith("_CLIENT_ID"))?.[1] ?? "";
  const clientSecret = Object.entries(env).find(([name]) => name.endsWith("_CLIENT_SECRET"))?.[1] ?? "";
  return {
    app,
    signIn,
    fetch,
    settings: { kind: "configured", appId: app.credentials.appId, slug: app.slug, privateKey: app.credentials.privateKey, clientId, clientSecret },
  };
}

/** A GitHub person of the fake sign-in. */
export function createGithubPerson(id: number, login: string): FakeGithubUser {
  return { id, login, emails: [{ email: `${login}@example.com` }] };
}

async function resolveUserId(fetch: FetchFunction, token: string): Promise<number | null> {
  const answer = await fetch("https://api.github.com/user", { method: "GET", headers: { authorization: `Bearer ${token}` } });
  if (!answer.ok) return null;
  const body: unknown = await answer.json();
  return typeof body === "object" && body !== null && "id" in body && typeof body.id === "number" ? body.id : null;
}
