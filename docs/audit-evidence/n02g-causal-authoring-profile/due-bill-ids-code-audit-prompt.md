# Auditoria focal pendente — due_bill_ids

Chat → Sol → Alto → revisar candidato imutável.
Codex → Astra → Alto → confrontar o parecer recebido.

Em 2026-09-23, página do projeto exibiu somente Tentar novamente, persistindo
após uma tentativa de recuperação. Não houve envio de prompt nem parecer
para este hash. Não é bloqueio de segurança observado, nem reprovação.
Usar o prompt abaixo em uma única conversa limpa quando o Chat estiver acessível.

---

Faça uma revisão independente focal, somente leitura, de consistência, testes
e rastreabilidade da aplicação due_bill_ids do FinançasBot.
Candidato 48e1cf68d0174ffa08d77485c54348981775e1e2;
pai ea1b616322ee12806d42f9cdc650597fc2180957.
https://github.com/Danieu-san/financas-bot/commit/48e1cf68d0174ffa08d77485c54348981775e1e2

Leia os seis arquivos alterados nesse hash, especialmente:
- docs/audit-evidence/n02g-causal-authoring-profile/due-bill-ids-validation.json
- docs/audit-evidence/n02g-causal-authoring-profile/prepare-due-bill-ids-validation.cjs
- tests/next/provenance/authoringIndex.cases.js
- tests/next/provenance/metricDirectReads.cases.js
- docs/contracts/next/provenance-v2/graphs-v2.json

Confronte com src/next/provenance/metricDirectReads.js, a proposta
docs/audit-evidence/n02g-causal-authoring-profile/due-bill-ids-proposal.json,
seu plano docs/plans/workstreams/financasbot-next-02-n02g-due-bill-ids-decision-v1.md
e os contratos referenciados, sempre no mesmo hash.

Recorte: retirar somente bill_rent_b/amount_minor de derivation.required_reads
em M-15#1#1/due_bill_ids@1. Proof, due_bills_total e demais 75 grafos preservados;
runtime intacto. Verifique autoria por ID+versão e role/identidade sem
alias/fact_key/actual/oracle como regra; expected congelado antes do evaluator;
controle da obrigação monetária antiga e trace sem ID; kernel com IDs
invariantes e total variando por valor; composição explícita dos pins históricos.
Relato local: RED 2 FAIL/2 PASS, GREEN 4 PASS, afetados 215 PASS,
ampla 2384 PASS/0 FAIL/10 SKIP, hashes testados inalterados. --check verifica
registros salvos e arquivos, não reexecuta testes. Kernel/modelos sintéticos
não são grafos mutantes admitidos.

Responda com hash/pai e fontes efetivamente lidas, achados por severidade,
APTO FOCAL ou NÃO APTO e limites explícitos de acesso/execução. Não trate
relato local como execução independente. Não solicita GO global N02-G,
aceitação de grafo/host ou produção.
