# Consolidação multirrevisor — arquitetura conversacional financeira

Data: 2026-08-22

## Pacote examinado

- base técnica: `efc762deaa031dab691e9328b7cbf0d2b88caaf8`;
- candidato documental imutável:
  `18f1bd9585b1fba9cfe74fbf26d3e50696655b78`;
- diagnóstico e proposta locais: documento 293;
- benchmark sanitizado de 11 casos: evidência 293;
- ChatGPT: parecer integral e independente por GitHub, documento 295;
- Claude Opus 5: parecer independente parcial por pacote autocontido, documento
  294.

Nenhuma mudança de runtime, dados, flags ou produção foi feita neste
workstream.

## Convergência

As três revisões convergem nos pontos que determinam a decisão:

1. o caminho atual possui múltiplas autoridades semânticas concorrentes;
2. o contexto conversacional é comprimido cedo demais e reconstruído por
   heurísticas;
3. o LangGraph atual é um pipeline linear, não um ciclo agentic;
4. trocar Gemini por outro modelo sob o mesmo plano rígido não resolve a causa;
5. a IA deve ganhar autonomia somente para investigar em leitura;
6. identidade, família, escopo, fontes, matemática e escrita permanecem sob
   autoridade determinística;
7. o novo caminho precisa ser medido por resultado e evidência, não por
   igualdade integral de uma única decomposição interna;
8. a migração deve ser por shadow e domínio, com rollback imediato.

## Correções incorporadas

O dossiê passa a ser lido com estas erratas:

- 15 domínios, 16 operações e sete bases temporais;
- 265 perguntas na bateria de aceitação;
- o `resultVerifier` atual já protege muitos fatos e formatos; a lacuna
  principal é adequação e suficiência da evidência para a pergunta;
- coexistência de fontes não é defeito por si; o defeito é roteamento distribuído
  ou fallback silencioso que altera a semântica;
- determinismo não deve ser removido do kernel financeiro, apenas da linguagem
  espalhada como autoridade concorrente.

## Achados adicionais que entram no novo desenho

- o checkpoint pode persistir a classificação legada em vez da trajetória
  efetivamente executada pelo agente;
- a preservação de base temporal é ramo a ramo, não uma invariante central;
- usuários com planilha pessoal podem sair da rota agentic antes da consulta;
- `purchase_date` aparece em casos da bateria sem existir no contrato atual;
- testes locais documentam precedência entre autoridades e podem ficar verdes
  sem provar a trajetória conversacional real.

## Decisão recomendada

Adotar um **agente iterativo, limitado e somente leitura**, preservando o
LangGraph como infraestrutura e o kernel financeiro atual como autoridade.

Fluxo-alvo:

`mensagem + trajetória sanitizada -> contexto confiável -> gate de política ->
reasoner -> semantic read tool -> envelope de evidência -> reasoner -> responder,
refinar ou esclarecer -> verificador de evidência -> resposta`

Regras:

- máximo de duas ou três tools por turno;
- tools de alto nível por capacidade financeira, sem expor topologia física;
- cada tool injeta server-side usuário, família, escopo, fonte e limites;
- o modelo não calcula dinheiro, não escolhe IDs, não amplia escopo, não usa SQL
  livre e não escreve;
- `FinancialQueryPlan` pode continuar como IR interna, compilada pelas tools;
- toda escrita continua no fluxo tipado de preview, confirmação e commit
  idempotente.

## Caminhos descartados

### Continuar adicionando regras ao plano atual

Mantém a superfície conhecida, mas perpetua a autoridade distribuída e o ciclo
de regressão por frase. Serve apenas como fallback temporário.

### Substituir apenas o modelo

O benchmark mostrou 33/33 estruturas válidas e apenas 18/33 acertos. O problema
não é sintaxe do modelo, mas exigir uma decomposição interna exata antes de
observar evidência.

### Entregar cálculo ou escrita à IA

Rejeitado por ampliar risco sem atacar a causa. As máquinas determinísticas de
escopo, cálculo, confirmação e idempotência são ativos do produto.

## Migração finita proposta

### ARQ-01 — contrato de trajetória e baseline

- registrar sanitizadamente pergunta, contexto, decisão, fonte, tool,
  cobertura, fallback, evidência e resposta;
- corrigir o checkpoint para representar a trajetória efetivamente executada;
- definir métricas e casos críticos antes de mudar roteamento.

### ARQ-02 — fachada de ferramentas semânticas

- encapsular consultas existentes sem criar cálculo ou fonte novos;
- centralizar roteamento de fonte e provenance;
- retornar envelope de evidência padronizado.

### ARQ-03 — grafo iterativo em shadow

- permitir no máximo três consultas de leitura;
- executar sem responder ao usuário e sem tocar a escrita;
- comparar resultado/evidência com pipeline vigente.

### ARQ-04 — verificador de adequação

- preservar verificações numéricas atuais;
- acrescentar cobertura de pessoa, período, base temporal, dimensão, fonte e
  ausência de dados;
- distinguir fonte indisponível de resultado zero.

### ARQ-05 — canário read-only por domínio

- incluir read-model central e planilhas pessoais;
- validar follow-ups, fonte, família e regressões 3F1H/4A/4D/5B;
- promover um domínio por vez.

### ARQ-06 — cutover e retirada do legado

- manter flag de rollback por domínio;
- contabilizar todo fallback;
- retirar o caminho anterior somente após fallback zero na janela definida.

## Critérios de parada

- zero violação de autorização, família ou escrita;
- 100% dos casos adversariais e de follow-up sem vazamento;
- 100% dos 15 casos críticos do corpus;
- pelo menos 95% de roteamento não adversarial;
- zero falso `0` ou `não encontrei` quando a fonte está indisponível;
- reprodução ponta a ponta das classes 3F1H, 4A, 4D e 5B;
- cobertura real de fonte central e pessoal;
- nenhuma regressão material contra o baseline;
- fallback legado zero por janela previamente definida; para cartões, preservar
  a disciplina de dois fechamentos ou pelo menos 60 dias;
- rollback testado antes de cada promoção.

## Rollback

Cada domínio mantém flag independente para retornar ao pipeline anterior. O
novo agente começa read-only e não altera o writer, logo não existe estado
financeiro a desfazer. Qualquer violação de escopo, fonte ou evidência interrompe
o canário e restaura o domínio ao caminho vigente.

## Estado autorizado

`DECISÃO ARQUITETURAL RECOMENDADA — IMPLEMENTAÇÃO NÃO INICIADA.`

O próximo passo seguro é abrir ARQ-01 em worktree própria. A implementação só
deve começar após decisão explícita de Daniel sobre este caminho.
