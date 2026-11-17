// The outside services the app under test talks to, on one local port, for both hosts (playwright.config.ts):
//
// - a mail outbox sink: the app's fake mail provider POSTs each mail as one JSON line (`MAIL_OUTBOX_URL`), and the sink
//   appends it to the file the specs read (`MAIL_OUTBOX`); a Worker shares no disk with the test, so Node does the same;
// - a fake GitHub: `createFakeGithubProvider` of @softure-ai/auth over HTTP. The app's token exchange and API reads
//   arrive as `/<github host>/<path>` (`GH_AUTH_FAKE_ORIGIN`, src/auth/github-fetch.ts); the browser's visit to
//   GitHub's authorize page is routed by the spec to `/authorize`, which approves as the user in the query;
// - a fake GitHub App (the vault source): `createFakeGithubApp` of @softure-ai/connections with the run's key
//   (`GH_APP_PRIVATE_KEY`). The app sends the browser straight here for it (`/github.com/apps/...` and
//   `/github.com/login/oauth/authorize`), as the person signed in to the fake GitHub by the `fake_github_user` cookie a
//   spec sets on this origin (who they are and which repositories they pick); `/uninstall` removes their installations.
//   Every installed repository holds the fixture vault below, read through the fake's git data API.
//
// Plain Node, started by Playwright before the app.
import { appendFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createFakeGithubProvider } from "@softure-ai/auth/testing";
import { createFakeGithubApp } from "@softure-ai/connections/testing";
import { createFakeS3 } from "../src/vault/testing/fake-s3.ts";

const port = Number(process.env.FAKE_SERVICES_PORT);
const outbox = process.env.MAIL_OUTBOX;
const clientId = process.env.GH_AUTH_CLIENT_ID;
const clientSecret = process.env.GH_AUTH_CLIENT_SECRET;
const appId = Number(process.env.GH_APP_ID);
const appSlug = process.env.GH_APP_SLUG;
const appPrivateKey = process.env.GH_APP_PRIVATE_KEY;
const appSetupUrl = process.env.GH_APP_SETUP_URL;
if (!Number.isInteger(port) || port <= 0 || !outbox || !clientId || !clientSecret || !Number.isInteger(appId) || !appSlug || !appPrivateKey || !appSetupUrl) {
  console.error(
    "fake-services: set FAKE_SERVICES_PORT, MAIL_OUTBOX, GH_AUTH_CLIENT_ID, GH_AUTH_CLIENT_SECRET, GH_APP_ID, GH_APP_SLUG, GH_APP_PRIVATE_KEY and GH_APP_SETUP_URL",
  );
  process.exit(2);
}

const github = createFakeGithubProvider({ clientId, clientSecret, openSignUp: true });
const GITHUB_HOSTS = new Set(["github.com", "api.github.com"]);
/** What the sign-in fake answers; every other GitHub request is the App's. */
const SIGN_IN_PATHS = new Set(["github.com/login/oauth/access_token", "api.github.com/user", "api.github.com/user/emails"]);

const app = createFakeGithubApp({
  appId,
  slug: appSlug,
  privateKey: appPrivateKey,
  setupUrl: appSetupUrl,
  resolveUserId: async (token) => {
    const answered = await github.fetch("https://api.github.com/user", { method: "GET", headers: { authorization: `Bearer ${token}` } });
    if (!answered.ok) return null;
    const body = await answered.json();
    return typeof body?.id === "number" ? body.id : null;
  },
});
/** A fictional vault: three folders with notes (one nested), top-level notes, and what the picker never shows. */
const FIXTURE_VAULT = {
  "Welcome.md": "# Welcome\n",
  "Projects/Garden.md": "# Garden\nRaised beds, spring plan.\n",
  "Projects/Kitchen.md": "# Kitchen\n",
  "Projects/Archive/Old shed.md": "# Old shed\n",
  "Recipes/Bread.md": "# Bread\n",
  "Recipes/Soup.md": "# Soup\n",
  "Recipes/Board.excalidraw.md": "drawing\n",
  "Journal/2026-11-17.md": "# A Tuesday\n",
  "Attachments/plan.png": "not really a png\n",
  ".obsidian/app.json": "{}\n",
  ".trash/Deleted.md": "# Deleted\n",
};

/**
 * An S3-compatible bucket (VC-20) at `/s3`: the fixture vault under the folder `vaults/main`, readable with the one
 * key pair the specs type in. Path-style, so the endpoint the account enters is `<origin>/s3`.
 */
const s3 = createFakeS3({ bucket: process.env.E2E_S3_BUCKET, accessKeyId: process.env.E2E_S3_ACCESS_KEY_ID, secretAccessKey: process.env.E2E_S3_SECRET_ACCESS_KEY, basePath: "/s3" });
for (const [path, content] of Object.entries(FIXTURE_VAULT)) s3.put(`vaults/main/${path}`, content);

/**
 * The app's note store (VC-12) at `/store`: an empty, writable bucket where the sync keeps its copies, so a Worker, which
 * has no disk, syncs and indexes like Node. Its own key pair, apart from the vault bucket's read-only one.
 */
const store = createFakeS3({ bucket: process.env.E2E_STORE_BUCKET, accessKeyId: process.env.E2E_STORE_ACCESS_KEY_ID, secretAccessKey: process.env.E2E_STORE_SECRET_ACCESS_KEY, basePath: "/store", isWritable: true });
const buckets = [
  { path: "/s3", bucket: s3 },
  { path: "/store", bucket: store },
];

