// The `fetch` the sync service's account API goes through. In production it is the platform's own; end-to-end tests
// point the API host at a local fake (`HEADLESS_SYNC_FAKE_ORIGIN`, loopback only), because the server under test cannot
// reach a service that knows the test's accounts.
import type { FetchFunction } from "@softure-ai/core";
import { SYNC_API_ORIGIN } from "./sync-api.ts";

const API_HOST = new URL(SYNC_API_ORIGIN).hostname;

/** The fake's path for the API host: `<origin>/headless-sync/<api host>/...`. */
export function toHeadlessSyncFakeApiOrigin(fakeOrigin: string): string {
  return `${fakeOrigin}/headless-sync/${API_HOST}`;
}

/** A `fetch` that sends requests for the service's API host to the fake and every other request on unchanged. */
export function createHeadlessSyncFakeFetch(fakeOrigin: string, fetchImpl: FetchFunction = (input, init) => fetch(input, init)): FetchFunction {
  return (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    if (url.protocol !== "https:" || url.hostname !== API_HOST) return fetchImpl(input, init);
    return fetchImpl(`${toHeadlessSyncFakeApiOrigin(fakeOrigin)}${url.pathname}${url.search}`, init);
  };
}
