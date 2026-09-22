# evidence_state revisado — APTO DOCUMENTAL focal

2026-09-22. Candidato `6889d2941736a2ee0b88c94873a2055795b16d97`, pai
`0cbc80d65ae0761a99e8980d070068f13f28c244`.
Conversa única: https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab268bd-640c-83e9-b49d-378f4ddb33c7

## Decisão e condições vinculantes

APTO DOCUMENTAL exclusivamente para retirar as guardas não fundamentadas e
adicionar duas claim reads de safe_daily_pace. Hash, pai único e quatro arquivos
documentais (+194/-3) confirmados. Nenhum achado bloqueante.

1. Retirar claim.evidence_state=confirmed dos modos total/category/spent/income/
   budget_class/budget_remaining; contagem herda via selectConsumption.
2. Retirar budget.get(evidence_state) de budget_remaining/safe_pace, mantendo
   schema singleton, registry, validação de snapshot, identidade, período,
   escopo/referências, proof e demais precondições.
3. Preservar as guardas instrument/statement já ratificadas e safe_pace estimated.
4. Adicionar somente claim/evidence_state às duas derivações safe_daily_pace,
   identificadas por evaluator/version/role; demais campos e 74 grafos intactos.

O revisor confirmou que eventos confirmed não implicam claim confirmed nos
sete contratos. Retirar a guarda não aceita o claim alternativo: sua proof
permanece independente. Budget inválido deve ser recusado antes do handle;
não inventar witness projected admitido. safe_daily_pace tem distinção explícita
entre estado estimated do claim e confirmed de entrada nas fontes normativas.

Precisão textual não bloqueante: compileSnapshotAccess chama diretamente o
pipeline compartilhado compileAuthoring, que valida snapshots antes de criar
handles. Não depende de execução anterior de compileAuthoringIR. Confronto local
confirmou esse fluxo; packageContract sozinho admite somente bytes.

## Fontes e limites

Confrontados commit/pai/diff, proposta revisada/recibo anterior, binding,
semântica de autoria, decisão temporal, schemas, registries, oito contratos,
claims pertinentes, inventário histórico dos dois grafos, metricSelection,
contagem em metricDirectReads, packageContract e pipeline de graphCompiler.

Não leu integralmente graphs-v2 (limite de recuperação de arquivo >4 MiB),
não calculou hashes nem executou helper/testes. Inventário histórico não foi
tratado como autorização. Igualdade integral pós-aplicação, REDs, testes e
nova auditoria são obrigações futuras locais e independentes desse parecer.

Confronto local ratifica somente o desenho e suas condições. A proposta anterior
de 34 adições permanece rejeitada. Nenhuma aprovação de implementação futura,
grafo, proof, host, medições, derivados, N02-G global, deploy/produção ou flags.
