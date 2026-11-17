// The app's proxy: the auth guard sends a visitor without a session cookie from the panel and the admin pages to the
// login page, with the page as `next`. It reads only the cookie; the panel layout checks the session itself.
import { createAuthGuard } from "@softure-ai/auth/proxy";
import { NextResponse, type NextRequest } from "next/server";
import softureConfig from "../softure.config.ts";
import { ADMIN_PATH, PANEL_PATH } from "./panel-paths.ts";

const guard = createAuthGuard(softureConfig, { protect: [PANEL_PATH, ADMIN_PATH] });

export function proxy(request: NextRequest): Response {
  return guard(request) ?? NextResponse.next();
}

// Static files and the health checks never need the guard.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"] };
