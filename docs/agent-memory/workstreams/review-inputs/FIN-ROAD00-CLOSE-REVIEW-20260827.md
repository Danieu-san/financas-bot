# FinançasBot — pacote de revisão independente ROAD-00 — 2026-08-27

## Alvo imutável

- repositório: `Danieu-san/financas-bot`
- branch de origem: `chat/financial-roadmap-road00-20260827`
- commit candidato imutável: `8cb524ab48ee5dc5b9c9db1a46907fe806f00af9`
- base de abertura do workstream: `2c97774c5be2b0d449e890bc19f48a7a3e130d88`
- roadmap normativo: `financial-roadmap-draft-v2.md` blob `904d652fc1931ff5c80d6c1066ac5f57a96f5b84`

O compare do workstream entre base e candidato contém apenas documentação/checkpoint do ROAD-00; nenhum `src/`, `scripts/`, `tests/` ou configuração de runtime foi alterado.

## Gate ROAD-00 normativo

ROAD-00 exige: matriz de autoridade/consumers; Golden Set sanitizado; telemetria Fase 8 classificada `HEALTHY/STALE/BROKEN/UNKNOWN`; fixtures de schema; shadows/canários/flags datados ou `UNKNOWN`; lacunas externas registradas; revisão independente; zero alteração funcional.

## 00.1/00.2 — inventário

A matriz versionada do candidato possui 18 grupos:

1. entrada textual/roteamento WhatsApp;
2. perguntas financeiras — legado/Financial Agent v1;
3. analytics personal_sheet/familiar;
4. ARQ iterative read-only;
5. central read model;
6. dashboard v1/v2;
7. cartões — leitura/agregação/compatibilidade;
8. writers básicos gasto/entrada/cartão;
9. importação de extratos/documentos;
10. metas/dívidas + Projected Plans;
11. scheduler;
12. Open Finance reconciliation read-only;
13. Open Finance reviewed writers;
14. áudio WhatsApp;
15. exclusão/manutenção/exportação/recibos;
16. escopo familiar/OAuth/autorização;
17. telemetria de retirada do legado/tripwire;
18. retirada de legado por consumer.

Para cada grupo o artefato registra consumer, source, fallback, flag/modo, telemetry/heartbeat, rollback, última evidência e estado `VERIFIED|STALE|UNKNOWN|NOT_APPLICABLE`. Consumers mutáveis estão explicitamente incluídos. ARQ, card unified-first, Projected Plans shadow, Open Finance reconciliation, dashboard v1/v2 e legacy telemetry são preservados como capacidades existentes, não reconstruídos.

## 00.3 — Golden Set sintético

O JSON versionado usa apenas valores/nomes/ids sintéticos e todos os casos exigem `expected_side_effects=0` durante ROAD-00. Campos obrigatórios: `domain`, `metric`, `operation`, `timeBasis`, `scope`, `expected_source`, `evidence_state`, `expected_side_effects`.

Casos:

- `GS-CARD-IDENTITY-01`: dois labels, um `card_id`; fatura não pode ser dividida por label.
- `GS-INVOICE-CONFIRMED-01`: statement confirmado vence `closing_day_estimate`.
- `GS-CLOSING-BEFORE-01`: antes do fechamento é apenas estimate se não houver fonte melhor.
- `GS-CLOSING-EXACT-01`: compra no dia do fechamento fica `incomplete` sem evidência forte; não assumir `>`/`>=`.
- `GS-CLOSING-AFTER-01`: depois do fechamento pode projetar próximo ciclo, supersedível por provider/statement.
- `GS-INSTALLMENT-6X-01`: compra 6x separa consumo total no purchase date de schedule futuro.
- `GS-INSTALLMENT-PROJECTION-01`: parcelas futuras são `projected`, não realizadas nem saldo restante de feed inexistente.
- `GS-REFUND-01`: estorno integral ligado ao original zera consumo líquido e não vira renda por padrão.
- `GS-CARD-PAYMENT-01`: pagamento de fatura não adiciona nova despesa.
- `GS-TRANSFER-01`: transferência entre contas próprias é neutra em renda/despesa.
- `GS-RECURRENCE-RULE-01`: regra gera compromisso projetado; ocorrência é evento distinto.
- `GS-RECURRENCE-UNSCOPED-01`: `user_id` ausente falha fechado e não vira zero completo.
- `GS-BALANCE-COMPLETE-01`: saldo `as_of` usa opening + todos os movimentos cobertos.
- `GS-BALANCE-INCOMPLETE-01`: cobertura parcial produz `incomplete`, não saldo atual afirmado.
- `GS-BUDGET-DAY-VS-CYCLE-01`: gasto diário não substitui gasto do ciclo.
- `GS-SOURCE-UNAVAILABLE-01`: source indisponível não é zero.
- `GS-ZERO-CONFIRMED-01`: zero só é válido com fonte disponível/cobertura completa.
- `GS-PERSONAL-SHEET-01`: mantém source e escopo autorizados.
- `GS-FOLLOWUP-01`: follow-up herda período/escopo e só adiciona filtro.
- `GS-AUDIO-MARKER-01`: marker sem dado financeiro percorre áudio -> texto sem writer.
- `GS-AUDIO-FAIL-01`: timeout é `unavailable`, sem falso sucesso nem conteúdo bruto em log.
- `GS-DOUBLE-COUNT-IMPORT-01`: mesmo evento econômico manual+import conta uma vez.

