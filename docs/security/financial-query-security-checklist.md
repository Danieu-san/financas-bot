# Financial Query Security Checklist

Atualizado em: 2026-06-05

## Objetivo

Este checklist e obrigatorio para qualquer mudanca na Financial Query Engine em
contexto financeiro multiusuario.

Ele protege tres fronteiras ao mesmo tempo:

- linguagem natural nao confiavel;
- dados financeiros pessoais e familiares;
- integracoes sensiveis como dashboard, admin, uploads, Google e Gemini.

A Query Engine deve permanecer read-only. Comandos que escrevem dados,
importam arquivos, alteram usuarios, geram links ou executam manutencao ficam
fora dela.

## Como usar

Use este checklist:

- antes de iniciar qualquer pacote em `docs/specs/implementation-packets/`;
- antes de encerrar um pacote de migracao;
- antes de release que altere planner, Query Engine, dashboard, admin, logs,
  uploads, rate limit ou uso de Gemini;
- sempre que uma pergunta real cair em fallback por seguranca ou escopo.

## Legenda de status

| Status | Significado |
| --- | --- |
| `REQUIRED` | Controle obrigatorio ainda precisa ser validado no pacote ou release. |
| `PASS` | Controle verificado com evidencia suficiente. |
| `GAP` | Controle ausente ou incompleto. Nao liberar o dominio afetado. |
| `N/A` | Nao se aplica ao pacote, com justificativa documentada. |

## Checklist

| Area | Controle obrigatorio | Evidencia esperada | Onde verificar | Status | Risco se falhar |
| --- | --- | --- | --- | --- | --- |
| Prompt injection e prompt probing | Rodar Security Gate antes de planner LLM, consulta financeira ou Command Engine; bloquear bypass, modo admin falso, pedido de prompt interno, pedido misto com segredo e tentativa de ignorar regras. | Testes adversariais passam; logs mostram evento sanitizado; pedido inseguro nao chama Gemini nem Query Engine. | `src/handlers/messageHandler.js`, security gate, `tests/unit.test.js`, `docs/qa/financial-query-acceptance-battery.md`, logs sanitizados. | REQUIRED | Usuario pode extrair regras internas, induzir vazamento ou executar consulta indevida. |
| Vazamento de dados internos | Rejeitar em qualquer nivel do plano ou resposta: `user_id`, `userId`, `sheet_id`, `sheetId`, `spreadsheetId`, `token`, `secret`, `prompt`, `systemPrompt`, `rawRows`, `rawData`, `allUsers`, `admin`. | `normalizeFinancialQueryPlan` rejeita campos proibidos; exemplos publicos usam nomes/apelidos, nunca IDs; respostas nao revelam IDs internos. | `src/query/financialQueryPlan.js`, `docs/specs/financial-query-plan-contract.md`, testes de planner, logs. | REQUIRED | Exposicao de identificadores internos facilita correlacao, abuso, suporte indevido ou vazamento tecnico. |
| Vazamento entre usuarios | Escopo real deve ser resolvido fora do LLM; usuario so ve dados proprios, familiares autorizados ou suporte consentido e auditado. | Testes A/B provam que usuario A nao acessa usuario B; consultas familiares exigem vinculo ativo; admin nao amplia escopo financeiro por prompt. | Scope Resolver futuro/atual, `readModelService`, dashboard API, `docs/decisions/ADR-002-admin-financial-data-access.md`, testes multiusuario. | REQUIRED | Maior risco do produto: exposicao de dados financeiros pessoais de terceiros. |
| Dashboard token | Links devem usar fragmento `#token=`, TTL curto, cap de TTL, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, limpeza da URL no browser e logs sem token/querystring. | Smoke de dashboard valida token valido/expirado; access log guarda hashes/escopos, nao token; API rejeita `user=all` por padrao. | `src/services/dashboardServer.js`, `docs/security/threat-model.md`, `docs/runbooks/release-checklist.md`, testes de dashboard. | REQUIRED | Quem receber, copiar ou capturar URL pode abrir dados financeiros como bearer token. |
| Familia | `personal`, `family` e `member` sao permissoes resolvidas por codigo; desfazer vinculo deve impedir novas leituras e, quando aplicavel, revogar compartilhamento no Drive. | Testes cobrem vinculo ativo, sem vinculo, membro removido e dono da planilha; perguntas por membro usam nome publico, nao ID. | `docs/specs/implementation-packets/09-family-scope.md`, servicos de familia/compartilhamento, testes multiusuario, auditoria Drive quando existir. | REQUIRED | Membro antigo ou nao autorizado pode continuar vendo dados da familia. |
| Admin | Admin nao tem acesso financeiro amplo por padrao; acoes sensiveis exigem confirmacao em duas etapas, auditoria sanitizada e `ADMIN_IDS` minimo. | ADR-002 revisado; `DASHBOARD_ADMIN_ALL_USERS_ENABLED` desativado por padrao; AdminActionLog nao grava telefone completo, corpo de mensagem, tokens ou IDs internos. | `src/utils/adminCheck.js`, comandos admin, `data/admin-actions.jsonl`, `docs/decisions/ADR-002-admin-financial-data-access.md`, release checklist. | REQUIRED | Erro de admin, typo ou privilegio excessivo pode expor ou alterar dados de usuarios. |
| Logs | Nao registrar mensagens financeiras cruas, tokens, links privados, telefones completos, IDs internos, prompts completos, linhas de planilha ou corpos de arquivo. | Grep de logs e testes de logger mostram redacao; eventos suspeitos usam hash/resumo seguro; erros nao expoem stack sensivel ao usuario. | `src/utils/logger.js`, security gate, dashboard/admin access logs, `docs/security/threat-model.md`, release checklist. | REQUIRED | Logs viram banco paralelo de dados pessoais e segredos. |
| Uploads/importacao | Aceitar apenas formatos permitidos; limitar tamanho e linhas antes do parse; nao enviar arquivo bruto ao LLM; preview deve ser limitado/sanitizado; duplicados e transferencias internas devem ser tratados deterministicamente. | Testes de importacao cobrem limite de tamanho/linhas, extensao invalida, duplicado, familia e confirmacao; Gemini nao recebe CSV/OFX cru. | `src/services/statementImportService.js`, `tests/statementImportService.test.js`, `docs/security/threat-model.md`, release checklist. | REQUIRED | Arquivo malicioso pode gerar DoS, custo alto, vazamento para LLM ou lancamento incorreto. |
| Rate limit e DoS | Aplicar limites por usuario e por fluxo; proteger importacoes, perguntas analiticas e chamadas Gemini; usar cache/read-model e circuit breaker quando Sheets ou Gemini falharem. | Testes ou smoke mostram resposta amigavel sob limite/quota; metricas registram hit/miss e fallback; usuario nao consegue esgotar quota com burst simples. | `src/utils/rateLimiter.js`, `src/services/readModelService.js`, `src/services/google.js`, testes de rate limit/quota. | REQUIRED | Um usuario, bot ou loop pode derrubar o servico, estourar quota ou gerar custo inesperado. |
| Dados sensiveis no Gemini | Gemini pode interpretar linguagem natural ou redigir texto, mas nunca receber planilha inteira, linhas cruas, tokens, IDs internos, URLs privadas, segredos, prompts internos ou dados de terceiros; nunca calcula valores finais. | Planner LLM recebe contexto minimo e retorna somente rascunho de plano validado; respostas financeiras vem da Query Engine; testes verificam que totais/rankings/percentuais nao sao calculados pelo LLM. | `src/ai/intentClassifier.js`, `src/ai/responseGenerator.js`, `src/services/gemini.js`, `docs/specs/financial-query-architecture.md`, contrato do plano. | REQUIRED | Vazamento para fornecedor de IA, alucinacao matematica e resposta financeira incoerente. |

