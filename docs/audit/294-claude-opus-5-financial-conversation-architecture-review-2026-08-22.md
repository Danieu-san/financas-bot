# Parecer Claude Opus 5 — arquitetura conversacional financeira

Data: 2026-08-22

## Proveniência e alcance

- modelo: `anthropic/claude-opus-5` via OpenRouter API;
- commit informado: `18f1bd9585b1fba9cfe74fbf26d3e50696655b78`;
- primeira chamada: 55.600 tokens de entrada, 8.000 de saída usados apenas em
  raciocínio interno, resposta visível vazia, custo relatado US$ 0,478;
- recuperação única: 51.325 tokens de entrada, 11.000 de saída, custo relatado
  US$ 0,531625;
- a recuperação terminou por limite de comprimento depois de 7.476 tokens de
  raciocínio e entregou parecer visível parcial;
- o pacote foi autocontido: dossiê, benchmark e trechos das principais
  fronteiras; o revisor não confirmou os hashes no GitHub nem executou testes.

## Veredito recebido

`Caracterização sustentada no essencial, com correções e alcance parcial.`

O Claude distinguiu fatos dos trechos, inferências e recomendações. Confirmou
fortemente múltiplas autoridades semânticas, contexto reduzido cedo demais,
validação binária do plano, ausência de ciclo agente e remoção da IA por domínio
como resposta a incidentes.

## Achados adicionais relevantes

1. O grafo atual é linear: `START -> planner -> tool -> composer -> verifier ->
   END`. Não existem arestas condicionais de retorno. Portanto, o produto atual
   não contém um agente iterativo que observa o resultado e refina a consulta.
2. Quando o agente responde, `messageHandler` persiste no checkpoint a
   classificação legada (`effectiveIntentClassification`), não o plano que o
   agente realmente executou. Um follow-up pode herdar semântica diferente da
   resposta que o usuário acabou de receber.
3. A preservação de base temporal é implementada ramo a ramo: alguns follow-ups
   herdam, outros forçam `context` e outros `transaction_date`. O reparo não é
   uma invariante central.
4. A ontologia não é o problema isoladamente. A combinação crítica é validação
   tudo-ou-nada, codificações semanticamente equivalentes, reparos posteriores e
   ausência de retorno estruturado do erro ao modelo.
5. `budget` e `quality` possuem bloqueios explícitos que evitam ou limitam a
   composição LLM. Isso confirma acoplamento entre segurança/exatidão e
   linguagem.
6. Usuários com planilha pessoal podem ser desviados do agente por
   `financialAgentSourceCompatible = !usePersonalSpreadsheet`; a troca de fonte
   e seus fallbacks continuam parte causal do problema.

## Correções factuais ao dossiê

O Claude contou no trecho examinado 15 domínios, 16 operações e sete bases
temporais; o candidato havia escrito 18 operações e seis bases temporais. Essa
correção não altera o argumento, mas deve entrar na consolidação final.

## Lacunas do parecer

A resposta atingiu o limite durante a análise da causa C6 e não concluiu as
seções solicitadas sobre benchmark, determinismo indispensável, autonomia,
arquitetura final, migração, rollback e discordâncias. Ela é uma terceira
opinião independente parcial, não um parecer completo nem autorização para
implementar.
