import type { FetchFunction } from "@softure-ai/core";
import { describe, expect, it, vi } from "vitest";
import { createGithubFakeFetch } from "./github-fetch.ts";

const FAKE = "http://127.0.0.1:3199";

function createRecorder(): { fetchImpl: FetchFunction; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchFunction = vi.fn((input: string | URL) => {
    calls.push(String(input));
    return Promise.resolve(new Response("{}"));
  });
  return { fetchImpl, calls };
}

describe("createGithubFakeFetch", () => {
  it("sends GitHub's token endpoint and API reads to the fake under a path named after the host", async () => {
    const { fetchImpl, calls } = createRecorder();
    const fakeFetch = createGithubFakeFetch(FAKE, fetchImpl);
    await fakeFetch("https://github.com/login/oauth/access_token", { method: "POST" });
    await fakeFetch(new URL("https://api.github.com/user/emails?per_page=100"), { method: "GET" });
    expect(calls).toEqual([`${FAKE}/github.com/login/oauth/access_token`, `${FAKE}/api.github.com/user/emails?per_page=100`]);
  });

  it("passes the request options through unchanged", async () => {
    const { fetchImpl } = createRecorder();
    const init: RequestInit = { method: "POST", headers: { accept: "application/json" }, body: "code=abc" };
    await createGithubFakeFetch(FAKE, fetchImpl)("https://github.com/login/oauth/access_token", init);
    expect(fetchImpl).toHaveBeenCalledWith(`${FAKE}/github.com/login/oauth/access_token`, init);
  });

  it("leaves every other request alone, plain http to GitHub's hosts included", async () => {
    const { fetchImpl, calls } = createRecorder();
    const fakeFetch = createGithubFakeFetch(FAKE, fetchImpl);
    await fakeFetch("https://accounts.example.com/token", {});
    await fakeFetch("http://github.com/login/oauth/access_token", {});
    expect(calls).toEqual(["https://accounts.example.com/token", "http://github.com/login/oauth/access_token"]);
  });
});
