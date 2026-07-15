# Fase 8B.7 - scheduler de cartao unified-first

Data: 2026-07-15

## Veredito

`GO de producao em canario` para a leitura de cartoes do relatorio mensal.
Permanece `NO-GO` para modo global, remocao de abas/fallback, mudanca de
formulas, migracao da manutencao ou alteracao dos handlers WhatsApp.

## Achado de caracterizacao

O job `sendMonthlyReports` executa as 08:00 do primeiro dia de cada mes e
resume o mes anterior. A rota antiga lia quatro abas legadas no contexto
central antes de somar por `user_id` e competencia da fatura.

A 8B.5 ja havia mostrado que a fonte central de cartoes estava vazia. O E2E
8B.7 confirmou quatro leituras de rollback e zero linha central, enquanto as
planilhas pessoais continham 76 entradas canonicas. Portanto, preservar o mesmo
numero do caminho antigo poderia preservar um zero causado por fonte errada.
A semantica correta a conservar e mes/ano, competencia, usuario, opt-in e
formula; a origem deve ser pessoal.

## Implementacao

Commit de codigo: `6e12db52a16d8aa40cce00480c0b4e9a9bb0e49d`
(`feat: migrar scheduler de cartao em canario`).

- `CARD_SCHEDULER_UNIFIED_FIRST_MODE=off|canary|on`;
- ausente/invalida falha fechado em `off`;
- `off` restaura as quatro leituras centrais anteriores;
- `canary` consulta a fonte pessoal unificada por usuario;
- unificada populada evita as quatro rotas legadas;
- unificada vazia/sem entrada valida consulta as quatro rotas legadas;
- o total continua filtrado por `user_id`, mes e ano da competencia;
- opt-out mensal continua evitando o envio;
- nenhuma escrita ou formula foi alterada.

## Evidencia local

- scheduler isolado: `16/16`;
- scheduler/read-model/telemetria/paridade integrados: `112/112`;
- pretests 6A-6E verdes;
- suite integral: `883/883`;
- sintaxe, JSON e `git diff --check`: verdes.

## E2E read-only real

O script `e2e:card-scheduler-unified-first` nao chama o envio do relatorio.
Resultado apos ativar a flag:

- `verdict=GO` e `configured_mode=canary`;
- 3 escopos ativos/acessiveis;
- 2 `unified_first`;
- 1 `legacy_fallback`;
- 76 entradas canonicas pessoais;
- unificadas populadas fizeram zero leitura legada;
- fallback consultou as quatro rotas;
- rollback consultou quatro rotas centrais e encontrou zero linha;
- zero erro, zero mensagem e zero escrita;
- nenhum usuario ou valor financeiro foi emitido.

## Deploy e producao

- backup `.env.bak-phase8b7-20260715164137`;
- testes remotos focados: `103/103`;
- `CARD_READ_MODEL_UNIFIED_FIRST_MODE=canary` preservado;
- `CARD_SCHEDULER_UNIFIED_FIRST_MODE=canary` ativado;
- Git e `APP_COMMIT_SHA` no hash completo `6e12db5...`;
- PM2 online; WhatsApp, bot e cron prontos;
- health `ok=true`, `sqlite=true`.

Telemetria desde `2026-07-15T16:41:00Z`:

- `OBSERVING`, heartbeat 1, 32 eventos e zero linha invalida;
- scheduler: 22 leituras, zero escrita;
- read-model: 5 leituras, zero escrita;
- manutencao: 4 leituras, zero escrita;
- total de rotas: 7 unificadas, 24 legadas, zero escrita;
- `removal_candidate=false`.

O volume do scheduler inclui as duas execucoes controladas do E2E e suas provas
de fallback/rollback; nao representa duas execucoes do cron mensal.

## Inteligencia da decisao

O antigo zero central nao era evidencia de ausencia de gasto, mas de que o job
consultava uma fonte que deixou de carregar os dados atuais. A migracao corrige
o roteamento sem mudar a matematica nem enviar um relatorio de teste para os
usuarios. O fallback e o modo `off` continuam disponiveis durante a janela de
observacao.

## Proximo gate

`8B.8 - manutencao de cartao unified-first`:

1. separar selecao read-only de qualquer mutacao de manutencao;
2. caracterizar as quatro leituras centrais e seus comandos consumidores;
3. preservar preview, confirmacao, escopo e rollback;
4. migrar somente a descoberta da fonte por flag fail-closed;
5. E2E sem mutacao ou com fixture isolada/limpeza comprovada, conforme o fluxo;
6. nenhuma remocao e nenhum modo global.
