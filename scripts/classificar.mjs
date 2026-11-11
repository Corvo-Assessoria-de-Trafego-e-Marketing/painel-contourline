// classificar.mjs — regras únicas de frente e produto para Meta, Google e RD.
// Mudou nome de produto, formulário ou padrão de campanha? Ajuste só aqui.

export const FRENTES = ["Innove", "Contourline Med", "Cynosure", "Lumenis", "Visbody"];

// Ordem importa: o primeiro que casar vence (HIPRO MED antes de HIPRO; ULTRAPULSE antes de ULTRA).
export const PRODUTOS = [
  { p: "HIPRO Med", f: "Contourline Med", re: /hipro[\s_-]*med/i },
  { p: "Unyque PRO + Enygma", f: "Contourline Med", re: /unyque|enygma|lipedema|body[\s_-]*synergy|body[\s_-]*health|bodyhealth/i },
  { p: "Supreme PRO", f: "Contourline Med", re: /supreme/i },
  { p: "Iconyc", f: "Contourline Med", re: /iconyc/i },
  { p: "Reverso", f: "Contourline Med", re: /reverso/i },
  { p: "XERF", f: "Cynosure", re: /xerf/i },
  { p: "eCO2", f: "Cynosure", re: /\beco[\s_-]*2|[-_]eco2/i },
  { p: "Ultrapulse Alpha", f: "Lumenis", re: /ultra[\s_-]*pulse|(^|[-_\s])upa([-_\s]|$)/i },
  { p: "Ultralift", f: "Innove", re: /ultra[\s_-]*lift/i },
  { p: "Ultra", f: "Cynosure", re: /ultra(?![\s_-]*(pulse|lift|ssom|sound|former|clear|focaliz|fino))|lasemd/i },
  { p: "FoLix", f: "Lumenis", re: /folix/i },
  { p: "triLift", f: "Lumenis", re: /tri[\s_-]*lift/i },
  { p: "NuEra Tight", f: "Lumenis", re: /nuera/i },
  { p: "Stellar M22", f: "Lumenis", re: /stellar|(^|[-_\s])m22([-_\s]|$)/i },
  { p: "Visbody", f: "Visbody", re: /visbody|m[\s_-]*30|s[\s_-]*30|creator/i },
  { p: "MultiShape", f: "Innove", re: /multi[\s_-]*shape/i },
  { p: "Focuskin", f: "Innove", re: /focuskin/i },
  { p: "Duet Edge", f: "Innove", re: /duet/i },
  { p: "Skinpulse", f: "Innove", re: /skin[\s_-]*pulse/i },
  { p: "Xtonus", f: "Innove", re: /x[\s_-]*tonus/i },
  { p: "EuroPlasma", f: "Innove", re: /euro[\s_-]*plasma/i },
  { p: "Crystal 3D", f: "Innove", re: /crystal/i },
  { p: "Hive Pro", f: "Innove", re: /hive/i },
  { p: "HIPRO", f: "Innove", re: /hipro/i },
];

const FRENTE_NOME = [
  ["Innove", /innove|\[ctl\]\[hipro\]/i],
  ["Contourline Med", /(^|[-_\s\[])med([-_\s\]]|$)|ctlmed|contourline[\s_-]*med|hipro[\s_-]*med/i],
  ["Cynosure", /cynosure/i],
  ["Lumenis", /lumenis|(^|[-_\s\[])lum([-_\s\]]|$)/i],
  ["Visbody", /visbody|(^|[-_\s\[])vis([-_\s\]]|$)/i],
];

export function produtoDe(...textos) {
  for (const t of textos) {
    if (!t) continue;
    for (const x of PRODUTOS) if (x.re.test(t)) return x;
  }
  return null;
}

export function frenteDoNome(nome) {
  for (const [f, re] of FRENTE_NOME) if (re.test(nome || "")) return f;
  return null;
}