## Secoes obrigatorias

As secoes abaixo repetem os mesmos controles da tabela em formato de checklist
por tema. Use a tabela para leitura rapida e estas secoes para preencher
evidencias durante a implementacao.

### Prompt injection e prompt probing

- Controle obrigatorio: Security Gate antes de planner LLM, consulta
  financeira ou Command Engine.
- Evidencia esperada: testes adversariais passam; pedido inseguro nao chama
  Gemini nem Query Engine.
- Onde verificar: security gate, `messageHandler`, testes unitarios, bateria de
  aceite e logs sanitizados.
- Status: REQUIRED.
- Risco se falhar: usuario pode induzir bypass, extrair regras internas ou
  consultar dados indevidos.

### Vazamento de dados internos

- Controle obrigatorio: rejeitar campos internos/sensiveis no plano, resposta e
  logs.
- Evidencia esperada: campos proibidos invalidam o plano e nunca aparecem em
  resposta ao usuario.
- Onde verificar: `financialQueryPlan`, contrato do plano, testes de planner e
  logs.
- Status: REQUIRED.
- Risco se falhar: IDs, tokens ou detalhes internos podem facilitar abuso e
  correlacao de dados.

### Vazamento entre usuarios

- Controle obrigatorio: resolver permissao fora do LLM e aplicar escopo antes
  de qualquer leitura.
- Evidencia esperada: testes provam que usuario A nao ve usuario B e que
  familia exige vinculo ativo.
- Onde verificar: Scope Resolver, read-model, dashboard API e testes
  multiusuario.
