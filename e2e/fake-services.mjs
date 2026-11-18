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
// - a fake S3 (VC-20) at `/s3` and a fake Dropbox (VC-21) at `/dropbox/<dropbox host>/...` (`DROPBOX_FAKE_ORIGIN`),
//   both holding the same fixture vault. The browser's visit to Dropbox's consent page approves at once, or declines
//   when the spec set the `fake_dropbox_deny=1` cookie on this origin.
// - a fake sync service (VC-22): its account API at `/headless-sync/<api host>/...` (`HEADLESS_SYNC_FAKE_ORIGIN`) and
//   its socket as a WebSocket upgrade on this port, the socket host the vault list names. One fictional account with a
//   standard vault and an end-to-end vault, both holding the fixture vault, encrypted as the clients encrypt.
// - a fake Stripe (VC-15) at the origin's root: the Checkout API `stripe()` of @softure-ai/billing calls
//   (`STRIPE_API_BASE`), a hosted page at `/c/pay/<id>` whose Pay button delivers a signed `checkout.session.completed`
//   to the app's webhook (`STRIPE_WEBHOOK_URL`, signed with `STRIPE_WEBHOOK_SECRET` the way Stripe signs), and
//   `GET /v1/checkout/sessions/<id>`, so a spec reads the session the app created.
//
// Plain Node, started by Playwright before the app.
import { createHmac, randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createFakeGithubProvider } from "@softure-ai/auth/testing";
import { createFakeGithubApp } from "@softure-ai/connections/testing";
import { WebSocketServer } from "ws";
import { createFakeDropbox } from "../src/vault/testing/fake-dropbox.ts";
import { createFakeHeadlessSync } from "../src/vault/testing/fake-headless-sync.ts";
import { createFakeS3 } from "../src/vault/testing/fake-s3.ts";

