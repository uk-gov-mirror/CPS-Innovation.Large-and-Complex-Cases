import * as fs from "node:fs";
import * as path from "node:path";

import { getAuthTokens, getAzureADToken } from "../../pw/helpers/auth-api";
import { registerCase } from "../../pw/helpers/case-api";
import {
  authenticateEgress,
  createWorkspace,
  addUserToWorkspace,
} from "../../pw/helpers/egress-api";
import { EGRESS_TEMPLATE_ID, EGRESS_ADMIN_ROLE_ID } from "../../pw/helpers/constants";

// Creates one case per JMeter user, each with its own Egress workspace and
// NetApp folder, and writes them to data/cases-<env>.csv. Every step is logged
// to <csv>.provision.jsonl. See README "Creating cases" for options.
//
//   npx -y tsx scripts/provision-cases.ts --env staging --count 100

const HEADER = "caseId,workspaceId,netappFolderPath,fileSizeMb,caseUrn";
const TOKEN_TTL_MS = 30 * 60 * 1000;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

// Java properties, as JMeter reads them: key=value, # comments, \\ for a backslash.
function readProperties(file: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const raw of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const line = raw.trimStart();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    const m = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(line);
    if (m) props[m[1]] = m[2].trimEnd().replace(/\\(.)/g, (_, c: string) => ({ t: "\t", n: "\n" })[c] ?? c);
  }
  return props;
}

const env = arg("env", "staging");
const envFile = path.resolve(__dirname, `../config/env-${env}.properties`);
if (!fs.existsSync(envFile)) {
  throw new Error(`Missing ${envFile}. Copy config/env.template.properties to env-${env}.properties and fill it in.`);
}
const props = readProperties(envFile);
const required = (key: string) => {
  const v = props[key];
  if (!v || v.startsWith("CHANGE_ME")) throw new Error(`${key} must be set in ${envFile}`);
  return v;
};

const config = {
  caseApiBaseUrl: required("caseApiBaseUrl"),
  lccApiBaseUrl: required("lccApiBaseUrl"),
  egressBaseUrl: required("egressBaseUrl"),
  tenantId: required("tenantId"),
  lccApiClientId: required("lccApiClientId"),
  cmrcApiClientId: required("cmrcApiClientId"),
  e2eAdUser: required("aadUsername"),
  e2eAdPassword: required("aadPassword"),
  egressServiceAccountAuth: required("egressServiceAccountAuth"),
  ddeiBaseUrl: required("ddeiBaseUrl"),
  ddeiAccessKeyCaseRegister: required("ddeiAccessKey"),
  cmsUsername: required("cmsUsername"),
  cmsPassword: required("cmsPassword"),
  egressTemplateId: props.egressTemplateId || EGRESS_TEMPLATE_ID,
  egressAdminRoleId: props.egressAdminRoleId || EGRESS_ADMIN_ROLE_ID,
};

const count = Number(arg("count", "10"));
const out = path.resolve(arg("out", path.resolve(__dirname, `../data/cases-${env}.csv`)));
const prefix = arg("prefix", "JMETER-PERF");
const netappParent = arg("netapp-parent", "jmeter-perf").replace(/^\/+|\/+$/g, "");
const sizes = arg("sizes", "100,425,450,1024,100,425,450,1024,100,1024").split(",").map((s) => s.trim());
const concurrency = Number(arg("concurrency", "3"));
const logFile = `${out}.provision.jsonl`;

type Tokens = { cmrc: string; cmsAuth: string; lcc: string; egress: string; at: number };
let tokens: Tokens | undefined;
let refreshing: Promise<Tokens> | undefined;

async function getTokens(): Promise<Tokens> {
  if (tokens && Date.now() - tokens.at < TOKEN_TTL_MS) return tokens;
  refreshing ??= (async () => {
    const { accessToken: cmrc, cmsAuth } = await getAuthTokens(
      config.tenantId, config.cmrcApiClientId, config.e2eAdUser, config.e2eAdPassword,
      config.ddeiBaseUrl, config.ddeiAccessKeyCaseRegister, config.cmsUsername, config.cmsPassword,
    );
    const lcc = await getAzureADToken(config.tenantId, config.lccApiClientId, config.e2eAdUser, config.e2eAdPassword);
    const egress = await authenticateEgress(config.egressBaseUrl, config.egressServiceAccountAuth);
    tokens = { cmrc, cmsAuth, lcc, egress, at: Date.now() };
    refreshing = undefined;
    return tokens;
  })();
  return refreshing;
}

