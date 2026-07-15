# Fase 8B.2 - telemetria de adocao do Dashboard - gate 2026-07-15

## Veredito

`GO de producao` para caracterizacao duravel de v1/v2.

Permanece `NO-GO` para promover automaticamente o v2, desativar/remover o v1
ou interpretar a amostra inicial sem sessoes como desuso. O dashboard atual
continua sendo o padrao; o v2 continua acessivel apenas por comando explicito.

## Lacuna corrigida

Os contadores anteriores mediam chamadas HTTP. Uma abertura podia produzir
mais de uma chamada, enquanto pagina, sessao, refresh e filtro nao tinham
identidade duravel comum. Portanto, 4.510 acessos v1 contra 43 v2 provavam uso
nao zero, mas nao mediam adocao humana.

## Contrato entregue

- cada aba cria um ID efemero em `sessionStorage`, separado para v1 e v2;
- o frontend envia o ID e o gatilho por headers same-origin;
- o ID bruto nunca e persistido: somente HMAC diario de 16 caracteres;
- eventos distinguem link emitido, sessao inicial, refresh, filtro, API sem
  contexto, auth invalida e v2 desabilitado;
- API tecnica sem sessao nao conta como sessao humana;
- referencias rotativas sao contadas somente em `dashboard_session_started`;
- o relatorio usa o nome `rotating_*_refs_observed`, sem alegar usuarios unicos
  numa janela longa;
- a saida agregada nunca expoe `actor_ref` nem `session_ref`;
- heartbeat ausente ou linha invalida produz `NO_GO_INSTRUMENTATION`;
- o relatorio sempre mantem `removal_candidate=false` nesta fase.

## Evidencia TDD e local

- RED: as paginas nao continham sessao nem headers.
- GREEN inicial do contrato HTTP: `11/11`.
- Gate focado ampliado de dashboard, telemetria e comando WhatsApp: `205/205`.
- Sumarizador agregado: RED por modulo ausente, depois GREEN `2/2`.
- Pretests isolados: 6A `17/17`, 6B `41/41`, 6C `8/8`, 6D `5/5`, 6E `5/5`.
- Suite principal sem repetir pretest: `858/858`.
- Sintaxe, `package.json`, `git diff --check` e varredura de segredos: verdes.
- `npm audit` local nao foi repetido porque o ambiente bloqueou o envio de
  metadados do workspace. Nenhuma dependencia mudou.

## Evidencia de producao

- commit/runtime `a28f9f8`;
- backup do `.env` criado fora do repositorio antes do pull;
- `npm install` remoto: zero vulnerabilidades;
- testes remotos focados: `13/13`;
- PM2 online, WhatsApp pronto, cron inicializado e health
  `{"ok":true,"sqlite":true}`;
- paginas v1 e v2 entregam `X-FinancasBot-Dashboard-Session` no codigo cliente;
- arquivo duravel com permissao `600`;
- relatorio desde 2026-07-15: `OBSERVING`, 16 heartbeats, zero linhas invalidas,
  um arquivo lido e zero eventos v1/v2 na amostra inicial;
- worktree rastreado remoto limpo.

Nenhuma API autenticada foi chamada no smoke pos-deploy. Isso evitou que um
teste tecnico fosse confundido com uma sessao humana.

## Inteligencia da decisao

Zero eventos logo apos o deploy significa apenas que nenhuma sessao ocorreu na
amostra curta. O heartbeat prova que a instrumentacao esta funcionando. A
classificacao de uso exige a janela da Fase 8, sessoes reais e separacao dos
eventos tecnicos; o v1 continua protegido como rollback.

## Rollback

- `LEGACY_USAGE_TELEMETRY_ENABLED=false` desliga a persistencia sem afetar o
  dashboard;
- `DASHBOARD_V2_ENABLED=false` desliga apenas pagina/API v2;
- o comando `dashboard` continua apontando para v1;
- o commit anterior pode ser restaurado sem migration de dado ou schema.

## Proximo gate

8B.3: decidir explicitamente o status de produto do undo 6E. Na ausencia de
requisito de uso pelo WhatsApp, manter servico/testes, desligar o canario
produtivo e classificar como test-only. Nenhum codigo sera removido.
