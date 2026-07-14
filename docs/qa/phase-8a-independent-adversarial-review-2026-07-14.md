# Fase 8A - revisao adversarial independente - 2026-07-14

## Proveniencia e limite

Este documento registra o parecer independente produzido no Chat a partir da
auditoria 8A e dos roadmaps. O parecer nao teve acesso direto ao repositorio,
logs ou producao. Seus achados foram confrontados pelo Codex com codigo, testes
e evidencias locais antes de alterar o plano.

## Veredito aceito

`GO COM CONDICOES para iniciar 8B` e `NO-GO para qualquer remocao`.

8B deve comecar por telemetria duravel, caracterizacao de consumidores,
correcao de lacunas conhecidas e migracao pequena, reversivel e por dominio.

## Travas incorporadas

1. Telemetria precisa ter heartbeat duravel; ausencia de evento sem heartbeat
   nao prova ausencia de uso.
2. Uso zero exige todos os pontos de entrada instrumentados, busca estatica e
   dinamica, inspecao de jobs/scripts/runbooks e uma janela minima que cubra o
   ciclo funcional.
3. Janela base: pelo menos 45 dias e um ciclo orcamentario completo. Cartoes
   exigem preferencialmente dois fechamentos ou pelo menos 60 dias.
4. O dashboard deve distinguir request, refresh, sessao e uso humano antes de
   interpretar volume como adocao.
5. A Fase 6E fica classificada como infraestrutura validada e capacidade de
   produto parcial; integracao WhatsApp nao esta demonstrada.
6. Modulo sem consumer estatico continua em quarentena ate excluir imports
   dinamicos, scripts, cron, recuperacao e uso manual.
7. A 8C so pode remover itens com uso zero que nao sejam necessarios ao
   cutover/rollback da 8D. Fallbacks de fonte permanecem ate a 8D passar e
   completar sua janela de estabilidade.
8. Ferramentas de gate, paridade, backup, restore e E2E devem ser classificadas
   como QA/operacao/recuperacao, nao como runtime morto.

## Evidencias reconfirmadas no repositorio

- fallback analitico possui uso observado e o gate segue `NO_GO` em `BILL-015`;
- dashboard v1 possui trafego duravel nao zero;
- `financialUndoService` nao esta ligado ao `messageHandler`;
- read-model possui metricas em memoria que zeram no flush horario;
- dashboard e outros servicos possuem JSONL duravel, mas sem contrato comum de
  uso/fallback;
- `messageHandler.js` concentra mais de 10 mil linhas e exige migracoes por ramo;
- projected plans, ledger canary, Sheets e fallbacks continuam com consumidores
  ou funcao de rollback.

## Hipoteses que continuam pendentes

O parecer levantou perguntas que a 8B deve medir, nao assumir:

- quantos acessos do dashboard sao sessoes humanas em vez de polling/refresh;
- quais dominios originaram cada fallback real;
- se scripts/cron/imports dinamicos alcancam modulos em quarentena;
- se abas antigas de cartao possuem formulas, jobs ou leitores raros;
- quais estados conversacionais criticos sobrevivem a restart;
- quais fallbacks de fonte serao necessarios durante o cutover 8D.

## Sequencia aprovada

1. 8B.0 - contrato e telemetria duravel, heartbeat e privacidade.
2. 8B.1 - instrumentacao analitica completa e correcao de `BILL-015`.
3. 8B.2 - caracterizacao e migracao reversivel dashboard v1 -> v2.
4. 8B.3 - decisao explicita sobre integrar ou desligar/test-only o undo 6E.
5. 8B.4 - cartoes e modulos em quarentena.

Nenhuma etapa desta sequencia autoriza remocao. Candidatos somente entram na 8C
depois da janela e dos gates objetivos.
