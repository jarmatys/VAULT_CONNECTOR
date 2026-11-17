// GET /api/privacy/export: the signed-in account's data as a JSON download (@softure-ai/privacy; every module's part,
// the vault's and the connector's among them). 401 without a session, 429 over the `privacy-export` limit.
export { exportRoute as GET } from "@softure-ai/privacy/next";

export const dynamic = "force-dynamic";