## 00.4 — telemetria Fase 8

Classificação datada do candidato:

- mecanismo estático de legacy telemetry: heartbeat, allowlist, HMAC refs, rotação/backups existem no código;
- heartbeat runtime atual: `UNKNOWN`;
- retenção runtime atual: `UNKNOWN`;
- relatório implantado lendo rotacionados: `UNKNOWN`;
- integridade atual: `UNKNOWN`;
- `legacy_auth_utility`: última evidência 2026-07-30 `STALE` (duas probes sintéticas, zero real observado), estado atual `UNKNOWN`; não candidato a remoção;
- cartões: evidência 2026-07-30 `STALE` com uso legado relevante; atual `UNKNOWN`; não candidato;
- dashboard: evidência Fase 8 `STALE`, checkpoints mais recentes não substituem janela de retirement; atual `UNKNOWN`; não candidato;
- janela acumulada: `UNKNOWN` enquanto heartbeat/retention/rotation atuais não forem saudáveis.

O candidato afirma que classificar `UNKNOWN` fecha 00.4 documentalmente porque o gate pede classificação honesta e proíbe falso zero; nenhuma janela histórica é reutilizada para retirement.

## 00.5 — fixtures de schema

Template versionado atual congelado:

- `Saídas`: 11 colunas, termina `user_id`, `Conta Financeira`;
- `Entradas`: 10 colunas, termina `user_id`, `Conta Financeira`;
- `Transferências`: 9 colunas, termina `user_id`;
- `Cartões`: `card_id, Nome, Banco, Dia de Fechamento, Dia de Vencimento, Ativo, Observações`;
- `Lançamentos Cartão`: `Data, Descrição, Categoria, Valor Parcela, Parcela, Mês de Cobrança, card_id, Cartão, Observações, user_id`;
- `Contas Financeiras`: 9 colunas, com Saldo Inicial, Data de Abertura e `user_id`.

Reader contracts congelados: Saídas `A:K` user index 9/account 10; Entradas `A:J` user 8/account 9; Transferências `A:I` user 8; Cartões `A:G`; Lançamentos `A:J` card_id 6/name 7/user 9; Contas Financeiras `A:I` user 7.

Também registra o adapter `legacy_virtual_card_view_v1` que mapeia um nome legado `Cartão ...` para `Lançamentos Cartão!A:J` e devolve virtualmente apenas Data/Descrição/Categoria/Valor/Parcela/Mês/user_id. Headers reais de planilhas antigas ficam `UNKNOWN_EXTERNAL_REQUIRED`; nenhuma migração é inferida.

## 00.6 — gaps externos

Registrados e roteados sem inferência:

- `EXT-CARD-ATACADAO-01` -> ROAD-04C;
- `EXT-AUDIO-01` -> ROAD-AUDIO-01;
- `EXT-SCHEMA-LIVE-01` -> ROAD-01;
- `EXT-BILLING-PROVENANCE-01` -> ROAD-02;
- `EXT-BALANCE-COVERAGE-01` -> ROAD-03A;
- `EXT-PHASE8-RUNTIME-01`, `EXT-LEGACY-AUTH-01`, `EXT-DASHBOARD-ADOPTION-01`, `EXT-CARD-ROUTES-01` -> ROAD-08/09 por consumer;
- `EXT-WRITERS-OF-01` -> ROAD-07;
- `EXT-RELEASE-FLAGS-01` -> primeiro gate operacional que realmente precisar runtime.

## Candidato de fechamento

Critérios internos do candidato:

- matriz: SATISFIED;
- Golden Set: SATISFIED;
- telemetria classificada: SATISFIED com `UNKNOWN/STALE` quando runtime não consultado;
- schema fixtures: SATISFIED;
- shadows/canários/flags: SATISFIED ou `UNKNOWN` explícito;
- gaps externos: SATISFIED;
- zero alteração funcional: SATISFIED;
- revisão independente: PENDING.

## Instrução ao auditor

Tente refutar o fechamento. Procure consumer/writer omitido, caso obrigatório ausente, semântica errada no Golden Set, uso indevido de `UNKNOWN`, falso zero, confusão template vs schema real, lacuna externa resolvida por suposição, perda de shadow/canary existente ou qualquer razão pela qual ROAD-K0 não deveria abrir depois deste gate. Não implemente nada e não acesse produção/dados privados.
