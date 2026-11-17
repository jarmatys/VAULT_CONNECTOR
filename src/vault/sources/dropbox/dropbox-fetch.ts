// The `fetch` Dropbox calls go through. In production it is the platform's own; end-to-end tests point Dropbox's API,
// content and consent hosts at a local fake (`DROPBOX_FAKE_ORIGIN`, loopback only), because the server under test
// cannot reach a Dropbox that knows the test's accounts.
import type { FetchFunction } from "@softure-ai/core";

/** The Dropbox hosts; each maps to a path prefix on the fake (`<origin>/dropbox/<host>/...`). */
export const DROPBOX_HOSTS: ReadonlySet<string> = new Set(["www.dropbox.com", "api.dropboxapi.com", "content.dropboxapi.com"]);

/** The fake's origin for one Dropbox host, as the browser and the server reach it. */
export function toDropboxFakeOrigin(fakeOrigin: string, host: string): string {
  return `${fakeOrigin}/dropbox/${host}`;
}

/** A `fetch` that sends requests for Dropbox's hosts to the fake and every other request on unchanged. */
export function createDropboxFakeFetch(fakeOrigin: string, fetchImpl: FetchFunction = (input, init) => fetch(input, init)): FetchFunction {
  return (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    if (url.protocol !== "https:" || !DROPBOX_HOSTS.has(url.hostname)) return fetchImpl(input, init);
    return fetchImpl(`${toDropboxFakeOrigin(fakeOrigin, url.hostname)}${url.pathname}${url.search}`, init);
  };
}
