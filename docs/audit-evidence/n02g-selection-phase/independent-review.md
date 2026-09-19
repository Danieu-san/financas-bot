# N02G-SB-001 — GO focal ratificado

Data: 2026-09-19.
Candidato auditado: `8b66d1e6eac869cf7363beee3b2c1445840fb66e`.
Pai único: `be520f4f0cf64812c80f0f4b9b8eefb2a5445189`.
Estado: GO focal da correção e do suporte de validação; sem GO global N02-G.

## Origem e natureza do parecer

Daniel trouxe nesta conversa o parecer do Chat por anexo textual. SHA-256 do
anexo recebido: `a25b994a326ec100900aa7dcaf103be3b7a6fb1ad1cd2f13ae7e09d9984b9ab3`.
Este recibo sintetiza o parecer e o confronto local; não afirma que o Codex
observou a navegação do auditor. O auditor declarou confirmação do SHA/pai e
leitura das fontes essenciais diretamente ou pela representação imutável no
commit, inclusive os caminhos dirigidos em `audit-request.md`, consumidores do
inventário e testes temporais. Revisão independente estática, somente leitura.

Nenhum achado CRÍTICO, ALTO ou MÉDIO; nenhum defeito funcional focal BAIXO.
O auditor respondeu SIM às cinco perguntas e recomendou ratificar somente
N02G-SB-001. Não foi solicitada alteração de código.

## Conclusões confrontadas

1. Seleção por fase: `graphStructure.js` classifica a partir dos bindings
   declarados; node_set candidato único exige derivation, nodes prebound
   permitem seleção apenas em proof, ambiguidade/ausência falham fechado.
   Reads/nodes prebound e observação de candidatos permanecem obrigatórios.
2. Preservação: a lógica do verificador e o delta imutável sustentam a mudança
   exclusiva dos dois campos derivacionais dos seis grafos autorizados,
   preservando os demais 70 grafos e todas as 76 provas.
3. Harness: wrappers capturam as opções protegidas antes de remover somente
   a representação canônica de NODE_OPTIONS; overrides extras ficam visíveis
   para a recusa do runtime. Produto/timezone não foram relaxados.
4. Inventário: `inspectDevelopmentSources` mantém `releaseEligible=false`,
   15 fontes historicamente pinadas e 29 pendentes. Imports da fatia revisada
   para pendentes continuam recusados; `validateFinancasBotNext02.mjs` ainda
   usa `inspectSources`, a API estrita.
5. Relógios: quatro usos de `t.mock.timers.enable` em três arquivos de testes;
   sem mudança de retenção no produto e com o controle de expiração mantido.

O Codex confirmou HEAD, pai, remoto, regras de seleção, captura/remoção das
opções, chamada estrita do gate e quatro relógios nas fontes locais. Também
recalculou, dos bytes imutáveis do Git, os valores citados pelo auditor para
`graphs-v2.json`, com correspondência exata:

- SHA-256: `62419d3292e37156eb6e970daddb544a688bf527df1c1d0cfe0577944fea7970`;
- blob Git: `85e57c5916a17ebd88a0327e4cdcd59c33f0c213`.

## Limitações preservadas

INFO-01: o Chat não executou suítes, testes temporais/inventário ou subprocessos.
Os 2.265 testes, 2.255 PASS, zero FAIL e dez SKIP esperados são execução local
registrada em `local-validation.json`, e não reexecução independente.

INFO-02: o Chat não materializou integralmente `graphs-v2.json`, não calculou
seu SHA-256 e não executou o deepEqual do verificador. Leu os seis registros,
a lógica do verificador, o manifesto e o diff Git. Isso atende ao formato
compacto previamente definido para esta auditoria; a execução de preservação
76/6/70/76 continua evidência local, já verificada no SHA candidato.

A ratificação combina revisão externa estática, teste local anterior e
confronto com fontes/hashes. Não converte declaração de leitura em execução.
Nenhuma suíte verde foi repetida, pois não houve mudança causal posterior.
O manifesto e os artefatos do candidato permanecem congelados no SHA auditado;
este recibo é documentação posterior e não modifica seu conteúdo histórico.

## Alcance e próxima ação

Fechada somente a correção N02G-SB-001 e seu suporte de validação. Mantidos:
`releaseEligible=false`, 29 módulos pendentes, ausência de GO global N02-G,
release/NEXT-03/deploy/produção/integrações reais não autorizados por este GO.

Próxima ação única: retomar o charter N02-G e confrontar o estado implementado
com a aceitação integral/DAG e recibos de parents da mesma execução, indicando
o primeiro incremento faltante antes de implementar ou admitir novos módulos.

Codex → Astra → Alto → delimitar a próxima lacuna de aceitação integral do N02-G.
