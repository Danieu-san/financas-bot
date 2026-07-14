# Fase 5D - gate de saida da Fase 5

Data: 2026-07-14

## Objetivo

Encerrar a Fase 5 com uma bateria repetivel que prove, sobre a mesma
fotografia financeira, coerencia entre a autoridade legivel em Sheets, o
ledger de planos projetado, o Query Engine usado pelo WhatsApp e o dashboard
v2. O gate tambem precisa provar que simulacoes permanecem read-only e que o
rollback por flag falha fechado.

## Cobertura automatizada

O arquivo `tests/phase5ExitGate.test.js` cobre tres verticais:

1. Um aporte de meta e um pagamento de financiamento passam pela escrita
   confiavel e mantem os saldos identicos nas linhas legadas, na projecao, nas
   respostas locais do WhatsApp e nos blocos do dashboard v2.
2. A simulacao de retirada informa o cenario sem persistir escrita, enquanto
   o cronograma do financiamento permanece deterministico em repeticoes.
3. Modo ausente, modo invalido ou usuario fora da allowlist retornam ao fluxo
   legado com escrita shadow desativada.

Invariantes adicionais:

- movimentos de plano nao criam fatos em `Entradas` ou `Saidas`;
- resposta publica nao expoe `user_id`, `plan_id`, referencias legadas,
  chaves de operacao ou checksums internos;
- valores monetarios comparados entre superficies usam a mesma unidade;
- o teste utiliza store SQLite em memoria e fixtures sanitizadas, sem tocar
  dados reais.

## Evidencia local

- gate 5D isolado: `3/3`;
- suite completa: `848/848`;
- falhas, cancelamentos, skips e todos: zero;
- `npm audit --audit-level=high`: zero vulnerabilidades;
- `git diff --check`: limpo.

## E2E e dados reais

O E2E marker-only real da 5C, executado imediatamente antes deste gate,
confirmou dois planos, tres movimentos, replay, zero contaminacao contabil,
`cleanup=zero` e `privacy=true`. A 5D nao altera codigo de producao nem o
protocolo de escrita; portanto nao repete uma mutacao real apenas para validar
um arquivo de teste. A validacao remota executara o gate automatizado contra o
mesmo codigo publicado e confirmara health e configuracao preservados.

## Rollback

O rollback operacional continua sendo
`PROJECTED_PLAN_WRITES_MODE=off`, seguido de reinicio do PM2 com ambiente
atualizado. A politica rejeita modo invalido e exige correspondencia exata da
allowlist. O SQLite de recibos nao deve ser apagado, pois ele e evidencia de
auditoria.

## Evidencia de deploy

- commit publicado e implantado por fast-forward:
  `1e25c9a90bc89e31c6fef6551adbcb3b5ac161ba`;
- gate 5D remoto: `3/3`;
- worktree rastreado da EC2: limpo;
- PM2: `online`;
- health: `{"ok":true,"sqlite":true}`;
- rollout preservado em `shadow` para exatamente um usuario;
- nenhum restart foi necessario porque a fatia altera somente teste,
  package scripts e documentacao.

## Decisao final

`GO de producao`. A Fase 5 esta encerrada e a Fase 6A - correcao e
categorizacao em lote - esta autorizada a iniciar. Sheets continua como
autoridade legivel e o rollout de escrita projetada permanece restrito ao
canario existente.
