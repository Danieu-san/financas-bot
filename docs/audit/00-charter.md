# Auditoria adversarial de coerencia ponta a ponta e cobertura de caminhos

Data de abertura: 2026-07-17

## Objeto congelado

- Commit local/GitHub: `94c52f23261ae2b9150edcdb7f3ba5ebaba35727`.
- Tree: `363ef7fcbbeb18bbc3eb4810e0d4e9cce48755ae`.
- EC2 equivalente antes da auditoria: `0d9dc4f`.
- Branch observada: `main`.

Documentos produzidos pela propria auditoria podem alterar o worktree, mas nao
mudam o objeto de codigo auditado. Qualquer novo commit de produto fica fora da
rodada e exige novo congelamento.

## Objetivo

Provar se cada promessa do FinancasBot possui um caminho completo, autorizado,
recuperavel, revogavel, idempotente e coerente com os demais caminhos.

O levantamento parte dos comportamentos, nao dos arquivos. Cada jornada deve
ser percorrida da entrada ao ultimo efeito persistente e tambem no sentido
inverso, do dado persistido ate origem, ator, transformacao e decisao.

## Escopo

- identidade, consentimento, autorizacao familiar e WhatsApp;
- interpretacao, ambiguidade, estados conversacionais e confirmacao;
- gastos, entradas, transferencias, contas, dividas, metas e cartoes;
- importacao, anexos, comprovantes, OCR, exportacao e manutencao em lote;
- consultas, calculos, read-model, ledger, dashboard e agentes/planners;
- recorrencia, parcelamento, fatura, scheduler e Calendar;
- Open Finance, Pluggy, reconciliacao, preview, alertas e outbox;
- retry, replay, concorrencia, restart, backup, restore, revogacao e retencao;
- admin, multiusuario, privacidade, segredos, logs, flags e rollback;
- coerencia entre roadmap, ADRs, gates, codigo, testes e producao.

## Fora do escopo desta rodada

- corrigir achados;
- mudar codigo de produto ou testes para faze-los passar;
- deploy, restart de PM2 ou mudanca de flags;
- forcar polling, enviar WhatsApp ou executar escrita real;
- revogar consentimento real;
- ativar revisao remota ou `salvar <referencia>`;
- remover legado ou ampliar escopo administrativo.

## Categorias de evidencia

1. `DOC`: fato apenas documentado.
2. `CODE`: fato demonstrado estaticamente pelo codigo.
3. `TEST`: fato demonstrado por teste local reproduzivel.
4. `PROD`: fato demonstrado em producao por leitura sanitizada e sem mutacao.
5. `INFERENCE`: inferencia ainda nao comprovada.
6. `GAP`: promessa sem caminho ou evidencia suficiente.

Nenhum `DOC` ou `INFERENCE` pode ser promovido a `TEST`/`PROD` por contagem de
testes, relato historico ou aparencia da resposta final.

## Severidade

- `P0`: exposicao, perda ou escrita financeira indevida em curso.
- `P1`: caminho plausivel para acesso cruzado, duplicidade, corrupcao ou sucesso
  falso sem barreira suficiente.
- `P2`: caminho incompleto, degradacao insegura ou recuperacao insuficiente.
- `P3`: cobertura, documentacao, observabilidade ou manutencao deficiente sem
  efeito financeiro imediato.

## Metodo

1. Inventariar capacidades, entradas, estados persistentes, saidas e efeitos.
2. Definir a matriz real de autorizacao familiar.
3. Catalogar jornadas com identificador e contrato ponta a ponta.
4. Cruzar cada jornada com estado, replay, falha, retry, restart e dependencia.
5. Auditar cada dominio e depois as interacoes entre dominios.
6. Provar negativamente que acoes proibidas nao acontecem.
7. Consolidar evidencias, contradicoes, riscos e menor ordem segura de correcao.

## Regra de nao correcao

Achados serao registrados com evidencia, impacto e recomendacao, sem alteracao
do comportamento auditado. Uma falha critica pode interromper a coleta para
proteger dados, mas nao autoriza correcao ou deploy sem novo gate.

## Trava de continuidade

Ao finalizar o relatorio desta auditoria:

1. voltar ao canario persistente do preview Open Finance;
2. observar e fechar o proximo polling natural sem forcar ciclo;
3. confirmar health, WhatsApp, zero escrita, journal, preview, outbox e retencao;
4. registrar o GO/NO-GO desse polling;
5. somente depois ordenar as correcoes encontradas;
6. implementar correcoes em fatias pequenas, cada uma com teste, rollback e gate;
7. reauditar cada conjunto antes de promover flags ou ampliar produto.

Essa ordem nao pode ser invertida por conveniencia nem pelo aparecimento de um
achado nao emergencial.

## Artefatos esperados

- `01-family-authorization-model.md`;
- `02-capability-inventory.md`;
- `03-state-inventory.md`;
- `04-workflow-catalog.md`;
- `05-failure-matrix.md`;
- `06-evidence-index.md`;
- `domain-reports/`;
- `final-report.md`.

## Gate de saida da auditoria

O relatorio final deve classificar caminhos demonstrados, apenas documentados,
parciais e inexistentes; registrar contradicoes e riscos; listar acoes ainda
proibidas; e indicar a menor sequencia segura de correcao. O gate nao autoriza
essas correcoes: ele devolve o trabalho ao polling natural Open Finance.

## Fechamento da trava - 2026-07-18

- Polling posterior observado naturalmente as 01h25 UTC, sem execucao forcada.
- Resultado `GO`: `new=0`, `accepted_unconfirmed=3`, `retries=0`, `writes=0`.
- Tree equivalente; PM2, health e WhatsApp verdes; canary/canary com write off.
- Journal real zero; preview 1/1 sem expirado; outbox pending/in-flight zero.
- A trava foi satisfeita. `AUTH-01` e a primeira correcao futura, em nova fatia;
  nenhuma correcao foi implementada durante a auditoria ou o heartbeat.
