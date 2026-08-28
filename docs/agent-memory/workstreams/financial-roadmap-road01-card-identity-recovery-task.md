# ROAD-01.2 recovery — Faturas legacy fallback + friendly display

Data: 2026-08-28
Status: `READY_FOR_CODEX_RECOVERY`
Branch de produto: `chat/financial-roadmap-road01-20260827`
Candidato recusado: `fe39d8c57a7907da02282035130aa1fe4f56b47c`
Parecer independente: `NO-GO ROAD-01.2`

## Objetivo único

Corrigir somente os dois bloqueios encontrados na auditoria independente do candidato ROAD-01.2, preservando todo o restante do patch já validado:

1. linhas históricas de `Lançamentos Cartão` sem `card_id` devem continuar contabilizáveis em `Faturas`, usando identidade de compatibilidade derivada do label legado, sem fundir labels distintos;
2. `Faturas` deve agrupar contabilmente por identidade estável e exibir nome amigável/canônico ao usuário, sem mostrar o `card_id` bruto como apresentação quando houver label resolvível.

## O que já deve ser preservado

- `cardInfo.cardId` explícito vence slug/ID derivado de label;
- rota `Cartão <label>` continua apenas como compatibilidade física;
- personal writer mantém G=`card_id`, H=display canônico, I=relation note e J=`user_id`;
- import e `saveCreditCardExpense()` propagam ID/display canônicos;
- `buildLegacyCreditCardOptions()` não inventa `cardId:key` para fluxo legacy;
- nenhuma regra de titular exclusivo;
- nenhuma mudança de closing/competence/installments/refunds/saldo/budget/áudio/Open Finance.

## Requisitos causais do recovery

1. Duas linhas novas com o mesmo `card_id` e labels diferentes devem produzir uma única fatura para a mesma competência.
2. Essa fatura deve exibir um nome amigável/canônico, não o `card_id` bruto, quando o catálogo/linha permitir resolução segura.
3. Linha histórica com G vazio e H=`Itaú Daniel` deve continuar incluída em `Faturas` por uma chave legacy estável baseada em H.
4. Duas linhas históricas sem G com H distintos não podem ser fundidas entre si.
5. Linha histórica sem G não pode ser fundida automaticamente com uma linha canônica de G preenchido apenas porque H é parecido; qualquer convergência entre legacy e canônico exige identidade comprovável, não heurística.
6. O mecanismo de apresentação não pode reintroduzir H como chave contábil para linhas canônicas.
7. Nenhum backfill/migração de planilha real é permitido.

## Testes obrigatórios

Adicionar prova causal que execute a transformação/agregação usada por `Faturas`, não apenas substring de fórmula:

- mesmo G, H variado -> 1 grupo, display amigável;
- G vazio, H preenchido -> grupo legacy presente;
- dois H legacy distintos -> 2 grupos;
- G canônico + H legacy semelhante -> não fundir por heurística;
- writer adapter continua G/H/I/J corretos;
- regressão dos testes focais existentes permanece verde.

Se a implementação continuar baseada em fórmula Google Sheets, extraia/adicione um helper puro equivalente para testar causalmente a regra de identidade e display, ou use outra prova local determinística que reflita exatamente a semântica da fórmula. Não acessar Google Sheets real.

## Validação

- `node --check` nos módulos alterados;
- `git diff --check`;
- testes novos causais;
- testes focais ROAD-01.2 anteriores;
- suíte ampla somente depois de candidato estável, conforme `AGENTS.md`;
- relatório deve listar contagens, arquivos e riscos residuais.

## Proibições

- sem deploy/restart/flags;
- sem Google Sheets, WhatsApp, Pluggy, OCI ou dados privados;
- sem backfill/migração;
- sem ampliar para ROAD-01.3/ROAD-02/ROAD-03/AUDIO;
- sem alterar semântica de fechamento, competência, parcelas, refunds ou titularidade;
- sem retirar legado/canários.
