// The outside services the app under test talks to, on one local port, for both hosts (playwright.config.ts):
//
// - a mail outbox sink: the app's fake mail provider POSTs each mail as one JSON line (`MAIL_OUTBOX_URL`), and the sink
//   appends it to the file the specs read (`MAIL_OUTBOX`); a Worker shares no disk with the test, so Node does the same;
// - a fake GitHub: `createFakeGithubProvider` of @softure-ai/auth over HTTP. The app's token exchange and API reads
//   arrive as `/<github host>/<path>` (`GH_AUTH_FAKE_ORIGIN`, src/auth/github-fetch.ts); the browser's visit to
//   GitHub's authorize page is routed by the spec to `/authorize`, which approves as the user in the query.
//
// Plain Node, started by Playwright before the app.
import { appendFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createFakeGithubProvider } from "@softure-ai/auth/testing";

const port = Number(process.env.FAKE_SERVICES_PORT);
const outbox = process.env.MAIL_OUTBOX;
const clientId = process.env.GH_AUTH_CLIENT_ID;
const clientSecret = process.env.GH_AUTH_CLIENT_SECRET;
if (!Number.isInteger(port) || port <= 0 || !outbox || !clientId || !clientSecret) {
  console.error("fake-services: set FAKE_SERVICES_PORT, MAIL_OUTBOX, GH_AUTH_CLIENT_ID and GH_AUTH_CLIENT_SECRET");
  process.exit(2);
}

const github = createFakeGithubProvider({ clientId, clientSecret, openSignUp: true });
const GITHUB_HOSTS = new Set(["github.com", "api.github.com"]);

/** The user a spec signs in as, from the `/authorize` query: `id`, `login`, `email`, optional `name` and `verified`. */
function readFakeUser(query) {
  const id = Number(query.get("id"));
  const login = query.get("login");
  const email = query.get("email");
  if (!Number.isInteger(id) || !login || !email) return null;
  return { id, login, name: query.get("name"), emails: [{ email, verified: query.get("verified") !== "0", primary: true }] };
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

  const [, host, ...rest] = url.pathname.split("/");
  if (host !== undefined && GITHUB_HOSTS.has(host)) {
    const body = request.method === "POST" ? await readBody(request) : undefined;
    const headers = Object.fromEntries(Object.entries(request.headers).filter(([, value]) => typeof value === "string"));
    const answered = await github.fetch(`https://${host}/${rest.join("/")}${url.search}`, { method: request.method, headers, body });
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
