// The `fetch` GitHub sign-in calls go through. In production it is the platform's own; end-to-end tests point the
// token exchange and the two API reads at a local fake GitHub (`githubFakeOrigin`, loopback only), because the server
// under test cannot reach a GitHub that knows the test's accounts.
import type { FetchFunction } from "@softure-ai/core";

/** The GitHub hosts the sign-in calls; each maps to a path prefix on the fake (`<origin>/github.com/...`). */
const GITHUB_HOSTS: ReadonlySet<string> = new Set(["github.com", "api.github.com"]);

/**
 * A `fetch` that sends requests for GitHub's hosts to the fake at `fakeOrigin` (`https://api.github.com/user` becomes
 * `<fakeOrigin>/api.github.com/user`) and every other request on unchanged.
 */
export function createGithubFakeFetch(fakeOrigin: string, fetchImpl: FetchFunction = (input, init) => fetch(input, init)): FetchFunction {
  return (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    if (url.protocol !== "https:" || !GITHUB_HOSTS.has(url.hostname)) return fetchImpl(input, init);
    return fetchImpl(`${fakeOrigin}/${url.hostname}${url.pathname}${url.search}`, init);
  };
}