/** The installations made through `/install`, by the GitHub login that made them. */
const installationsByLogin = new Map();

/** The user a spec signs in as, from the `/authorize` query: `id`, `login`, `email`, optional `name` and `verified`. */
function readFakeUser(query) {
  const id = Number(query.get("id"));
  const login = query.get("login");
  const email = query.get("email");
  if (!Number.isInteger(id) || !login || !email) return null;
  return { id, login, name: query.get("name"), emails: [{ email, verified: query.get("verified") !== "0", primary: true }] };
}

/** A request's body as bytes, for the buckets (a stored copy is not always text). */
function readBytes(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

/** The person signed in to the fake GitHub in this browser: `{ id, login, email, repositories }` as base64url JSON. */
function readBrowserUser(request) {
  const cookie = (request.headers.cookie ?? "").split(/;\s*/).find((part) => part.startsWith("fake_github_user="));
  if (cookie === undefined) return null;
  try {
    const user = JSON.parse(Buffer.from(cookie.slice("fake_github_user=".length), "base64url").toString("utf8"));
    const isValid = Number.isInteger(user.id) && typeof user.login === "string" && typeof user.email === "string" && Array.isArray(user.repositories);
    return isValid ? user : null;
  } catch {
    return null;
  }
}

function refuse(response, message) {
  response.statusCode = 400;
  response.end(message);
}

async function answer(request, response) {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${String(port)}`);
  if (request.method === "GET" && url.pathname === "/health") return void response.end("ok");

  if (request.method === "POST" && url.pathname === "/outbox") {
    const line = JSON.stringify(JSON.parse(await readBody(request)));
    await appendFile(outbox, `${line}\n`, "utf8");
    response.statusCode = 204;
    return void response.end();
  }

  if (request.method === "GET" && url.pathname === "/authorize") {
    const user = readFakeUser(url.searchParams);
    const authorizeUrl = url.searchParams.get("url");
    if (user === null || authorizeUrl === null) {
      response.statusCode = 400;
      return void response.end("fake GitHub: /authorize needs url, id, login and email");
    }
    const callback = github.signIn(authorizeUrl, user, { deny: url.searchParams.get("deny") === "1" });
    response.statusCode = 302;
    response.setHeader("location", callback.toString());
    return void response.end();
  }

  const browserUser = readBrowserUser(request);
  if (request.method === "GET" && /^\/github\.com\/apps\/[^/]+\/installations\/new$/.test(url.pathname)) {
    if (browserUser === null) return refuse(response, "fake GitHub App: no fake_github_user cookie");
    const { id, login, repositories } = browserUser;
    const installUrl = `https://${url.pathname.slice(1)}${url.search}`;
    const setup = app.install(installUrl, { account: { login, id }, userIds: [id], repositories: repositories.map((fullName) => ({ fullName, files: FIXTURE_VAULT })) });
    installationsByLogin.set(login, [...(installationsByLogin.get(login) ?? []), Number(setup.searchParams.get("installation_id"))]);
    response.statusCode = 302;
    response.setHeader("location", setup.toString());
    return void response.end();
  }

  if (request.method === "GET" && url.pathname === "/github.com/login/oauth/authorize") {
    if (browserUser === null) return refuse(response, "fake GitHub: no fake_github_user cookie");
    const user = { id: browserUser.id, login: browserUser.login, emails: [{ email: browserUser.email, verified: true, primary: true }] };
    const callback = github.signIn(`https://github.com/login/oauth/authorize${url.search}`, user);
    response.statusCode = 302;
    response.setHeader("location", callback.toString());
    return void response.end();
  }

  if (request.method === "POST" && url.pathname === "/uninstall") {
    const login = url.searchParams.get("login") ?? "";
    for (const installationId of installationsByLogin.get(login) ?? []) app.uninstall(installationId);
    installationsByLogin.delete(login);
    response.statusCode = 204;
    return void response.end();
  }

  const target = buckets.find(({ path }) => url.pathname === path || url.pathname.startsWith(`${path}/`));
  if (target !== undefined) {
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await readBytes(request);
    const headers = Object.entries(request.headers).filter(([, value]) => typeof value === "string");
    const answered = await target.bucket.handle(new Request(url, { method: request.method, headers, body }));
    response.statusCode = answered.status;
    answered.headers.forEach((value, name) => response.setHeader(name, value));
    return void response.end(Buffer.from(await answered.arrayBuffer()));
  }

  const [, host, ...rest] = url.pathname.split("/");
  if (host !== undefined && GITHUB_HOSTS.has(host)) {
    const body = request.method === "POST" ? await readBody(request) : undefined;
    const headers = Object.fromEntries(Object.entries(request.headers).filter(([, value]) => typeof value === "string"));
    const path = `${host}/${rest.join("/")}`;
    const target = SIGN_IN_PATHS.has(path) ? github : app;
    const answered = await target.fetch(`https://${path}${url.search}`, { method: request.method, headers, body });
    response.statusCode = answered.status;
    answered.headers.forEach((value, name) => response.setHeader(name, value));
    return void response.end(await answered.text());
  }

  response.statusCode = 404;
  response.end();
}

createServer((request, response) => {
  answer(request, response).catch((error) => {
    console.error(`fake-services: ${request.method ?? "?"} ${request.url ?? "?"} failed: ${error instanceof Error ? error.message : String(error)}`);
    response.statusCode = 500;
    response.end();
  });
}).listen(port, "127.0.0.1");
