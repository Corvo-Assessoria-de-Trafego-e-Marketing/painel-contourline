// fetch-rd.mjs — RD Station Marketing da Contourline → ../data-rd.json (SÓ números agregados, sem nome/e-mail/telefone).
// Guarda o que já leu em .cache/rd-state.json (fora do repositório; o GitHub Actions guarda entre as rodadas).
// Env (secrets): RD_CLIENT_ID, RD_CLIENT_SECRET, RD_REFRESH_TOKEN. Opcionais: RD_SINCE, RD_MAX_CHAMADAS, RD_MAX_MIN.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classificarForm } from "./classificar.mjs";

const env = k => (process.env[k] || "").trim();
const CID = env("RD_CLIENT_ID"), SEC = env("RD_CLIENT_SECRET"), REF = env("RD_REFRESH_TOKEN");
const SINCE = env("RD_SINCE") || "2026-10-01";
const MAX_CHAMADAS = +(env("RD_MAX_CHAMADAS") || 2400);
const MAX_MS = +(env("RD_MAX_MIN") || 35) * 60e3;
const SEGMENTACAO = env("RD_SEGMENTACAO") || "3533624"; // "todos os contatos" da conta
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(ROOT, ".cache"), CACHE = join(CACHE_DIR, "rd-state.json"), OUT = join(ROOT, "data-rd.json");
let TOK = null;
const limpa = s => { let t = String(s); for (const x of [SEC, REF, TOK, CID]) if (x) t = t.split(x).join("***"); return t; };
const espera = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.now(); let chamadas = 0;
const tempo = () => Date.now() - T0 < MAX_MS && chamadas < MAX_CHAMADAS;

