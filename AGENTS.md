# Orientação para IAs e pessoas: painel-contourline

Este repositório guarda o painel de captação da Contourline (Meta Ads, Google Ads e RD Station).
Este arquivo vale para o Claude Code (via `CLAUDE.md`), o Codex e qualquer pessoa que trabalhe aqui.

- Não publique, não altere contas, não envie mensagens e não use credenciais
  sem pedido explícito e escopo confirmado.

## Segurança (obrigatório)

O padrão completo está em `docs/SEGURANCA.md` (cópia do padrão comum da Corvo;
a fonte fica no segundo cérebro, em `docs/SEGURANCA.md`). O essencial:

- **Segredos:** nunca escreva senha, token ou chave em arquivo versionado, nem
  em documentação ou exemplo. Leia do cofre (`~/.corvo/credentials`), de `.env`
  ou `.dev.vars` locais, ou dos secrets da Cloudflare, do Supabase ou do GitHub.
  Se encontrar um segredo no repositório, não o use: avise quem pediu a tarefa.
- **Checagem de commit:** rode uma vez neste clone
  `git config core.hooksPath .githooks`. Todo commit passa por
  `.githooks/checar-segredos.ps1`, e o GitHub repete a checagem no workflow
  "Checagem de segredos". Nunca use `--no-verify` nem desligue o hook.
- **Dados pessoais:** não grave no repositório nome, e-mail, telefone, CPF,
  conversas ou planilhas de leads, pacientes e clientes. Nunca publique esses
  dados em repositório público, Pages, painel aberto ou log.
- **Código:** SQL com parâmetros, HTML escapado, chave fora da URL, assinatura
  validada em webhook, RLS no Supabase e cabeçalhos de segurança.
- **Ferramentas:** não adicione servidor MCP, pacote `npx -y` ou dependência
  nova sem a revisão de uma pessoa. Versão sempre fixa.
- **Antes de publicar** (push que publica, deploy): passe a mudança pelo
  **Crivo** (skill do segundo cérebro, `.claude/skills/Crivo`; se não estiver
  disponível aqui, peça uma revisão de segurança do diff) e só publique com
  veredito **PODE SUBIR** e a aprovação de uma pessoa. Nunca crie repositório
  público nem mude a visibilidade de um.

## Regras deste repositório

- **Este repositório é PÚBLICO.** Código, dados, histórico e logs do Actions
  ficam visíveis para qualquer pessoa. Nunca coloque aqui dado pessoal, planilha,
  print de conta ou qualquer informação do cliente que não possa ser pública.
- **RD Station:** `data-rd.json` leva só números agregados (data, frente, produto,
  origem, campanha, qualificação, etapa e contagem). Nome, e-mail, telefone,
  empresa e o identificador do contato nunca entram no arquivo, no log nem no
  repositório. O que a leitura do RD já fez (um registro por contato) fica
  criptografado com `RD_STATE_KEY` no ramo `rd-dados` (`state.enc`, um commit só,
  sobrescrito a cada rodada); no PC, sem a chave, fica em `.cache/` (fora do Git)
  e sem nome nem e-mail.
- **Lista de leads (aba Comercial):** nome e e-mail só existem em `leads.enc`, no
  ramo `rd-dados`, criptografados com o secret `PAINEL_SENHA` (PBKDF2 + AES-GCM);
  a página abre com a mesma senha. Sem o secret, a lista não é gerada. Nunca
  grave a senha em arquivo, nunca a coloque no código e nunca gere a lista em texto.
- **Atualização em corrente:** o `update-data.yml` roda ~5 h atualizando a cada
  ~55 min e dispara a próxima execução sozinho; o `schedule` só reergue a
  corrente se ela cair. Não troque para `cancel-in-progress: false` nem tire o
  `if: success()` do disparo.
- O workflow `update-data.yml` roda com os secrets do Meta, do Google e do RD.
  Nunca imprima token no log; permissões mínimas e actions fixadas por SHA.
  Os tokens devem ser só de leitura e só desta conta.
- Tudo que vem de fora (nome de campanha, UTM, nome de anúncio, formulário) passa
  por `esc()` antes de ir para a tela.
- Os commits automáticos de dados (`data*.json`) não passam pelo hook; a
  checagem do GitHub (`segredos.yml`) cobre o resto.
