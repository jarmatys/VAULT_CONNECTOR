// The context the auth server functions take, for the app's own pages: the registered config, the request's database
// handle and the wall clock (as auth's own pages build it).
import { systemClock, type ModuleContext } from "@softure-ai/core";
import { getSoftureConfig } from "@softure-ai/core/next";
import type { Queryable } from "@softure-ai/db";
import { getConfiguredDatabase } from "@softure-ai/db/request";

export async function getModuleContext(): Promise<ModuleContext> {
  const config = getSoftureConfig();
  if (config.database === null) throw new Error("Reading the module context: softure.config.ts has no database");
  const { db } = await getConfiguredDatabase(config.database);
  return { db, clock: systemClock, config };
}

/** The request's database handle, typed for the app's own queries (the module context carries it untyped). */
export async function getRequestDatabase(): Promise<Queryable> {
  const config = getSoftureConfig();
  if (config.database === null) throw new Error("Reading the request database: softure.config.ts has no database");
  return (await getConfiguredDatabase(config.database)).db;
}
