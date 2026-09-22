# evidence_state — proposta de 34 adições NÃO APTA

2026-09-22. Candidato `0cbc80d65ae0761a99e8980d070068f13f28c244`, pai
`69a385832876329afb4da73ffb5cc79d1ef94254`.
Conversa única: https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab265e9-aed8-83e9-b46f-25647cf88a69

## Veredito e achados

NÃO APTO DOCUMENTAL para as 28 claim reads como classe fechada e para as seis
budget reads. Nenhuma adição aplicada. Hash, pai único e cinco arquivos
documentais/evidenciais confirmados; runtime/testes/grafos não mudaram.

- ALTO: os sete contratos dos outros 26 claims exigem eventos confirmed, mas
  não estabelecem propagação obrigatória para claim.evidence_state=confirmed.
  Corpus e guarda atual não suprem fundamento causal independente. Schema de
  claim admite confirmed/projected/estimated, portanto a guarda discrimina.
- ALTO: budget.evidence_state é singleton confirmed no schema e registry;
  payload é validado antes do evaluator. Não há pré-condição funcional publicada
  exigindo reobservação desse campo para consumir limit_minor. Adicionar seis
  reads legitimaria a revalidação redundante sem fundamento.
- MÉDIO (limite de verificação): graphs-v2 não pôde ser lido integralmente.
  O auditor não executou helper nem recompôs hashes/igualdade do inventário.

O revisor distinguiu positivamente os dois safe_daily_pace: contrato funcional,
semântica de autoria e decisão temporal fixam claim estimated e inputs confirmed.
Isso fundamenta essas duas leituras, mas o parecer NÃO autoriza aplicar a
proposta rejeitada nem constitui GO de implementação/grafos/N02-G.

## Fontes e confronto local

Examinados proposta, helper, binding, authoring contract, semântica de autoria,
decisão temporal, schemas de claim/snapshot, material registry, oito contratos,
metricSelection e trecho pertinente de metricDirectReads, commit/pai. Inventário,
metric registry e claims foram lidos parcialmente no recorte; grafos não foram
lidos diretamente. Hashes foram tratados como declarados, não recalculados.

Confronto local confirma as lacunas: o texto dos sete contratos fala das
entradas, não impõe estado de saída confirmado; budget schema só admite
confirmed; os predicados de proof existentes não obrigam leitura redundante
na derivation. A proposta não deve converter mera ocorrência de get em norma.
Igualdade do inventário com fontes foi verificada localmente pelo helper,
sem atribuí-la ao auditor nem usá-la para afastar os achados semânticos.

Próxima ação: proposta revisada que considere retirar as duas classes de
guardas não fundamentadas do runtime, sem apagar a validação de admissão/proof,
e incluir somente as duas claim reads de safe_daily_pace. Guardas instrumentais
já ratificadas ficam fora dessa revisão. Submeter novo hash com decisão exata
antes de aplicar normativa; não reenviar o candidato rejeitado.