function log(entry: Record<string, unknown>) {
  fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

async function lcc(method: string, route: string, body?: unknown): Promise<{ status: number; text: string }> {
  const t = await getTokens();
  const res = await fetch(`${config.lccApiBaseUrl}/api/v1/${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${t.lcc}`,
      Cookie: `Cms-Auth-Values=${t.cmsAuth}`,
      "Correlation-Id": crypto.randomUUID(),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

async function lccOk(method: string, route: string, body: unknown, what: string, allow: number[] = []) {
  const r = await lcc(method, route, body);
  if (r.status >= 300 && !allow.includes(r.status)) {
    throw new Error(`${what} failed (${r.status}): ${r.text.slice(0, 300)}`);
  }
  return r;
}

let parentReady: Promise<void> | undefined;

// The parent folder needs a case id for its activity-log entry, so it is
// created with the first case that gets that far. 409 = already exists.
function ensureParent(caseId: number): Promise<void> {
  if (!netappParent) return Promise.resolve();
  parentReady ??= lccOk("POST", "netapp/folders", { caseId, path: netappParent }, `create NetApp parent '${netappParent}'`, [409])
    .then((r) => console.log(`NetApp parent '${netappParent}/': ${r.status === 409 ? "already exists" : "created"}`));
  return parentReady;
}

async function provision(index: number, fileSizeMb: string): Promise<string> {
  const name = `${prefix}-${runTag}-${String(index).padStart(3, "0")}`;
  const folder = netappParent ? `${netappParent}/${name.toLowerCase()}` : name.toLowerCase();
  const rec: Record<string, unknown> = { name };

  try {
    const t = await getTokens();
    // DDEI rejects digits in a surname; registerCase also uses it as the operation name.
    const { caseId, caseUrn } = await registerCase(config.caseApiBaseUrl, t.cmrc, t.cmsAuth, prefix.replace(/[^A-Za-z]/g, ""));
    Object.assign(rec, { caseId, caseUrn });
    log({ step: "case", ...rec });

    const workspaceId = await createWorkspace(config.egressBaseUrl, t.egress, name, config.egressTemplateId);
    rec.workspaceId = workspaceId;
    log({ step: "workspace", ...rec });
    await addUserToWorkspace(config.egressBaseUrl, t.egress, workspaceId, config.e2eAdUser, config.egressAdminRoleId);

    await lccOk("POST", "egress/connections", { caseId, egressWorkspaceId: workspaceId, egressWorkspaceName: name }, "connect Egress");
    log({ step: "egress-connected", ...rec });

    await ensureParent(caseId);
    await lccOk("POST", "netapp/folders", { caseId, path: folder }, `create NetApp folder '${folder}'`, [409]);
    rec.netappFolder = folder;
    await lccOk("POST", "netapp/connections", { caseId, operationName: name, folderPath: `${folder}/` }, "connect NetApp");
    log({ step: "netapp-connected", ...rec });

    // Read back what LCC stored, so the CSV holds exactly what transfers will use.
    const check = await lccOk("GET", `cases/${caseId}`, undefined, "read back case");
    const c = JSON.parse(check.text);
    if (c.egressWorkspaceId !== workspaceId || !c.netappFolderPath) {
      throw new Error(`case ${caseId} not fully connected: egress=${c.egressWorkspaceId} netapp=${c.netappFolderPath}`);
    }
    const netappFolderPath = c.netappFolderPath.endsWith("/") ? c.netappFolderPath : `${c.netappFolderPath}/`;
    log({ step: "done", ...rec, netappFolderPath });
    console.log(`  [${index}] case ${caseId} ${caseUrn} -> ${name} / ${netappFolderPath}`);
    return [caseId, workspaceId, netappFolderPath, fileSizeMb, caseUrn].join(",");
  } catch (err) {
    log({ step: "failed", ...rec, error: String(err) });
    throw new Error(`[${index}] ${name}: ${err instanceof Error ? err.message : err}`);
  }
}

const runTag = new Date().toISOString().slice(0, 10).replaceAll("-", "");

async function main() {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (!fs.existsSync(out)) fs.writeFileSync(out, HEADER + "\n");
  const firstLine = fs.readFileSync(out, "utf-8").split(/\r?\n/)[0];
  if (firstLine !== HEADER) throw new Error(`${out} has header '${firstLine}', expected '${HEADER}'`);

  const existing = fs.readFileSync(out, "utf-8").split(/\r?\n/).slice(1).filter((l) => l.trim()).length;
  const needed = count - existing;
  console.log(`${out}: ${existing} row(s) present, ${count} wanted -> provisioning ${Math.max(needed, 0)} case(s)`);
  if (needed <= 0) return;

  // Continue numbering after anything already logged today, so names never repeat.
  const logged = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, "utf-8").split("\n").filter(Boolean)
        .map((l) => JSON.parse(l).name as string)
        .filter((n) => n?.startsWith(`${prefix}-${runTag}-`))
        .map((n) => Number(n.split("-").pop()))
    : [];
  const start = Math.max(0, ...logged) + 1;

  const jobs = Array.from({ length: needed }, (_, i) => ({ index: start + i, size: sizes[(existing + i) % sizes.length] }));
  const failures: string[] = [];
  let next = 0;

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const row = await provision(job.index, job.size);
        fs.appendFileSync(out, row + "\n");
      } catch (err) {
        failures.push(String(err instanceof Error ? err.message : err));
        console.error(`  FAILED ${err instanceof Error ? err.message : err}`);
      }
    }
  }));

  const total = fs.readFileSync(out, "utf-8").split(/\r?\n/).slice(1).filter((l) => l.trim()).length;
  console.log(`\n${total}/${count} rows in ${out}. Provisioning log: ${logFile}`);
  if (failures.length) {
    console.log(`${failures.length} failure(s); rerun the same command to fill the gap:`);
    failures.forEach((f) => console.log(`  ${f}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