const port = Number(process.env.FAKE_SERVICES_PORT);
const outbox = process.env.MAIL_OUTBOX;
const clientId = process.env.GH_AUTH_CLIENT_ID;
const clientSecret = process.env.GH_AUTH_CLIENT_SECRET;
const appId = Number(process.env.GH_APP_ID);
const appSlug = process.env.GH_APP_SLUG;
const appPrivateKey = process.env.GH_APP_PRIVATE_KEY;
const appSetupUrl = process.env.GH_APP_SETUP_URL;
const stripeWebhookUrl = process.env.STRIPE_WEBHOOK_URL;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const isConfigured = Number.isInteger(port) && port > 0 && outbox && clientId && clientSecret && Number.isInteger(appId) && appSlug && appPrivateKey && appSetupUrl;
if (!isConfigured || !stripeWebhookUrl || !stripeWebhookSecret) {
  console.error(
    "fake-services: set FAKE_SERVICES_PORT, MAIL_OUTBOX, GH_AUTH_CLIENT_ID, GH_AUTH_CLIENT_SECRET, GH_APP_ID, GH_APP_SLUG, GH_APP_PRIVATE_KEY, GH_APP_SETUP_URL, STRIPE_WEBHOOK_URL and STRIPE_WEBHOOK_SECRET",
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

/** A Dropbox (VC-21) holding the fixture vault in the folder the specs name, for the product's Dropbox app. */
const dropbox = createFakeDropbox({ appKey: process.env.E2E_DROPBOX_APP_KEY, appSecret: process.env.E2E_DROPBOX_APP_SECRET });
for (const [path, content] of Object.entries(FIXTURE_VAULT)) dropbox.put(`${process.env.E2E_DROPBOX_FOLDER}/${path}`, content);
const DROPBOX_HOSTS = new Set(["www.dropbox.com", "api.dropboxapi.com", "content.dropboxapi.com"]);

/** The sync service (VC-22): the account and its two vaults as the specs know them. */
const headlessSync = createFakeHeadlessSync({
  email: process.env.E2E_SYNC_EMAIL,
  password: process.env.E2E_SYNC_PASSWORD,
  socketHost: `127.0.0.1:${String(port)}`,
  vaults: [
    { id: "e2e-vault-standard", name: process.env.E2E_SYNC_STANDARD_VAULT, encryption: "standard", password: "e2e-fictional-managed-password", salt: "e2e-salt-standard", encryptionVersion: 3 },
    { id: "e2e-vault-private", name: process.env.E2E_SYNC_E2EE_VAULT, encryption: "e2ee", password: process.env.E2E_SYNC_E2EE_PASSWORD, salt: "e2e-salt-private", encryptionVersion: 3 },
  ],
});
for (const vaultId of ["e2e-vault-standard", "e2e-vault-private"]) {
  for (const [path, content] of Object.entries(FIXTURE_VAULT)) void headlessSync.write(vaultId, path, content);
}

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

/** The Checkout sessions the app created on the fake Stripe, by id. */
const stripeSessions = new Map();

function describeStripeSession(session) {
  return {
    id: session.id,
    object: "checkout.session",
    url: session.url,
    status: session.status,
    mode: "payment",
    payment_status: session.status === "complete" ? "paid" : "unpaid",
    payment_intent: session.paymentIntent,
    amount_total: session.amountTotal,
    currency: session.currency,
    client_reference_id: session.clientReferenceId,
    customer_email: session.customerEmail,
    success_url: session.successUrl,
    cancel_url: session.cancelUrl,
    metadata: session.metadata,
    payment_intent_data: { metadata: session.paymentIntentMetadata },
  };
}

/** The fields of a form body under `prefix[...]`, e.g. `metadata[user_id]` → `{ user_id }`. */
function readNestedFields(form, prefix) {
  const fields = {};
  for (const [key, value] of form) {
    const inner = key.slice(prefix.length + 1, -1);
    if (key.startsWith(`${prefix}[`) && key.endsWith("]") && !inner.includes("[")) fields[inner] = value;
  }
  return fields;
}

/** POST /v1/checkout/sessions: the session the app asks for, or why it is refused. */
function createStripeSession(form) {
  const successUrl = form.get("success_url");
  const cancelUrl = form.get("cancel_url");
  const currency = form.get("line_items[0][price_data][currency]");
  const unitAmount = Number(form.get("line_items[0][price_data][unit_amount]"));
  const quantity = Number(form.get("line_items[0][quantity]") ?? "1");
  if (form.get("mode") !== "payment") return "mode must be payment";
  if (successUrl === null || cancelUrl === null) return "success_url and cancel_url are required";
  if (currency === null || !Number.isInteger(unitAmount) || unitAmount <= 0) return "line_items[0][price_data] needs a currency and a positive unit_amount";
  const id = `cs_test_fake_${randomUUID().replaceAll("-", "")}`;
  const session = {
    id,
    status: "open",
    url: `http://127.0.0.1:${String(port)}/c/pay/${id}`,
    successUrl,
    cancelUrl,
    clientReferenceId: form.get("client_reference_id") ?? "",
    customerEmail: form.get("customer_email") ?? "",
    currency,
    amountTotal: unitAmount * quantity,
    metadata: readNestedFields(form, "metadata"),
    paymentIntentMetadata: readNestedFields(form, "payment_intent_data[metadata]"),
    paymentIntent: null,
  };
  stripeSessions.set(id, session);
  return session;
}

/** Delivers a Stripe event to the app's webhook, signed as Stripe signs; throws when the app refuses it. */
async function deliverStripeEvent(type, object) {
  const payload = JSON.stringify({ id: `evt_fake_${randomUUID()}`, object: "event", type, created: Math.floor(Date.now() / 1000), data: { object } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", stripeWebhookSecret).update(`${String(timestamp)}.${payload}`, "utf8").digest("hex");
  const answered = await fetch(stripeWebhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": `t=${String(timestamp)},v1=${signature}` },
    body: payload,
  });
  if (!answered.ok) throw new Error(`deliverStripeEvent: the webhook answered ${String(answered.status)} to ${type}`);
}

function sendStripeJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function sendStripeError(response, status, message) {
  sendStripeJson(response, status, { error: { type: "invalid_request_error", message } });
}

/** The fake Stripe's routes; false when the request is not Stripe's. */
async function answerStripe(request, response, url) {
  const page = /^\/c\/pay\/([A-Za-z0-9_]+)$/.exec(url.pathname);
  if (page !== null) {
    const session = stripeSessions.get(page[1]);
    if (session === undefined) {
      sendStripeError(response, 404, "No such checkout session");
      return true;
    }
    if (request.method === "GET") {
      const amount = `${(session.amountTotal / 100).toFixed(2)} ${session.currency.toUpperCase()}`;
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fake Stripe Checkout</title></head><body>
<main><h1>Fake Stripe Checkout</h1><p data-amount>${amount}</p>
<form method="post" action="/c/pay/${session.id}"><button type="submit">Pay</button></form>
<a href="${session.cancelUrl}">Back</a></main></body></html>`);
      return true;
    }
    if (session.status !== "open") {
      sendStripeError(response, 400, "This checkout session is already complete");
      return true;
    }
    session.status = "complete";
    session.paymentIntent = `pi_fake_${randomUUID().replaceAll("-", "")}`;
    await deliverStripeEvent("checkout.session.completed", describeStripeSession(session));
    response.writeHead(303, { location: session.successUrl });
    response.end();
    return true;
  }
  if (!url.pathname.startsWith("/v1/")) return false;
  if (!/^Bearer (sk|rk)_test_\S+$/.test(request.headers.authorization ?? "")) {
    sendStripeError(response, 401, "Invalid API key: a test-mode key is required");
    return true;
  }
  if (request.method === "POST" && url.pathname === "/v1/checkout/sessions") {
    const created = createStripeSession(new URLSearchParams(await readBody(request)));
    if (typeof created === "string") sendStripeError(response, 400, created);
    else sendStripeJson(response, 200, describeStripeSession(created));
    return true;
  }
  const read = /^\/v1\/checkout\/sessions\/([A-Za-z0-9_]+)$/.exec(url.pathname);
  const session = read === null ? undefined : stripeSessions.get(read[1]);
  if (request.method === "GET" && session !== undefined) sendStripeJson(response, 200, describeStripeSession(session));
  else sendStripeError(response, 404, `Unrecognized request URL (${request.method ?? "?"}: ${url.pathname})`);
  return true;
}

async function answer(request, response) {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${String(port)}`);
  if (request.method === "GET" && url.pathname === "/health") return void response.end("ok");
  if (await answerStripe(request, response, url)) return;

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

  if (url.pathname.startsWith("/dropbox/")) {
    const [, , host, ...rest] = url.pathname.split("/");
    if (host === undefined || !DROPBOX_HOSTS.has(host)) return refuse(response, "fake Dropbox: unknown host");
    const target = `https://${host}/${rest.join("/")}${url.search}`;
    if (request.method === "GET" && host === "www.dropbox.com" && rest.join("/") === "oauth2/authorize") {
      const isDenied = (request.headers.cookie ?? "").split(/;\s*/).includes("fake_dropbox_deny=1");
      response.statusCode = 302;
      response.setHeader("location", dropbox.approve(target, { deny: isDenied }).toString());
      return void response.end();
    }
    const headers = Object.fromEntries(Object.entries(request.headers).filter(([, value]) => typeof value === "string"));
    const body = request.method === "POST" ? await readBody(request) : undefined;
    const answered = await dropbox.fetch(target, { method: request.method, headers, body });
    response.statusCode = answered.status;
    answered.headers.forEach((value, name) => response.setHeader(name, value));
    return void response.end(Buffer.from(await answered.arrayBuffer()));
  }

  if (url.pathname.startsWith("/headless-sync/")) {
    const body = request.method === "POST" ? await readBody(request) : undefined;
    const target = new URL(`${url.pathname.slice("/headless-sync".length)}${url.search}`, url.origin);
    const answered = await headlessSync.handle(new Request(target, { method: request.method, headers: { "content-type": "application/json" }, body }));
    response.statusCode = answered.status;
    answered.headers.forEach((value, name) => response.setHeader(name, value));
    return void response.end(await answered.text());
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

const server = createServer((request, response) => {
  answer(request, response).catch((error) => {
    console.error(`fake-services: ${request.method ?? "?"} ${request.url ?? "?"} failed: ${error instanceof Error ? error.message : String(error)}`);
    response.statusCode = 500;
    response.end();
  });
});

/** The sync service's socket: every upgrade on this port is one session with the fake. */
const sockets = new WebSocketServer({ server });
sockets.on("connection", (socket) => {
  const session = headlessSync.connect({
    send: (data) => socket.send(data),
    close: () => socket.close(),
  });
  socket.on("message", (data, isBinary) => {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]);
    session.receive(isBinary ? new Uint8Array(bytes) : bytes.toString("utf8")).catch((error) => {
      console.error(`fake-services: sync socket failed: ${error instanceof Error ? error.message : String(error)}`);
      socket.close();
    });
  });
});

server.listen(port, "127.0.0.1");
