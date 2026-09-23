# due_bill_ids — revisão independente da aplicação

Data de ratificação: 2026-09-23.
Candidato: `48e1cf68d0174ffa08d77485c54348981775e1e2`.
Pai único: `ea1b616322ee12806d42f9cdc650597fc2180957`.
Fonte: parecer fornecido por Daniel nesta conversa; URL da conversa de auditoria
não fornecida. Referência imutável confirmada pelo parecer e pelo Git local:
https://github.com/Danieu-san/financas-bot/commit/48e1cf68d0174ffa08d77485c54348981775e1e2

## Parecer recebido e alcance

APTO FOCAL para a aplicação due_bill_ids, sem defeitos críticos, altos, médios
ou baixos identificados. Não é GO global N02-G, aceitação de grafo/host ou
autorização de produção.

Fontes declaradas: as seis alterações do candidato (checkpoint,
due-bill-ids-validation.json, prepare-due-bill-ids-validation.cjs, graphs-v2.json,
authoringIndex.cases.js, metricDirectReads.cases.js); runtime metricDirectReads.js;
due-bill-ids-proposal.json; plano due-bill-ids-decision-v1; binding contract;
contratos due_bill_ids/due_bills_total e registry de evaluators.

O auditor examinou graphs-v2.json pelo diff imutável e fragmento M-15#1#1:
o raw integral de aproximadamente 4,96 MB excedeu seu renderizador. Não realizou
checkout, testes, execução de Node/helper ou reconstrução integral independente.
Seu parecer é revisão estática das fontes, não reprodução externa dos testes.

## Fundamentos confrontados

- Delta fechado: uma remoção de bill_rent_b/amount_minor somente em
  M-15#1#1/derivation.required_reads; proof e due_bills_total preservados.
- Runtime retorna selectedIds antes do laço monetário. Autoria fundamentada
  em evaluator ID+versão, role e identidade de snapshot kind/ref_id/version,
  payload.id e fingerprint, sem alias/fact_key/actual/oracle como regra semântica.
- Expected congelado antes dos handles/evaluator; oracle consultado depois
  somente para R. Obrigação monetária histórica e trace sem ID são rejeitadas.
- Modelos sintéticos variam população/aliases/valores/versões e rejeitam
  dispatch incorreto ou identidade ausente/duplicada. Não são grafos admitidos.
- Kernel contrasta IDs invariantes com soma variável em três pares de valores,
  mantendo exclusões por pessoa/status/data; não representa aceitação de grafo.
- Pins históricos compostos explicitamente por restoreReviewedDueBillAmount
  antes de undoReviewedCollectionKind e restaurações anteriores, sem relaxamento.

## Evidência local e ratificação

Git confirma candidato, pai único e seis arquivos; candidato até HEAD
350b7f1c75e15daeba1e486a25ca2ed554ffe2b5 acrescentou somente dois documentos.
prepare-due-bill-ids-validation.cjs --check executado nesta ratificação: PASS.
Confere hashes dos três arquivos causais, reconstrói o corpus inteiro a partir
do pai menos exatamente uma leitura e compara profundamente: 76 grafos,
75 inalterados, demais campos intactos; dez fontes protegidas preservadas.
A continuidade desde a base documental é exigida pelo hash canônico da proposta,
não presumida apenas pela ancestralidade Git.

Registros locais preservados: RED 2 PASS/2 FAIL; GREEN 4 PASS; afetados 215 PASS;
ampla 2.384 PASS/0 FAIL/10 SKIP (2.394 testes). --check valida registros salvos
e estado atual; não reexecuta suítes. Nenhuma suíte foi repetida nesta ratificação.
Limites externos não são convertidos em execução independente nem GO global.

Parecer confrontado e ratificado: correção due_bill_ids encerrada exclusivamente
no recorte focal. Sem mudança causal adicional, não repetir ampla ou auditoria.
Próxima ação: diagnóstico dirigido de owned_cards@1/S-07#1#1, antes de qualquer
proposta normativa/runtime. N02-G permanece sem GO global/grafo/host/produção.
