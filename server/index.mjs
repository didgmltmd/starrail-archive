// StarRail Archive friend server. Runs on the host PC; no dependencies besides Node.
//
//   node server/index.mjs            local only (http://127.0.0.1:8787)
//   node server/index.mjs --tunnel   also opens a Cloudflare quick tunnel and publishes its
//                                    address to the repo's `server` branch (server.json),
//                                    which the apps read to find this server.
//
// Stores only game data that players chose to share (never HoYoLAB login info).
// Each UID can only be changed by the install that first published it (secret key, hashed).
import { createHash, timingSafeEqual } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const PORT = Number(process.env.SRA_PORT ?? 8787);
const REPO = process.env.SRA_REPO ?? "didgmltmd/starrail-archive";
const BRANCH = "server";
const DATA_DIR =
  process.env.SRA_DATA_DIR ?? join(process.env.LOCALAPPDATA ?? process.env.HOME ?? ".", "StarRailArchiveServer");
const PROFILES = join(DATA_DIR, "profiles");
const OWNERS = join(DATA_DIR, "owners.json");
const LOG = join(DATA_DIR, "server.log");
const MAX_BODY = 4 * 1024 * 1024;
const UID_RE = /^\d{9,10}$/;

mkdirSync(PROFILES, { recursive: true });

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}`;
  console.log(line);
  try {
    appendFileSync(LOG, line + "\n");
  } catch {
    // logging must never take the server down
  }
}

// ---------- storage ----------

const owners = existsSync(OWNERS) ? JSON.parse(readFileSync(OWNERS, "utf8")) : {};
const saveOwners = () => writeAtomic(OWNERS, JSON.stringify(owners, null, 1));

function writeAtomic(path, text) {
  const tmp = path + ".tmp";
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

const profilePath = (uid) => join(PROFILES, `${uid}.json`);
const hash = (secret) => createHash("sha256").update(String(secret)).digest("hex");

function ownerOk(uid, secret) {
  if (!secret || String(secret).length < 32) return false;
  const want = owners[uid];
  if (!want) return true; // first publisher becomes the owner
  const a = Buffer.from(want, "hex");
  const b = Buffer.from(hash(secret), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function readProfile(uid) {
  try {
    return JSON.parse(readFileSync(profilePath(uid), "utf8"));
  } catch {
    return null;
  }
}

// ---------- rate limit (per client IP, simple token bucket) ----------

const buckets = new Map();
function allowed(ip, cost = 1) {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: 60, at: now };
  b.tokens = Math.min(60, b.tokens + ((now - b.at) / 1000) * 0.5); // 30 per minute sustained
  b.at = now;
  if (b.tokens < cost) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= cost;
  buckets.set(ip, b);
  return true;
}

// ---------- validation ----------

function cleanProfile(uid, body) {
  if (!body || typeof body !== "object") throw new Error("bad body");
  if (!Array.isArray(body.characters) || body.characters.length > 500) throw new Error("bad characters");
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  return {
    uid,
    nickname: str(body.nickname, 40),
    level: Number.isFinite(body.level) ? Math.max(0, Math.min(100, Math.floor(body.level))) : 0,
    avatarId: /^\d{4,5}$/.test(body.avatarId ?? "") ? body.avatarId : "8001",
    signature: str(body.signature, 200),
    characters: body.characters,
    challenges: body.challenges && typeof body.challenges === "object" ? body.challenges : null,
    updatedAt: new Date().toISOString(),
  };
}

// ---------- http ----------

function send(res, status, data) {
  const body = data === undefined ? "" : JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-SRA-Secret",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"));
      } catch {
        reject(new Error("bad json"));
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const ip = String(req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress ?? "?");
  try {
    if (req.method === "OPTIONS") return send(res, 204);
    const url = new URL(req.url ?? "/", "http://local");
    const path = url.pathname.replace(/\/+$/, "");

    if (path === "/api/health") return send(res, 200, { ok: true, app: "starrail-archive", profiles: readdirSync(PROFILES).length });

    if (path === "/api/profiles" && req.method === "GET") {
      if (!allowed(ip)) return send(res, 429, { error: "rate limited" });
      const uids = (url.searchParams.get("uids") ?? "").split(",").filter((u) => UID_RE.test(u)).slice(0, 50);
      const profiles = {};
      for (const uid of uids) {
        const p = readProfile(uid);
        if (p) profiles[uid] = p;
      }
      return send(res, 200, { profiles });
    }

    const m = /^\/api\/profiles\/(\d+)$/.exec(path);
    if (m) {
      const uid = m[1];
      if (!UID_RE.test(uid)) return send(res, 400, { error: "bad uid" });

      if (req.method === "GET") {
        if (!allowed(ip)) return send(res, 429, { error: "rate limited" });
        const p = readProfile(uid);
        return p ? send(res, 200, p) : send(res, 404, { error: "not found" });
      }

      const secret = req.headers["x-sra-secret"];
      if (req.method === "PUT") {
        if (!allowed(ip, 5)) return send(res, 429, { error: "rate limited" });
        if (!ownerOk(uid, secret)) return send(res, 403, { error: "owned by another install" });
        const profile = cleanProfile(uid, await readBody(req));
        writeAtomic(profilePath(uid), JSON.stringify(profile));
        if (!owners[uid]) {
          owners[uid] = hash(secret);
          saveOwners();
        }
        log(`publish ${uid} (${profile.characters.length} characters)`);
        return send(res, 200, { ok: true, updatedAt: profile.updatedAt });
      }

      if (req.method === "DELETE") {
        if (!allowed(ip, 5)) return send(res, 429, { error: "rate limited" });
        if (!owners[uid]) return send(res, 200, { ok: true });
        if (!ownerOk(uid, secret)) return send(res, 403, { error: "owned by another install" });
        rmSync(profilePath(uid), { force: true });
        delete owners[uid];
        saveOwners();
        log(`unpublish ${uid}`);
        return send(res, 200, { ok: true });
      }
    }

    return send(res, 404, { error: "not found" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /too large/.test(msg) ? 413 : /bad /.test(msg) ? 400 : 500;
    if (status === 500) log(`error ${req.method} ${req.url}: ${msg}`);
    return send(res, status, { error: msg });
  }
});

// Only reachable from this PC; the tunnel forwards outside traffic here.
server.listen(PORT, "127.0.0.1", () => log(`listening on http://127.0.0.1:${PORT} (data: ${DATA_DIR})`));

