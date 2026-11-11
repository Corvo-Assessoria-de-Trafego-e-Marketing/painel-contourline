# Painel Contourline

Painel de captação da Contourline: Meta Ads, Google Ads e RD Station, atualizado de hora em hora.

```
GitHub Actions (de hora em hora)
  ├─ scripts/fetch-meta.mjs   → Meta Marketing API      → data.json        (por dia e por anúncio)
  ├─ scripts/fetch-google.mjs → Google Ads API          → data-google.json (por dia e por campanha)
  └─ scripts/fetch-rd.mjs     → RD Station Marketing    → data-rd.json     (SÓ agregado, sem nome/e-mail/telefone)
index.html (estático) → lê os três JSON → filtra período, frente, produto e plataforma no navegador
```

## Regras de dados

- **Nada de dado pessoal no repositório.** O `data-rd.json` só tem contagens por dia, frente, produto, origem, campanha, qualificação e etapa. O que o RD já leu (com o identificador interno de cada contato) fica em `.cache/`, que está no `.gitignore` e vive só no cache do GitHub Actions.
- **Frente e produto** saem de `scripts/classificar.mjs` (um lugar só para Meta, Google e RD). Mudou o padrão de nome de campanha, um produto ou um formulário do RD: ajuste ali.
- **Qualificado no CRM** = quer investir, investimento acima de R$ 0 e perfil da linha (linhas médicas: médico, dono de clínica, investidor ou locador). Mesma régua do relatório de outubro/2026.
- **Origem no RD** chega em dois formatos (campos `traffic_*` na Innove; JSON `first_session/current_session` nas outras frentes). O `fetch-rd.mjs` lê os dois e usa a sessão da conversão.

## O que muda de mês a mês

No começo do `<script>` do `index.html`, bloco `CONFIG`:
- `teto`: verba total do mês (mostra a barra e a projeção no Resumo, com "Este mês").
- `black`: mês, verba e data final da Black Experience. A aba da Black só aparece quando há gasto de campanha da Black no período.

## Secrets e variáveis (Settings → Secrets and variables → Actions)

| Tipo | Nome | O quê |
|---|---|---|
| Secret | `META_TOKEN` | Token do Meta com `ads_read` na conta act_2342726552705025 |
| Secret | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DEVELOPER_TOKEN` | Acesso ao Google Ads 717-687-7816 |
| Secret | `RD_CLIENT_ID`, `RD_CLIENT_SECRET`, `RD_REFRESH_TOKEN` | App do RD Station Marketing da Contourline |
| Variável | `SINCE` | Início do histórico (padrão `2026-10-01`) |

## Primeira carga do RD

Sem cache, o `fetch-rd.mjs` lê o histórico em partes (até ~2.400 chamadas ou 35 min por rodada). Nas primeiras horas o painel mostra o aviso "O RD ainda está carregando o histórico". Depois, cada rodada só lê as conversões novas e atualiza a etapa dos contatos uma vez por dia.

## Rodar à mão

Actions → "Atualizar dados Contourline (Meta + Google + RD)" → Run workflow.
