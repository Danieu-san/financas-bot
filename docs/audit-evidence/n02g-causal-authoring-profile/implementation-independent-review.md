# Revisão focal da implementação candidata — confronto local

2026-09-21. Candidato externo: `ace83e80a1a2cf12ba2f9a7a8f6ace9ebdc5adbd`;
pai: `8b9c4fca93186c9f747ba1a868bf1616ba15d92a`.
Conversa única: https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab118e7-fdac-83e9-9b79-2236a5934c05

## Parecer recebido

APTO estritamente para orientar a reconciliação de consumption_by_instrument
e statement_total. Nenhum bloqueador alto/médio identificado pelo revisor.
As sete condições anteriores foram consideradas atendidas estaticamente:
projeção fechada; não interferência do expected antigo; pinagem; vínculo
evaluator/versão/contrato; política explícita de alvos estrangeiros; exclusão
de proof/seleção da saída; nenhuma aplicação automática.

O revisor justificou as classes de delta: presença opcional antes do filtro,
identidade dos alvos estrangeiros, dispensa de person_id/owner_id e da ref ao
outro instrumento em métricas escopadas pelo instrumento, calendário civil
sem conversão timezone e fechamento `(previous_close,current_close]`.

Fontes declaradas como examinadas: audit-request, parecer anterior, gerador,
relatório, README/perfis, causalAuthoring.cases e AUTHOR-INTEGRATION-001,
candidate-report, source-extract, local-validation, prepare-evidence, binding
§4 e cláusulas correlatas, os dois contratos, entradas do metric registry,
schemas de claim/snapshot, material registry, snapshot manifest/fontes,
evaluation-policy-v1 e claims-v2 integral.

Limites explícitos: revisão estática, sem executar testes/gerador/verificador,
evaluator ou recorder. Graphs-v2 integral não abriu (>4 MiB); não confirmou
independentemente igualdade do extrato nem preservação do blob integral.
Contagens locais foram tratadas como relato, não execução do Chat. Nenhum GO
de runtime, demais incrementos, N02-G, deploy ou produção; sem aplicação do
delta autorizada pelo parecer.

## Confronto local: APTO não ratificado sem correção

Enquanto o parecer era preparado, a inspeção local identificou que identity()
validava o formato de version, mas devolvia apenas alias/kind/id. O filtro de
contribuição comparava somente target.id com instrument.id, embora a admissão
permita tuplas distintas (kind, ref_id, version). O runtime existente compara
também version. Não se deve confundir digest bem formado com mesma identidade.

AUTHOR-GENERATE-010 foi escrito antes da correção e executado com Node 22.17.0.
RED observado: `M-02#1#1: version participates in scope`, esperado false,
recebido true para a obrigação de amount_minor. A fixture mantém os dados
financeiros, acrescenta outra versão admitida do mesmo instrumento e religa
uma contribuição à nova tupla; fingerprints e hashes de transporte coerentes.
É fixture sintética autoadmitida, não alegação de autenticidade das fontes.

Essa contraevidência bloqueia ratificação do código publicado, ainda que não
altere os seis deltas do corpus original. Correção delimitada: preservar version
na identidade retornada e comparar ID + version antes da contribuição; manter
as obrigações de identidade/traversal do alvo excluído. Teste percorre ambos
os contratos e seus seis claims, sem exceção por fact_key no gerador.

Após correção: testes focais/causais, única ampla final com novo manifesto,
novo hash e nova revisão. Não reutilizar o resultado amplo anterior como prova
do código corrigido. Os 76 grafos e o delta normativo continuam intocados.

Validação posterior local: 26 focais PASS; AUTHOR-INTEGRATION-001 hermético
PASS; igualdade integral dos seis candidate-reports com os publicados em
ace83e8 confirmada. Syntax, diff --check e agent-workflow OK. Nova ampla
iniciada em 2026-09-21T21:46:18.282Z, concluída em 21:56:52.348Z: 2.360 PASS,
zero FAIL, dez SKIP esperados, candidato inalterado. Evidência da correção em
version-fix-validation.json, separada da histórica. Auditoria focal do novo
hash ainda pendente; nenhuma ratificação automática decorrente da suíte.
