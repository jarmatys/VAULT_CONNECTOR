// Agent discovery (VC-17): see src/docs/agent-ready-routes.ts.
import { agentReadyRoutes } from "../../../../docs/agent-ready-routes.ts";

export const dynamic = "force-dynamic";

export const GET = agentReadyRoutes.serveAgentSkillsIndex;
