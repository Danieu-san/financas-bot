# FIN-NEXT02-N02F-AUDIT-A-20260911 — Parecer independente

## Identidade

Auditoria independente, adversarial e focal do FinançasBot NEXT-02 / N02-F, **SUBLOTE A — estado e seleção**. Objeto de produto imutável: candidate `a09482485ef5d51f2391d4d773d4738f74246f71`, parent único `ef04368c95af33a12c0e8b5b286c0e0b01ae27f8`. Pacote de evidência separado: `9b0808bb11f00dda973eab845081a5f0ffc74194`, parent `a09482485ef5d51f2391d4d773d4738f74246f71`, em `docs/audit-evidence/n02f-a094/`.

Antes da publicação, a branch `chat/chat-codex-orchestration-20260824` foi reconfirmada em `db781ac255daa972fe451e9a4eec1343b143eabc`; o state havia sido lido em `CHAT_WORKING` com SHA-256 `9fc6f5dab6f8addf301be1dfcb4839d88acd6f61760955abe001254a0e77234b`.

Escopo excluído: relações temporais, operadores civis e LOTE B.

## Integridade e cobertura

Li integralmente `evidence-manifest.json`, `selection-audit-verifier.cjs`, `selection-audit-report.json`, `selection-samples-parent.json` e `selection-samples-head.json`. Os quatro SHA-256 registrados no manifesto foram conferidos como âncoras do pacote imutável: verifier `157bc45151013907b01af9b713146074483927908046a1cee672742f7ca8eaf8`; report `0720e0e2b8b7fa1dc15bc680a07b191d12a45c7d80b2c2ace90084f61b6e8501`; parent samples `ff53ddd544264d4019086e0cf3f801bc41926e757e13e28e44d96b4c85c08287`; head samples `cb92a04293cfc32ba5ccfd446f8be1401bdeb6f7961925796d1f021b63ebc6e8`. A identidade dos quatro arquivos também foi confrontada com seus Git blob SHAs no commit de evidência; o `valid=true` não foi usado como prova autossuficiente.

O algoritmo percorre exatamente 76 grafos e 152 fases. Para cada seleção, verifica partição exata `selected + excluded = candidates`, sem sobreposição; deriva `selectedUnion` dos `selected_set` e exige `selected_nodes` igual a essa união em derivation e proof; exige `required_selections` em igualdade estrutural exata; e, em proof, exige cada candidato tanto em `required_nodes` quanto em ao menos um `required_read`. A comparação parent→candidate preserva por igualdade profunda `claim_id`, `nodes`, `sets`, `edges` e, nas duas fases, `required_nodes`.

Nos dois `safe_daily_pace` (`M-13#1#3`, `M-13#1#6`), os seis guards de estado observados (três por grafo) são `not_eq ... confirmed`, `input_evidence_state` é `confirmed`, enquanto o claim de saída permanece `estimated`. Em `S-12#1#1`, a prova contém 40 `required_nodes`, 16 candidatos examinados e zero selecionados. Nos três derivados (`M-01#1#3`, `M-01#1#4`, `M-14#1#3`), não há seleção; os pais aparecem como `validated_parent`, são exigidos em `required_nodes` e têm leituras de `fact_key`, `evaluator_version`, `result_hash` e `result`.

Revisei as seis mutações negativas: nó selecionado extra; seleção obrigatória removida; guard alterado para `estimated`; falso selecionado em S-12; candidato sem required read; alteração não revisada em `nodes`. Todas são rejeitadas pelo caminho de análise real. Fiz spot-check integral dos seis registros parent/head acima; os fatos observados confirmam as invariantes relevantes do SUBLOTE A.

## Findings

**CRITICAL:** nenhum.

**HIGH:** nenhum.

**MEDIUM:** nenhum.

**LOW-01 — unicidade global de `fact_key` não é afirmada antes dos `Map`.** O helper conta 76 grafos/claims, mas não rejeita explicitamente chaves duplicadas antes de indexá-las. Não há duplicata observada no relatório/amostras; é lacuna de endurecimento do verificador, não defeito demonstrado do candidato.

**LOW-02 — presença de `input_evidence_state` é validada condicionalmente.** O helper exige `confirmed` somente quando o campo existe; uma mutação que o removesse não é um dos seis self-tests. Nos dois registros imutáveis do candidate o campo existe e vale `confirmed`, e os seis guards exigidos também estão corretos. Novamente, é lacuna de robustez do helper, sem divergência observada no produto auditado.

## Veredito — somente SUBLOTE A

**APROVÁVEL.** A evidência observada sustenta estado/seleção do candidate para este sublote, sem finding CRITICAL/HIGH/MEDIUM. Os LOWs recomendam endurecer futuras evidências, mas não alteram a conclusão sobre o candidato imutável aqui examinado.

Este parecer **não autoriza** implementação, compiler/evaluator, NEXT-03, deploy, produção nem qualquer atividade fora do SUBLOTE A.
