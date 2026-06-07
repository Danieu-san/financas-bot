# Packet 08 - Bills and Due Dates

## Objetivo

Migrar contas recorrentes e vencimentos para `query_engine_primary`, cobrindo
proximos vencimentos, contas fixas, valor esperado, status pago/pendente e
comparacao com realizado.

## Referencias

- `docs/specs/financial-query-architecture.md`
- `docs/specs/financial-query-coverage-matrix.md`
- `docs/specs/financial-query-plan-contract.md`
- `docs/specs/financial-query-migration-roadmap.md`
- `docs/audits/financial-query-legacy-map.md`

## Arquivos provaveis

- `src/query/financialQueryPlan.js`
- `src/query/financialQueryEngine.js`
- `src/handlers/messageHandler.js`
- `src/services/calculationOrchestrator.js`
- `src/services/readModelService.js`
- `src/jobs/scheduler.js`
- `tests/unit.test.js`
- `tests/readModelSqlite.test.js`
- `tests/schedulerJobs.test.js`

## O que nao pode mudar

- Criar lembrete, criar conta e alterar calendario continuam Command Engine ou
  fluxo proprio.
- Cron jobs nao devem ser a unica fonte de calculo para perguntas.
- Nao misturar evento de calendario com conta financeira sem criterio.
- Nao quebrar leitura atual de `Contas`.

## Criterios de aceite

- Perguntas de contas geram `domain=bills`.
- Vencimentos usam data valida do mes, inclusive meses curtos.
- Resposta separa esperado, realizado e pendente quando houver dados.
- Contas familiares e pessoais respeitam escopo.
- Scheduler e WhatsApp usam criterios compativeis.

## Testes obrigatorios

- Vencimentos nos proximos 7 dias.
- Vencimento amanha.
- Dia 31 em mes curto.
- Conta paga com descricao similar.
- Conta familiar vs pessoal.
- Comparacao de esperado vs realizado.

## Perguntas de validacao

- `o que vence amanha?`
- `quais contas vencem nos proximos 7 dias?`
- `ja paguei aluguel?`
- `quanto tenho de contas fixas este mes?`
- `quanto era esperado e quanto foi realizado?`

## Riscos

- Conta cadastrada sem categoria ficar invisivel.
- Conta paga ser marcada como pendente.
- Cron e WhatsApp responderem com regras diferentes.

## Criterio de pronto

Contas e vencimentos sao respondidos pela Query Engine, com criterios alinhados
ao scheduler e sem dependencia de cron para consulta.

## Auditoria concluida

- O scheduler usa o proximo vencimento recorrente e atravessa viradas de mes e
  ano.
- Associacao de pagamento nao aceita subcategoria isolada como evidencia.
- Escopo familiar autorizado pode reconhecer pagamento de outro membro, sem
  alterar o isolamento de consultas pessoais.
- Filtro por conta especifica considera nome amigavel e nome original.
- Pago/pendente continua sendo inferencia auditavel; confirmacao explicita
  exigiria schema ou fluxo futuro.
- O realizado atual usa `Saídas`; pagamento existente somente em cartao ou
  transferencia pode permanecer pendente ate existir vinculacao explicita
  entre fontes.