// Campanha/conjunto/anúncio de mídia → {frente, produto, black, tipo}
export function classificarMidia({ campanha = "", conjunto = "", anuncio = "" }) {
  const black = /black/i.test(campanha);
  const marca = /\[brand\]|marca/i.test(campanha) && !/black/i.test(campanha);
  const impuls = /impuls|trafego-perfis/i.test(campanha);
  const evento = /webinar|jantar|brunch|evento|workshop/i.test(campanha);
  const tipo = impuls ? "Impulsionamento" : evento ? "Evento" : /engaj|topo|\[eng\]|\[atr\]|video|thruplay/i.test(campanha) ? "Alcance" : /rmkt|\[rmk\]|remarketing|hot|quente/i.test(conjunto + " " + campanha) ? "Remarketing" : "Captação";
  if (impuls) return { frente: frenteDoNome(conjunto) || "Perfis", produto: "Perfis do Instagram", black: false, tipo };
  if (marca) return { frente: "Marca", produto: "Marca", black: false, tipo: "Marca" };
  const doNome = frenteDoNome(campanha);
  const hiproMed = x => (x && x.p === "HIPRO" && doNome === "Contourline Med") ? PRODUTOS[0] : x;
  // 1) produto pelo nome da campanha/conjunto: manda na frente
  //    (campanhas antigas "CTLMED" de XERF/eCO2 são Cynosure)
  const prodCamp = hiproMed(produtoDe(conjunto, campanha));
  const base = prodCamp ? prodCamp.f : doNome;
  // 2) o nome do anúncio só refina dentro da mesma frente
  //    (texto de anúncio cita outros produtos: "ultrafocalizada", "lipedema" num anúncio de MultiShape…)
  const prodAd = hiproMed(produtoDe(anuncio));
  //    se o anúncio cita o produto do conjunto junto com outro ("HIPRO-FOCUSKIN"), fica o do conjunto
  const prod = prodCamp && prodCamp.re.test(anuncio || "") ? prodCamp
    : prodAd && (!base || prodAd.f === base) ? prodAd : prodCamp;
  // Sem produto: vale o nome da campanha; a Black é sempre da Innove.
  const frente = base || (prod ? prod.f : (black ? "Innove" : "Outros"));
  const produto = prod ? prod.p : (black ? "Black (geral)" : doNome ? "Geral da frente" : "Sem produto");
  return { frente, produto, black, tipo };
}

// Formulário do RD → {tipo: produto|evento|material|interno|outros, frente, produto, black}
const EVENTO = /webinar|jantar|brunch|workshop|gravacao|evento/i;
const MATERIAL = /ebook|e-book|guia|kit|glossario|planilha|material/i;
const INTERNO = /^(clientes-rdstation|rd station crm|presentes|changeover|importa)/i;
const FORM_PRODUTO = [
  [/^bf-innove/i, null], // Black: produto pelo nome
  [/form-innove-home/i, { p: "Geral da frente", f: "Innove" }],
  [/visbody/i, { p: "Visbody", f: "Visbody" }],
  [/lp-xerf/i, { p: "XERF", f: "Cynosure" }],
  [/fale-conosco-body-health|protocolo-body-synergy/i, { p: "Unyque PRO + Enygma", f: "Contourline Med" }],
];
export function classificarForm(id) {
  const s = String(id || "");
  if (INTERNO.test(s)) return { tipo: "interno" };
  if (EVENTO.test(s)) return { tipo: "evento" };
  if (MATERIAL.test(s)) return { tipo: "material" };
  const black = /^bf-/i.test(s);
  for (const [re, val] of FORM_PRODUTO) if (re.test(s) && val) return { tipo: "produto", frente: val.f, produto: val.p, black };
  const x = produtoDe(s.replace(/^form-|^bf-innove-|^bf-/i, ""));
  if (x) return { tipo: "produto", frente: black ? "Innove" : x.f, produto: x.p, black };
  return { tipo: "outros" };
}