- Status: REQUIRED.
- Risco se falhar: exposicao de dados financeiros pessoais de terceiros.

### Dashboard token

- Controle obrigatorio: token curto, em fragmento `#token=`, com headers
  anti-cache/referrer e logs sanitizados.
- Evidencia esperada: token valido/expirado testado; API rejeita escopo
  indevido; logs nao guardam token.
- Onde verificar: dashboard server, testes de dashboard, threat model e release
  checklist.
- Status: REQUIRED.
- Risco se falhar: link compartilhado ou capturado pode abrir dados
  financeiros.

### Familia

- Controle obrigatorio: `personal`, `family` e `member` dependem de vinculo e
  autorizacao resolvidos por codigo.
- Evidencia esperada: testes cobrem vinculo ativo, sem vinculo e membro
  removido.
- Onde verificar: pacote 09, servicos de familia/compartilhamento e testes
  multiusuario.
- Status: REQUIRED.
- Risco se falhar: membro antigo ou externo pode continuar consultando dados
  familiares.

### Admin

- Controle obrigatorio: admin nao tem acesso financeiro amplo por padrao;
  comandos sensiveis exigem confirmacao e auditoria.
- Evidencia esperada: ADR-002 revisado; `ADMIN_IDS` minimo; AdminActionLog
  sanitizado; dashboard all-users bloqueado por padrao.
- Onde verificar: adminCheck, comandos admin, AdminActionLog, ADR-002 e release
  checklist.
- Status: REQUIRED.
- Risco se falhar: privilegio excessivo ou typo pode expor ou alterar dados de
  usuario.

### Logs

- Controle obrigatorio: logs nao guardam mensagens financeiras cruas, tokens,
  telefones completos, IDs internos, prompts completos ou linhas de planilha.
- Evidencia esperada: grep de logs/testes mostra redacao e hashes em eventos
  sensiveis.
- Onde verificar: logger, security gate, dashboard/admin access logs e release
  checklist.
- Status: REQUIRED.
- Risco se falhar: logs viram banco paralelo de dados pessoais.

### Uploads/importacao

- Controle obrigatorio: formatos permitidos, limites antes do parse, nenhum
  arquivo bruto no LLM, preview seguro e confirmacao.
- Evidencia esperada: testes cobrem limite, extensao invalida, duplicado,
  familia e confirmacao.
- Onde verificar: statement import service, testes de importacao e threat
  model.
- Status: REQUIRED.
- Risco se falhar: arquivo malicioso pode causar DoS, custo alto, vazamento ou
  lancamento incorreto.

### Rate limit e DoS

- Controle obrigatorio: limites por usuario/fluxo, cache/read-model,
  tratamento de quota e circuit breaker.
- Evidencia esperada: testes ou smoke mostram resposta amigavel sob limite e
  falha externa.
- Onde verificar: rate limiter, read-model, servicos Google/Gemini e testes de
  quota.
- Status: REQUIRED.
- Risco se falhar: um usuario ou loop pode derrubar o bot ou estourar quota.

### Dados sensiveis no Gemini

- Controle obrigatorio: Gemini recebe apenas contexto minimo/sumarizado e nunca
  calcula valores financeiros finais.
- Evidencia esperada: planner LLM retorna rascunho de plano validado; Query
  Engine calcula; Response Composer nao recalcula.
- Onde verificar: intent classifier, response generator, gemini service,
  arquitetura e contrato.
- Status: REQUIRED.
- Risco se falhar: vazamento para LLM, alucinacao matematica e resposta
  financeira incoerente.

## Release gate

Nenhum pacote de implementacao da Financial Query deve ser marcado como pronto
se houver `GAP` em area aplicavel deste checklist.

Se um controle estiver fora do dominio do pacote, marque como `N/A` somente com
justificativa explicita. Exemplo: uploads podem ser `N/A` no pacote de metas,
mas continuam obrigatorios no release global.

## Evidencia minima por pacote

Cada pacote de implementacao deve registrar:

- testes de planner ou roteamento;
- testes da Query Engine;
- testes de resposta sem recalculo pelo LLM;
- teste adversarial aplicavel;
- teste de escopo pessoal/familiar quando o dominio puder cruzar usuarios;
- verificacao de que logs e erros nao contem dado sensivel.

## Nao fazer

- Nao enviar planilha inteira ao Gemini.
- Nao aceitar campo desconhecido no `FinancialQueryPlan`.
- Nao usar dashboard admin amplo como fonte normal de resposta.
- Nao expor ID interno para "ajudar debug" no WhatsApp.
- Nao tratar `block` ou `clarify` como operacao executavel da Query Engine.
- Nao criar atalho por frase que pule Security Gate, Scope Resolver ou
  validacao do plano.