// ---------- tunnel + address publishing ----------

function gh(args, input) {
  return new Promise((resolve, reject) => {
    const p = execFile("gh", args, { windowsHide: true }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve(stdout),
    );
    if (input !== undefined) {
      p.stdin.write(input);
      p.stdin.end();
    }
  });
}

async function ensureBranch() {
  try {
    await gh(["api", `repos/${REPO}/branches/${BRANCH}`]);
  } catch {
    const sha = JSON.parse(await gh(["api", `repos/${REPO}/git/ref/heads/master`])).object.sha;
    await gh(["api", "-X", "POST", `repos/${REPO}/git/refs`, "--input", "-"], JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha }));
    log(`created branch ${BRANCH}`);
  }
}

async function publishAddress(url) {
  await ensureBranch();
  let sha;
  try {
    sha = JSON.parse(await gh(["api", `repos/${REPO}/contents/server.json?ref=${BRANCH}`])).sha;
  } catch {
    sha = undefined;
  }
  const content = Buffer.from(JSON.stringify({ url, updatedAt: new Date().toISOString() }, null, 1) + "\n").toString("base64");
  await gh(
    ["api", "-X", "PUT", `repos/${REPO}/contents/server.json`, "--input", "-"],
    JSON.stringify({ message: "server: update address", content, branch: BRANCH, ...(sha ? { sha } : {}) }),
  );
  log(`published address ${url}`);
}

function startTunnel(attempt = 0) {
  const cf = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PORT}`], { windowsHide: true });
  let published = false;
  const onData = (buf) => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf.toString());
    if (m && !published) {
      published = true;
      attempt = 0;
      log(`tunnel up: ${m[0]}`);
      publishAddress(m[0]).catch((e) => log(`could not publish address: ${e.message}`));
    }
  };
  cf.stdout.on("data", onData);
  cf.stderr.on("data", onData);
  cf.on("exit", (code) => {
    const wait = Math.min(60, 5 * 2 ** attempt);
    log(`tunnel exited (${code}), restarting in ${wait}s`);
    setTimeout(() => startTunnel(attempt + 1), wait * 1000);
  });
}

if (process.argv.includes("--tunnel")) startTunnel();