async function token() {
  const r = await (await fetch("https://api.rd.services/auth/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: CID, client_secret: SEC, refresh_token: REF }) })).json();
  if (!r.access_token) throw new Error("token RD: " + limpa(JSON.stringify(r)).slice(0, 200));
  TOK = r.access_token;
}
async function get(p) {
  for (let i = 0; i < 8; i++) {
    chamadas++;
    let res;
    try { res = await fetch("https://api.rd.services" + p, { headers: { authorization: "Bearer " + TOK } }); } catch (e) { await espera(3000 * (i + 1)); continue; }
    if (res.status === 401) { await token(); continue; }
    if (res.status === 429 || res.status >= 500) { await espera(Math.min(60000, 4000 * (i + 1))); continue; }
    const j = await res.json().catch(() => ({}));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(res.status + " " + limpa(JSON.stringify(j)).slice(0, 200));
    return j;
  }
  throw new Error("RD sem resposta em " + p.split("?")[0]);
}

// ── origem da conversão (dois formatos: campos soltos ou JSON first/current_session) ──
function origem(payload = {}) {
  let src = payload.traffic_source || "", med = payload.traffic_medium || "", camp = payload.traffic_campaign || "";
  if (src.startsWith("encoded_")) { try { src = Buffer.from(src.slice(8), "base64").toString("utf8"); } catch { } }
  let q = "";
  if (src.startsWith("{")) {
    try { const j = JSON.parse(src); const v = o => (o && typeof o === "object" ? o.value : o) || ""; q = v(j.current_session); if (!q || q === "(none)") q = v(j.first_session); } catch { }
    src = "";
  }
  if (q && q !== "(none)") {
    let s = q; try { s = decodeURIComponent(q); } catch { }
    const m = k => ((s.match(new RegExp("(?:^|[?&/])" + k + "=([^&]*)", "i")) || [])[1] || "").replace(/\+/g, " ");
    if (/^https?:\/\//i.test(s) && !/utm_|gclid|fbclid/i.test(s)) src = s; else { src = m("utm_source") || (/gclid|gad_source/i.test(s) ? "google" : /fbclid/i.test(s) ? "facebook" : ""); med = m("utm_medium") || (/gclid|gad_source/i.test(s) ? "cpc" : med); camp = m("utm_campaign") || camp; if (/gclid|gad_source/i.test(s)) med = med || "cpc"; }
  }
  const t = (src + " " + med).toLowerCase();
  let tipo;
  if (!src && !med && !camp) tipo = "Sem origem";
  else if (/google/.test(t) && /cpc|paid|ppc|search|gclid/.test(t + " " + q)) tipo = "Google pago";
  else if (/facebook|instagram|\bfb\b|\big\b|meta/.test(t) && /paid|cpc|social|ads/.test(t + " " + q) || /fbclid/i.test(q)) tipo = "Meta pago";
  else if (/google|bing/.test(t)) tipo = "Busca orgânica";
  else if (/instagram|facebook/.test(t)) tipo = "Redes (orgânico)";
  else if (/rdstation|email|e-mail/.test(t)) tipo = "E-mail / RD";
  else tipo = "Outros";
  camp = (camp || "").trim(); if (/^\(?not set\)?$|^\(none\)$|\{\{/i.test(camp)) camp = "";
  return [tipo, camp.slice(0, 90)];
}

// ── qualificação (mesma régua do relatório de outubro) ──
const MEDPROF = /^(médico|medico|dermatologista|dono de clínica|dono de clinica|investidor|locador)$/i;
const RUIM = /paciente|estudante|secret|entusiasta/i;
function qualifica(x, frente) {
  if (/procedimento/i.test(x.quer || "")) return "Paciente";
  if (!x.quer && !x.prof && !x.invest) return "Sem resposta";
  const p = (x.prof || "").trim();
  if (RUIM.test(p)) return "Fora do perfil";
  if ((x.invest || "").replace(/\s/g, "") === "R$0") return "Investimento R$ 0";
  if (["Cynosure", "Contourline Med", "Lumenis"].includes(frente) && p && !MEDPROF.test(p)) return "Não é médico";
  return "Sim";
}
const VENDAS = /^(VENDAS|FUNIL DE NOVAS VENDAS|FUNIL HIGH TICKET|SALES OPS)/i;
const AVAN = /negocia|demonstra|fechamento|solu[cç][aã]o e proposta|valida[cç][aã]o|pend[eê]ncias contratuais|aprova/i;
function etapa(x) {
  if (x.perda) return "Perdido";
  const pipe = x.pipe || "";
  if (!pipe) return "Sem negociação";
  if (VENDAS.test(pipe)) return AVAN.test(x.etapa || "") ? "Etapa avançada" : "Funil de vendas";
  if (/sdr/i.test(pipe)) return "SDR";
  return "Outros funis";
}
const perdaNorm = s => !s ? "" : s.toUpperCase().replace("CADÊNCIA", "CADENCIA").replace("CRÉDITO", "CREDITO").split("|")[0].trim().slice(0, 60);

(async () => {
  if (!CID || !SEC || !REF) { console.log("Secrets do RD não configurados — pulando."); return; }
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR);
  const st = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : { contatos: {}, varredura: null, ultimaVarreduraCompleta: null };
  const salvar = () => writeFileSync(CACHE, JSON.stringify(st));
  await token();
  const ini = new Date(SINCE + "T00:00:00-03:00");

  // A) contatos com conversão nova (varredura retomável)
  // Uma vez por dia a varredura desce até o início do período (revisão): quem já está no cache é pulado sem chamada,
  // então custa poucas chamadas, pega quem ficou para trás e tira do cache quem sumiu do RD (contato apagado/mesclado).
  if (!st.varredura) {
    const revisao = !st.ultimaRevisao || Date.now() - new Date(st.ultimaRevisao).getTime() > 20 * 3600e3;
    st.varredura = { pagina: 1, revisao, vistos: [], inicio: new Date().toISOString(),
      corte: !revisao && st.ultimaVarreduraCompleta ? new Date(new Date(st.ultimaVarreduraCompleta).getTime() - 3 * 3600e3).toISOString() : ini.toISOString() };
  } else if (st.varredura.pagina > 1) st.varredura.pagina--; // retoma uma página antes: contato que sumiu entre rodadas não faz pular ninguém
  const corte = new Date(st.varredura.corte);
  const vistos = new Set(st.varredura.vistos || []);
  let novos = 0, fimVarredura = false, chegouNoCorte = false, paginaInteira = true;
  while (tempo()) {
    const c = await get(`/platform/segmentations/${SEGMENTACAO}/contacts?page_size=125&page=${st.varredura.pagina}&order=last_conversion_date:desc`);
    const lista = (c && c.contacts) || [];
    if (!lista.length) { fimVarredura = true; break; }
    paginaInteira = true;
    for (const x of lista) {
      if (new Date(x.last_conversion_date) < corte) { fimVarredura = chegouNoCorte = true; break; }
      const k = x.uuid.slice(0, 13); const atual = st.contatos[k];
      vistos.add(k);
      if (atual && atual.lc === x.last_conversion_date) continue;
      if (!tempo()) { paginaInteira = false; break; } // acabou o tempo no meio da página: a próxima rodada recomeça nela
      const ev = await get("/platform/contacts/" + x.uuid + "/events?event_type=CONVERSION") || [];
      const conv = (Array.isArray(ev) ? ev : []).filter(e => new Date(e.event_timestamp) >= ini)
        .map(e => [e.event_timestamp, e.event_identifier, ...origem(e.payload)]);
      if (!conv.length) { st.contatos[k] = { lc: x.last_conversion_date, c: [], u: x.uuid }; continue; }
      const d = await get("/platform/contacts/uuid:" + x.uuid) || {};
      st.contatos[k] = { u: x.uuid, lc: x.last_conversion_date, c: conv, quer: d.cf_eu_quero || "", invest: d.cf_investimento || "", prof: d.cf_qual_a_sua_profissaoo || "",
        pipe: d.cf_plug_deal_pipeline || "", etapa: d.cf_plug_funnel_stage || "", perda: d.cf_plug_lost_reason || "", dono: d.cf_plug_contact_owner ? 1 : 0, dt: Date.now() };
      novos++;
    }
    if (fimVarredura || !paginaInteira) break;
    st.varredura.pagina++; st.varredura.vistos = [...vistos]; salvar();
  }
  let removidos = 0;
  if (fimVarredura) {
    if (st.varredura.revisao && chegouNoCorte) {
      // quem está no cache mas não apareceu na lista até o início do período saiu do RD
      const fora = Object.keys(st.contatos).filter(k => !vistos.has(k));
      if (fora.length <= 0.05 * Object.keys(st.contatos).length) { for (const k of fora) delete st.contatos[k]; removidos = fora.length; }
      else console.log(`Aviso RD: ${fora.length} contatos do cache não apareceram na revisão; nada removido (limite de 5%).`);
      st.ultimaRevisao = st.varredura.inicio;
    }
    st.ultimaVarreduraCompleta = st.varredura.inicio; st.varredura = null;
  } else st.varredura.vistos = [...vistos];
  salvar();

  // B) atualiza etapa/motivo de perda de quem já está no cache (mais antigos primeiro)
  const vencidos = Object.entries(st.contatos).filter(([, v]) => v.c.length && Date.now() - (v.dt || 0) > 20 * 3600e3).sort((a, b) => (a[1].dt || 0) - (b[1].dt || 0));
  let atualizados = 0;
  for (const [k, v] of vencidos) {
    if (!tempo()) break;
    const d = await get("/platform/contacts/uuid:" + v.u);
    if (d) Object.assign(v, { pipe: d.cf_plug_deal_pipeline || "", etapa: d.cf_plug_funnel_stage || "", perda: d.cf_plug_lost_reason || "", dono: d.cf_plug_contact_owner ? 1 : 0,
      quer: d.cf_eu_quero || v.quer, invest: d.cf_investimento || v.invest, prof: d.cf_qual_a_sua_profissaoo || v.prof });
    v.dt = Date.now(); atualizados++;
    if (atualizados % 100 === 0) salvar();
  }
  salvar();

  // Enquanto a primeira leitura do histórico não termina, não substitui o arquivo publicado
  // (senão o painel mostraria só parte dos leads). Segue lendo na próxima rodada.
  if (st.varredura && existsSync(OUT)) {
    console.log(`RD: leitura do histórico em andamento (página ${st.varredura.pagina}, ${Object.keys(st.contatos).length} contatos). data-rd.json mantido até terminar.`);
    return;
  }

  // C) agrega (sem dado pessoal)
  const leads = {}, eventos = {};
  const add = (o, k) => { o[k] = (o[k] || 0) + 1; };
  for (const v of Object.values(st.contatos)) {
    if (!v.c.length) continue;
    const conv = [...v.c].sort((a, b) => a[0] < b[0] ? -1 : 1);
    const vistoFrente = {}, vistoEvento = {};
    for (const [ts, id, orig, camp] of conv) {
      const f = classificarForm(id);
      const dia = new Date(new Date(ts).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
      if (f.tipo === "produto" && !vistoFrente[f.frente]) {
        vistoFrente[f.frente] = 1;
        const q = qualifica(v, f.frente);
        // [data, frente, produto, black, origem, campanha, qualificação, etapa, etapa do CRM, motivo de perda, tem dono]
        add(leads, JSON.stringify([dia, f.frente, f.produto, f.black ? 1 : 0, orig, camp, q, etapa(v), (v.pipe ? v.pipe + " › " : "") + (v.etapa || ""), perdaNorm(v.perda), v.dono]));
      } else if (f.tipo === "evento" && !vistoEvento[id]) {
        vistoEvento[id] = 1;
        add(eventos, JSON.stringify([dia, id, orig, camp]));
      }
    }
  }
  const linhas = o => Object.entries(o).map(([k, n]) => [...JSON.parse(k), n]);
  const out = { meta: { gerado: new Date().toISOString(), desde: SINCE, contatos_no_cache: Object.keys(st.contatos).length, varredura_completa: !st.varredura, ultima_varredura: st.ultimaVarreduraCompleta,
      campos_leads: ["data", "frente", "produto", "black", "origem", "campanha", "qualificacao", "etapa", "etapa_crm", "perda", "dono", "n"], campos_eventos: ["data", "evento", "origem", "campanha", "n"] },
    leads: linhas(leads), eventos: linhas(eventos) };
  writeFileSync(OUT, JSON.stringify(out));
  const tot = out.leads.reduce((a, r) => a + r[11], 0);
  console.log(`RD: ${novos} contatos novos, ${atualizados} atualizados, ${chamadas} chamadas em ${Math.round((Date.now() - T0) / 1000)} s. Varredura ${st.varredura ? "continua na próxima rodada (página " + st.varredura.pagina + ")" : "completa"}${removidos ? `, ${removidos} saíram do RD` : ""}. Leads de produto no arquivo: ${tot}.`);
})().catch(e => { console.error("ERRO RD:", limpa(e.message)); process.exit(1); });
