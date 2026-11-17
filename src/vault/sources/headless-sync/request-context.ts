// The sync link flow's context for a request: the request's database, the wall clock and the vault keyring from the
// environment (and, in end-to-end tests only, the loopback fake of the sync service, read by the settings).
import { systemClock } from "@softure-ai/core";
import { getRequestDatabase } from "../../../auth/module-context.ts";
import { readHeadlessSyncSourceSettings } from "../../settings.ts";
import type { HeadlessSyncLinkContext } from "./link.ts";

/** The context, or null when this instance has no keyring for the session and the key. */
export async function getHeadlessSyncLinkContext(): Promise<HeadlessSyncLinkContext | null> {
  const settings = readHeadlessSyncSourceSettings(process.env);
  if (settings.kind === "unconfigured") return null;
  return { db: await getRequestDatabase(), clock: systemClock, settings };
}
