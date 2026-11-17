// The Dropbox link flow's context for a request: the request's database, the wall clock, the product's Dropbox app
// from the environment, the configured public origin (never a request header) and, in end-to-end tests only, the
// loopback fake of Dropbox for both the server's calls and the browser's visit to the consent page.
import { systemClock } from "@softure-ai/core";
import { getSoftureConfig } from "@softure-ai/core/next";
import { getRequestDatabase } from "../../../auth/module-context.ts";
import { readDropboxFakeOrigin, readDropboxSourceSettings } from "../../settings.ts";
import { createDropboxFakeFetch, toDropboxFakeOrigin } from "./dropbox-fetch.ts";
import type { DropboxLinkContext } from "./link.ts";

/** The context, or null when this instance has no Dropbox app or no keyring for the refresh token. */
export async function getDropboxLinkContext(): Promise<DropboxLinkContext | null> {
  const settings = readDropboxSourceSettings(process.env);
  if (settings.kind === "unconfigured") return null;
  const db = await getRequestDatabase();
  const fakeOrigin = readDropboxFakeOrigin(process.env);
  return {
    db,
    clock: systemClock,
    settings,
    appOrigin: getSoftureConfig().appOrigin,
    ...(fakeOrigin === undefined ? {} : { fetch: createDropboxFakeFetch(fakeOrigin), webOrigin: toDropboxFakeOrigin(fakeOrigin, "www.dropbox.com") }),
  };
}
