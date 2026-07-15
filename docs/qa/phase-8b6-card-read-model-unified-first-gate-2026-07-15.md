# Fase 8B.6 - read-model de cartao unified-first

Data: 2026-07-15

## Veredito

`GO de producao em canario pessoal` para o read-model de cartao. Permanece
`NO-GO` para modo global, migracao de scheduler/manutencao/WhatsApp, remocao de
abas ou retirada de fallback.

## Resultado principal

O read-model passou a consultar primeiro `Lancamentos Cartao` quando a flag esta
em `canary` para um contexto pessoal. Uma fonte unificada com ao menos uma linha
valida evita as quatro leituras legadas. Fonte ausente, vazia ou sem entrada
valida conserva o fallback. `off` restaura o comportamento anterior com uma
unica flag.

O E2E real na EC2 encontrou:

- 3 escopos pessoais ativos e acessiveis;
- 2 rotas `unified_first`;
- 1 rota `legacy_fallback` para escopo sem entrada valida;
- 76 entradas canonicas;
- snapshots `off` e `canary` identicos;
- zero leitura legada nos escopos unificados populados;
- quatro leituras legadas restauradas por escopo no rollback `off`;
- zero erro de fonte;
- zero escrita;
- somente agregados sanitizados no resultado.

## Implementacao

Commit de codigo: `632e48cdbeaaa399dfdacb24fe3ca905fca01ea0`
(`feat: migrar read-model de cartao em canario`).

- `CARD_READ_MODEL_UNIFIED_FIRST_MODE=off|canary|on`;
- valor ausente ou invalido falha fechado em `off`;
- `canary` aceita somente contexto `user:*`; o central continua compativel;
- `on` existe no contrato, mas nao foi autorizado em producao;
- a selecao e exclusiva do consumidor `read_model_service`;
- metadado do snapshot registra rota e modo abstratos;
- nenhum caminho de escrita financeira foi alterado;
- script `e2e:card-read-model-unified-first` compara os dois modos sem publicar
  usuario, cartao, descricao, valor ou linha.

## Evidencia local

- teste focado do agente/read-model: `87/87`;
- contratos relevantes de read-model, telemetria e paridade: `115/115`;
- pretests 6A-6E verdes;
- suite integral: `879/879`;
- sintaxe, JSON e `git diff --check`: verdes.

## Deploy e producao

- push e fast-forward para `632e48c`;
- backup `.env.bak-phase8b6-20260715162645` antes da flag/restart;
- testes remotos focados: `108/108`;
- E2E read-only: `GO`;
- `CARD_READ_MODEL_UNIFIED_FIRST_MODE=canary`;
- `APP_COMMIT_SHA` e Git no hash completo `632e48c...`;
- PM2 online; WhatsApp, bot e cron prontos;
- health `ok=true`, `sqlite=true`.

Telemetria desde `2026-07-15T16:26:00Z`, depois do heartbeat oficial:

- veredito `OBSERVING`;
- 1 heartbeat;
- 32 eventos considerados;
- zero linha invalida;
- 7 leituras unificadas;
- 24 leituras legadas;
- zero escrita;
- `removal_candidate=false`.

As leituras legadas do recorte nao representam falha do canario. Elas incluem a
prova de rollback em `off`, o fallback do escopo vazio, a manutencao ainda
legada e o startup central propositalmente fora do canario.

## Inteligencia da decisao

O ganho seguro desta fatia nao e apagar estrutura, e parar de consultar uma
projecao pessoal que perde identidade de cartao quando a fonte unificada ja e
suficiente. O escopo vazio permanece protegido pelo fallback e o ambiente
central nao mudou. Isso reduz ambiguidade no read-model sem transformar poucos
minutos de observacao em prova de desuso.

## Proximo gate

`8B.7 - scheduler de cartao unified-first`:

1. caracterizar exatamente o ciclo mensal e a semantica do scheduler;
2. ler estrutura unificada por escopo sem alterar formulas ou escrita;
3. preservar fallback por uma flag propria/fail-closed;
4. provar mesma saida em fixtures e E2E read-only;
5. manter manutencao e WhatsApp fora da fatia;
6. nenhuma remocao antes da janela de 60 dias/dois fechamentos.
