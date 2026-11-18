// The cookieless funnel per day, for the operator: `npm run funnel -- --days=7` (default 1, today). Read only; it
// connects with DATABASE_URL, as the app does, and prints one row per day.
import { formatFunnelDays, getFunnelDays } from "@softure-ai/analytics/server";
import { systemClock } from "@softure-ai/core";
import { createDatabase } from "@softure-ai/db";
import config from "../softure.config.ts";

const USAGE = "usage: npm run funnel -- [--days=<1..3660>]";

function readDays(argv: readonly string[]): number | null {
  if (argv.length === 0) return 1;
  const match = argv.length === 1 ? /^--days=(\d+)$/.exec(argv[0] ?? "") : null;
  return match === null ? null : Number(match[1]);
}

async function main(): Promise<number> {
  const days = readDays(process.argv.slice(2));
  if (days === null) {
    console.error(USAGE);
    return 2;
  }
  if (config.database === null) throw new Error("funnel-report: softure.config.ts has no database");
  const database = await createDatabase(config.database.url, { max: 1 });
  try {
    console.log(formatFunnelDays(await getFunnelDays({ db: database.db, clock: systemClock, config }, { days })));
    return 0;
  } finally {
    await database.close();
  }
}

process.exitCode = await main();
