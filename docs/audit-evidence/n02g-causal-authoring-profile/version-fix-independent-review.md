# Correção ID + versão — parecer independente ratificado no recorte

2026-09-21. Candidato: `1e83baacfbb494e1f5cb3c1e70372e4acd50f349`.
Pai: `ace83e80a1a2cf12ba2f9a7a8f6ace9ebdc5adbd`.
Conversa única: https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab1ac6c-d8f8-83e9-9207-489715431e66

## Resultado externo

APTO exclusivamente para a correção focal ID + versão no gerador candidato;
nenhum achado alto, médio ou baixo. Hash integral e único pai confirmados pelo
patch/commit e link do pai. Comparação do código candidato e pai identificou
as duas linhas funcionais: preservar version e compará-la antes de contribuir.

O revisor confirmou estaticamente que AUTHOR-GENERATE-010 mantém o instrumento
original ligado ao role, acrescenta outra tupla admitida de mesmo kind/ref_id
e versão diferente, recompõe fingerprint e redireciona a aresta da contribuição.
A asserção negativa de amount_minor é explícita, não cópia da saída original:
esta só localiza um caso elegível, e ausência desse caso também falha.
Identidade/id/aresta do alvo alternativo permanecem observados antes do filtro.
Não encontrou dependência circular actual/expected, nem import do runtime.

Fontes declaradas: commit/patch, version-fix-audit-request, gerador, testes
causalAuthoring, README/perfis, implementation-independent-review,
version-fix-validation, prepare-version-fix-evidence, metricSelection e
versões do pai do gerador/testes/README/perfis. Os dois perfis foram comparados
textualmente com o pai, sem alegar igualdade criptográfica de blobs.

Limites: somente leitura estática; não executou testes, Node, gerador, helper,
integração ou ampla. RED e contagens são evidência local publicada, não execução
externa. Não conferiu integralmente graphs/claims/candidate-report/source-extract
nem a igualdade dos seis relatórios. Não aprova o delta normativo, runtime,
host, N02-G, deploy ou produção.

## Confronto local e alcance

Ratificado somente o conserto do gerador candidato. O RED foi observado antes
da correção; 26 focais, uma integração hermética e ampla 2.360 PASS / 0 FAIL /
10 SKIP esperados passaram depois. Três hashes causais antes/depois e blobs
staged coincidiram; seis relatórios e 76 grafos/claims permaneceram iguais ao
pai, verificação local reproduzível no novo helper. Nenhuma evidência contradiz
o parecer focal. Não repetir essa ampla sem nova mudança causal.

Próxima fatia: reconciliação de consumption_by_instrument e statement_total
contra candidatos congelados antes da execução, com RED observacional, sem
reescrever os 76 grafos. Demonstrar cobertura e preservar seleção/R antes de
submeter a composição reconciliada e eventual proposta normativa à auditoria.
`graph_accepted=false` e `releaseEligible=false` permanecem obrigatórios.
