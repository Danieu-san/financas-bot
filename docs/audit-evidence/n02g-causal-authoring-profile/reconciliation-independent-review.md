# Reconciliação instrument/statement — APTO focal ratificado

2026-09-21. Candidato: `3fc0f3d83ac5e418a802ca93f097b0c7459fface`.
Pai: `ad43ba41f0558e9329b8e494c824672d21de4b5d`.
Conversa única: https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab1c508-93e4-83e9-94bb-e30c96f10150

## Parecer e fontes

APTO apenas para a correspondência causal entre runtime instrument/statement,
perfis candidatos congelados e mecanismo de comparação. Nenhum achado
crítico, alto, médio ou baixo. Candidato e único pai confirmados no GitHub;
o revisor confrontou o diff dos oito arquivos com o escopo declarado.

Fontes declaradas: pedido focal, metricSelection, metricReferences, trechos
focais/controles relacionados de metricSelection.cases e authoringIndex.cases,
nextCausalAuthoring, reportNextCausalAuthoring, README e dois perfis JSON,
dois contratos de evaluator e proofAcceptance. Evidência/relatório consultados
documentalmente, não executados nem verificados por hashing pelo Chat.

As quatro respostas confirmam: ausência de expected/oracle/perfil/fact_key
como input do runtime; remoção de owner limitada aos modos por instrumento;
identidade ID + versão dos alvos; guardas de compensação anteriores ao filtro;
cinco dimensões esperadas congeladas antes da execução, com seleção antiga
separada; oracle apenas como asserção posterior de R; rejeição da ausência de
has(compensates) com sequência renumerada válida; demais modos, janela e soma
preservados no delta focal. Comparação missing/extra por dimensão não permite
compensar uma dependência faltante com observações excedentes.

## Confronto e limite

Ratificado no recorte do candidato, não do motor completo. Inspeção local
conferiu selectionInput (somente seleções/selected_nodes), ordem de freeze
antes do evaluator, ramos instrumentMode e primitivas ID/versão. RED dos seis
perfis seguido de 33 focais, 135 afetados e ampla 2.363 PASS/0 FAIL/10 SKIP
esperados; três hashes causais iguais antes/depois e nos blobs publicados.
Checker próprio PASS, seis relatórios e corpus/perfis/gerador intactos no pai.
Nenhuma contraevidência local ao parecer focal foi identificada.

O Chat fez revisão estática, não executou testes, helper, hashing, evaluator
ou recorder. A igualdade dos blobs protegidos e os resultados são evidências
locais, não execução independente externa. Não há GO para demais incrementos,
76 grafos, host/TCB, medições, derivados, N02-G global, deploy ou produção.

O parecer explicitamente NÃO aprova/aplica o delta normativo. Próxima ação:
revisar documentalmente a regra de autoria e a aplicação fechada dos cinco
campos derivacionais aos seis grafos; não inferir autorização deste APTO.
`graph_accepted=false` e `releaseEligible=false` permanecem obrigatórios.
