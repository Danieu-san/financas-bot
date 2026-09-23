# Collection kind — revisão documental independente

Candidato: `524bb9a19f808ec8b183b4a0dd8a9ef32018baa9`.
Pai: `6d85f096f0b88f4ecef77d62c2d9929a17547eb5`.
Parecer recebido em 2026-09-23, uma tentativa em conversa limpa:
https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab3a71d-0c3c-83e9-a80a-ecc5ee9e16f3

## Veredito e fontes

APTO DOCUMENTAL. Nenhum achado crítico, alto, médio ou baixo impeditivo.
Hash, pai único e diff de quatro arquivos documentais (+484/-0) confirmados.
Auditor declarou leitura da proposta, inventário, helper, checkpoint,
metricDirectReads.js, claims, evaluator registry, snapshot schema, material
registry, binding contract, snapshot manifest e dos três evaluator contracts.
Não recuperou graphs-v2.json integral (limite de tamanho da interface).

Fundamento: uma população vazia não distingue domínio; collection_name é
dimensão material exigida pelo schema e consumida por collectionMatches antes
de conferir membros. A mesma guarda permanece causal com população não vazia.
Autoria por evaluator ID + versão, role collection e identidade de snapshot
kind/ref_id/version, sem alias literal, fact_key, actual ou oracle como regra.
O delta documental é exatamente uma required_read por M-15#1#3, M-15#1#4 e
M-16#1#3. Sem promoção da closure de proof.

## Confronto e limites

Codex confirmou HEAD/remoto e executou --check local do inventário: PASS,
11 fontes conferidas contra blobs da base e três adições propostas. O código
local confirma a guarda causal nos três evaluators. Isso é evidência local,
não execução pelo auditor. O auditor não executou helper/evaluator/testes nem
recomputou hashes dos documentos, corpus, grafos ou fingerprints semânticos.
A expressão do parecer sobre os 11 arquivos-fonte não inclui leitura integral
de graphs-v2.json: sua própria exceção explícita prevalece.

Parecer ratificado somente para implementar o desenho revisado. Próxima etapa:
RED, delta fechado, GREEN, afetados, ampla única e auditoria de código por novo
hash. Preservação integral dos 73 outros grafos/todos os demais campos precisa
ser demonstrada localmente na aplicação. Sem GO de código, grafo, host,
N02-G global ou produção.
