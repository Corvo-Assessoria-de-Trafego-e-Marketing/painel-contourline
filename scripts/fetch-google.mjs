// fetch-google.mjs — Google Ads da Contourline → ../data-google.json (por dia e por campanha).
// Env (secrets): GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_DEVELOPER_TOKEN
// Opcionais: GOOGLE_CUSTOMER_ID, GOOGLE_LOGIN_CUSTOMER_ID (auto | none | id da MCC), GOOGLE_SINCE, GOOGLE_API_VER
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classificarMidia } from "./classificar.mjs";

const env = k => (process.env[k] || "").trim();
const REFRESH = env("GOOGLE_REFRESH_TOKEN"), CLIENT = env("GOOGLE_CLIENT_ID"), SECRET = env("GOOGLE_CLIENT_SECRET"), DEV = env("GOOGLE_DEVELOPER_TOKEN");
const CUSTOMER = (env("GOOGLE_CUSTOMER_ID") || "7176877816").replace(/-/g, "");
const MCC_RAW = env("GOOGLE_LOGIN_CUSTOMER_ID") || "auto";
const MCCS = /^auto$/i.test(MCC_RAW) ? ["", "9147312925"] : /^(none|direto)$/i.test(MCC_RAW) ? [""] : [MCC_RAW.replace(/-/g, "")];
const SINCE = env("GOOGLE_SINCE") || "2026-10-01";
const VER = env("GOOGLE_API_VER") || "v25";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data-google.json");
const segredos = [REFRESH, SECRET, DEV, CLIENT].filter(Boolean);
const limpa = s => { let t = String(s); for (const x of segredos) t = t.split(x).join("***"); return t; };
let TOKEN, MCC = "";

async function token() {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: CLIENT, client_secret: SECRET, refresh_token: REFRESH }) });
  const j = await r.json(); if (j.error) throw new Error("OAuth: " + (j.error_description || j.error)); TOKEN = j.access_token;
}
async function gaql(q) {
  const h = { Authorization: "Bearer " + TOKEN, "developer-token": DEV, "Content-Type": "application/json" };
  if (MCC) h["login-customer-id"] = MCC;
  let out = [], page = null, n = 0;
  do {
    const body = { query: q.replace(/\s+/g, " ").trim() }; if (page) body.pageToken = page;
    const r = await fetch(`https://googleads.googleapis.com/${VER}/customers/${CUSTOMER}/googleAds:search`, { method: "POST", headers: h, body: JSON.stringify(body) });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`); }
    if (j.error) { const d = j.error.details?.[0]?.errors?.[0]; throw new Error("GAQL: " + (d?.message || j.error.message)); }
    out = out.concat(j.results || []); page = j.nextPageToken || null;
  } while (page && n++ < 100);
  return out;
}

(async () => {
  if (!REFRESH || !CLIENT || !SECRET || !DEV) { console.log("Secrets do Google não configurados — pulando."); return; }
  await token();
  let ok = false; const erros = [];
  for (const m of MCCS) { MCC = m; try { await gaql("SELECT customer.id FROM customer LIMIT 1"); ok = true; break; } catch (e) { erros.push((m || "direto") + ": " + e.message); } }
  if (!ok) throw new Error("sem acesso à conta " + CUSTOMER + " — " + erros.join(" | "));
  const ate = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  console.log(`Google · conta ${CUSTOMER} (${MCC ? "via MCC " + MCC : "direto"}) · ${SINCE} a ${ate}`);
  const r = await gaql(`SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, segments.date,
      metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM campaign WHERE segments.date BETWEEN '${SINCE}' AND '${ate}' AND metrics.cost_micros > 0`);
  const campanhas = [], idx = {}, rows = [];
  let gasto = 0;
  for (const x of r) {
    const id = x.campaign.id;
    if (idx[id] == null) {
      const c = classificarMidia({ campanha: x.campaign.name });
      idx[id] = campanhas.length;
      campanhas.push({ id, nome: x.campaign.name, frente: c.frente, produto: c.produto, black: c.black, tipo: c.tipo, canal: x.campaign.advertisingChannelType, ativa: x.campaign.status === "ENABLED" });
    }
    const custo = (+x.metrics.costMicros || 0) / 1e6; gasto += custo;
    // [data, campanha, gasto, impressões, cliques, conversões]
    rows.push([x.segments.date, idx[id], Math.round(custo * 100) / 100, +x.metrics.impressions || 0, +x.metrics.clicks || 0, Math.round((+x.metrics.conversions || 0) * 100) / 100]);
  }
  writeFileSync(OUT, JSON.stringify({ meta: { gerado: new Date().toISOString(), hoje: ate, desde: SINCE, conta: CUSTOMER, campos: ["data", "campanha", "gasto", "impressoes", "cliques", "conversoes"] }, campanhas, rows }));
  console.log(`OK: ${rows.length} linhas, ${campanhas.length} campanhas, R$ ${gasto.toFixed(2)}.`);
})().catch(e => { console.error("ERRO Google:", limpa(e.message)); process.exit(1); });
