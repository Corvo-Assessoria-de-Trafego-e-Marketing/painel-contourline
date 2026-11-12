// fetch-meta.mjs — Meta Ads da Contourline → ../data.json (por dia e por anúncio, já com frente e produto).
// Rodado pelo GitHub Actions. Node 20+. Env: META_TOKEN (obrigatório), AD_ACCOUNT_ID, SINCE.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classificarMidia, utmCampanhas, apelidosUnicos } from "./classificar.mjs";

const TOKEN = (process.env.META_TOKEN || "").trim();
const ACCOUNT = (process.env.AD_ACCOUNT_ID || "2342726552705025").replace(/^act_/, "").trim();
const SINCE = (process.env.SINCE || "2026-10-01").trim();
const API = "https://graph.facebook.com/v22.0/";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data.json");
if (!TOKEN) { console.error("Falta META_TOKEN"); process.exit(1); }

const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const espera = ms => new Promise(r => setTimeout(r, ms));
const limpa = s => String(s).split(TOKEN).join("***");

async function chama(url) {
  for (let i = 0; i < 8; i++) {
    let j;
    try { j = await (await fetch(url)).json(); } catch (e) { await espera(5000 * (i + 1)); continue; }
    if (j.error && [4, 17, 32, 613, 80000, 80004].includes(j.error.code)) { console.log("    limite da API, aguardando…"); await espera(60000); continue; }
    if (j.error) throw new Error(limpa(j.error.message));
    return j;
  }
  throw new Error("Meta sem resposta depois de várias tentativas");
}
async function todos(path, params) {
  let url = API + path + "?" + new URLSearchParams({ ...params, access_token: TOKEN });
  const out = [];
  while (url) { const j = await chama(url); out.push(...(j.data || [])); url = j.paging && j.paging.next; }
  return out;
}

const ACOES_LEAD = ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"];
const ACOES_INSC = ["complete_registration", "offsite_conversion.fb_pixel_complete_registration"];
const pega = (A, lista) => { for (const k of lista) if (A[k] != null) return +A[k]; return 0; };

(async () => {
  const ate = hojeBR();
  console.log(`Meta · conta ${ACCOUNT} · ${SINCE} a ${ate}`);
  // Busca em janelas de 10 dias para não estourar a resposta.
  const linhas = [];
  let d0 = new Date(SINCE + "T12:00:00Z");
  const fim = new Date(ate + "T12:00:00Z");
  while (d0 <= fim) {
    const d1 = new Date(Math.min(d0.getTime() + 9 * 864e5, fim.getTime()));
    const since = d0.toISOString().slice(0, 10), until = d1.toISOString().slice(0, 10);
    const r = await todos(`act_${ACCOUNT}/insights`, {
      level: "ad", time_increment: "1", limit: "500",
      time_range: JSON.stringify({ since, until }),
      fields: "date_start,campaign_id,campaign_name,adset_name,ad_id,ad_name,spend,impressions,inline_link_clicks,actions",
    });
    linhas.push(...r);
    console.log(`    ${since} a ${until}: ${r.length} linhas`);
    d0 = new Date(d1.getTime() + 864e5);
  }
  // Status atual das campanhas (para marcar ativas)
  const camps = await todos(`act_${ACCOUNT}/campaigns`, { fields: "id,name,effective_status", limit: "500" });
  const ativa = Object.fromEntries(camps.map(c => [c.id, c.effective_status === "ACTIVE"]));

  // Dicionários para encolher o arquivo
  const dic = { campanhas: [], anuncios: [] };
  const idxC = {}, idxA = {};
  const rows = [];
  let gasto = 0;
  for (const x of linhas) {
    const spend = +x.spend || 0;
    const A = Object.fromEntries((x.actions || []).map(a => [a.action_type, +a.value]));
    const leads = pega(A, ACOES_LEAD), insc = pega(A, ACOES_INSC);
    if (!spend && !leads && !insc) continue;
    if (idxC[x.campaign_id] == null) {
      // nível campanha: sem o conjunto (o impulsionamento tem um conjunto por perfil)
      const c = classificarMidia({ campanha: x.campaign_name, conjunto: /impuls|trafego-perfis/i.test(x.campaign_name) ? "" : x.adset_name, anuncio: "" });
      idxC[x.campaign_id] = dic.campanhas.length;
      dic.campanhas.push({ id: x.campaign_id, nome: x.campaign_name, frente: c.frente, black: c.black, tipo: c.tipo, ativa: !!ativa[x.campaign_id] });
    }
    if (idxA[x.ad_id] == null) {
      const c = classificarMidia({ campanha: x.campaign_name, conjunto: x.adset_name, anuncio: x.ad_name });
      idxA[x.ad_id] = dic.anuncios.length;
      dic.anuncios.push({ nome: x.ad_name, conjunto: x.adset_name, produto: c.produto, frente: c.frente, tipo: c.tipo });
    }
    gasto += spend;
    // [data, campanha, anúncio, gasto, impressões, cliques no link, leads, inscrições]
    rows.push([x.date_start, idxC[x.campaign_id], idxA[x.ad_id], Math.round(spend * 100) / 100, +x.impressions || 0, +x.inline_link_clicks || 0, leads, insc]);
  }
  // UTM escrita à mão nos anúncios (ex.: conv-ctl-hipro-leads-2026-05) vira apelido da campanha: o painel acha os leads do CRM por ela.
  try {
    const ids = dic.campanhas.map(c => c.id), porCamp = {};
    for (let i = 0; i < ids.length; i += 50) {
      const ads = await todos(`act_${ACCOUNT}/ads`, { fields: "campaign_id,creative{url_tags,object_story_spec,asset_feed_spec}", limit: "100",
        filtering: JSON.stringify([{ field: "campaign.id", operator: "IN", value: ids.slice(i, i + 50) }]) });
      for (const a of ads) {
        const cr = a.creative || {};
        for (const u of utmCampanhas([cr.url_tags, JSON.stringify(cr.object_story_spec || {}), JSON.stringify(cr.asset_feed_spec || {})].join(" ")))
          (porCamp[a.campaign_id] = porCamp[a.campaign_id] || new Set()).add(u);
      }
    }
    const { out: ap, ambiguos } = apelidosUnicos(porCamp, Object.fromEntries(dic.campanhas.map(c => [c.id, c.nome])));
    for (const c of dic.campanhas) if (ap[c.id]) c.utm = ap[c.id];
    console.log(`UTM com outro nome: ${Object.keys(ap).length} campanhas${ambiguos.length ? " · ignoradas (em mais de uma campanha): " + ambiguos.join(", ") : ""}`);
  } catch (e) { console.log("Aviso: não leu as UTMs dos anúncios:", limpa(e.message)); }
  const out = { meta: { gerado: new Date().toISOString(), hoje: ate, desde: SINCE, conta: ACCOUNT, campos: ["data", "campanha", "anuncio", "gasto", "impressoes", "cliques", "leads", "inscricoes"] }, ...dic, rows };
  writeFileSync(OUT, JSON.stringify(out));
  const porFrente = {};
  for (const r of rows) { const f = dic.campanhas[r[1]].frente; porFrente[f] = (porFrente[f] || 0) + r[3]; }
  console.log(`OK: ${rows.length} linhas, R$ ${gasto.toFixed(2)} no total.`);
  for (const [f, v] of Object.entries(porFrente).sort((a, b) => b[1] - a[1])) console.log(`    ${f}: R$ ${v.toFixed(2)}`);
})().catch(e => { console.error("ERRO Meta:", limpa(e.message)); process.exit(1); });
