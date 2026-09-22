# Aplicação normativa dos seis perfis — revisão independente focal

2026-09-21 (UTC 2026-09-22).
Candidato: `50ad614c0289eefa0557b725f63b8b9e157258c6`.
Pai: `6f66556a256577c1bcdbc9678090b91dc43536ec`.
Conversa única: https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab1e5dc-dc20-83e9-94f8-89d032349ed0

## Parecer

APTO FOCAL para aplicação dos cinco campos derivacionais nos seis grafos
autorizados. Nenhum achado crítico, alto, médio ou baixo. Confirmados hash,
pai único e oito arquivos alterados (581 adições/15 remoções). Não amplia
o APTO documental anterior nem concede GO ao N02-G.

O revisor examinou a lógica que parte de originais congelados e substitui
somente required_nodes, required_reads, required_claim_reads, required_edges
e required_structural. AUTHOR-NORMATIVE-001 fixa igualdade de cada grafo e
reconstrói o digest do corpus inteiro ao repor os seis originais. O helper
confronta diretamente o corpus corrente com a base Git mais o delta fechado.
Isso protege os outros 70 e todos os campos restantes, não só uma contagem.

AUTHOR-RECONCILE-001 consulta normativa e compara com autoria independente
antes de executar; preserva seleção/R, flags falsas e controle de trace
adulterado. A independência já existia no candidato anterior: esta mudança
passa a consultar a normativa aplicada, não corrige expected baseado em actual.
TRACE-COMPAT-001 recompõe a base congelada e explica 166 casos: 148 arestas
deixam de ser obrigatórias e 18 retidas passam a ter cobertura. Exige igualdade
dos demais diagnósticos e mantém o controle traversal distinto de leitura.

## Fontes e limitações

Examinados página/patch do commit, decisão instrumental, recibo documental,
helper de evidência e blocos pertinentes do registro de validação; no teste,
AUTHOR-NORMATIVE-001, AUTHOR-RECONCILE-001, TRACE-COMPAT-001 e adjacências.
No relatório congelado, cabeçalho/manifests/totais, seis registros e trechos
das obrigações; no extrato, cabeçalho e os seis registros/claims pertinentes.
Verificou que relatório/extrato e perfis JSON não mudaram neste commit.

O auditor NÃO abriu integralmente graphs-v2.json: limite de tamanho/formato
do frontend e linhas grandes do diff. Não fez comparação própria byte a byte,
recomposição SHA256, execução do helper ou das suítes. Seu APTO combina revisão
estática independente dos controles e fontes publicadas com evidência local
relatada; não é verificação independente integral do blob ou da execução.

## Confronto local e alcance ratificado

O confronto local integral foi executado, não inferido do parecer:
prepare-instrument-normative-evidence.cjs --write-new e --check PASS antes do
commit; --check PASS após publicação. Base Git, extrato e candidatos congelados
fixam exatamente seis deltas de cinco campos, 70 grafos intactos e preservação
das demais partes. Blobs do índice conferem com hashes LF testados; HEAD remoto
confirmado. Nenhum arquivo causal mudou depois da ampla.

Evidência instrument-normative-validation.json preserva RED inicial de autoria,
bateria inicial 148 PASS/1 FAIL, final 149 PASS/0 FAIL/0 SKIP e ampla
2.366 PASS/0 FAIL/10 SKIP esperados, valid=true/exit=0/candidate_unchanged=true.
As execuções são locais; não atribuí-las ao Chat. Ampla não deve ser repetida
sem mudança causal posterior.

APTO focal ratificado somente para a aplicação normativa publicada. Não é
aceitação dos seis/76 grafos, proof, host, medições confiadas, três derivados,
N02-G global, release, deploy ou produção. graph_accepted/releaseEligible
permanecem falsos. Próxima ação: diagnóstico atualizado da cobertura restante
e delimitação de uma próxima regra causal, sem preencher expected pelo actual.
