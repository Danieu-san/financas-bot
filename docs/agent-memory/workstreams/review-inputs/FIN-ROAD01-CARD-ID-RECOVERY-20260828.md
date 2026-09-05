# FIN-ROAD01-CARD-ID-RECOVERY-20260828 — brief sanitizado

## Alvo

Corrigir somente os bloqueios funcionais encontrados na auditoria independente do candidato ROAD-01.2 `fe39d8c57a7907da02282035130aa1fe4f56b47c`.

A branch operacional atual é descendente desse candidato e contém também mudanças mecânicas/ORCH fora do escopo; não toque nelas.

## Blobs-base que devem coincidir antes de editar

- `src/handlers/messageHandler.js`: `e2f8aeac00e82233786d487b5b36546921272ed7`
- `src/services/google.js`: `cb85aa6db1d81bd47cd6908a0cde97b01e0bfe15`
- `src/services/userSpreadsheetService.js`: `e5bcf3978a1eba7707ec8115311dc24f40699b31`
- `tests/unit.test.js`: `46fc44aab9c54d7fc2bf96c5a146d2fc2534b5a2`
- `tests/userSpreadsheetService.test.js`: `e8b52431ca27db46885bf5538d43e210f3691db2`

Se qualquer blob divergir, registre `BLOCKED` e não implemente.

## NO-GO independente — fatos a corrigir

1. A fórmula atual de `Faturas` usa `where J is not null and G is not null group by G, F`; portanto linhas históricas com G/card_id vazio desaparecem do resumo.
2. A fórmula atual seleciona `G` e apenas faz `label G 'Cartão'`; portanto exibe o `card_id` bruto, não o nome amigável/canônico.
3. Os testes atuais não provam causalmente esses dois comportamentos; verificam helper/writer e substrings da fórmula.

## Contrato do recovery

Preservar tudo que já passou:

- `card_id` explícito vence slug/ID derivado;
- rota física legacy `Cartão <label>` não volta a ser identidade contábil;
- personal writer mantém G=`card_id`, H=display canônico, I=relation note, J=`user_id`;
- import e `saveCreditCardExpense()` continuam propagando ID/display;
- callers legacy sem cardDisplayName continuam legíveis;
- nenhuma regra de titularidade exclusiva.

Corrigir somente:

A. Linhas canônicas: mesmo G/card_id + mesma competência devem agrupar juntas mesmo com H/labels diferentes.
B. Apresentação: o grupo canônico deve exibir nome amigável/canônico quando resolvível, sem usar o card_id bruto como display.
C. Linhas históricas: G vazio + H preenchido continua contabilizável por identidade legacy baseada no label exato normalizado de forma determinística; H legacy distintos não podem ser fundidos.
D. Não fundir automaticamente linha legacy sem G com linha canônica de G preenchido apenas por similaridade de label; nenhuma heurística de identidade.
E. Não fazer backfill/migração.

## Prova causal obrigatória

Adicionar helper puro/local que represente exatamente a regra de agrupamento/apresentação de `Faturas`, ou outra prova determinística equivalente, e testar pelo menos:

- G=`nubank-daniel`, H=`Nubank - Daniel` + G=`nubank-daniel`, H=`Cartão Nubank - Daniel`, mesma F => 1 grupo e display amigável;
- G vazio, H=`Itaú Daniel` => grupo presente;
- duas linhas G vazio com H distintos => 2 grupos;
- linha G canônico e linha G vazio com H parecido => não fundir sem identidade comprovada;
- writer adapter continua G/H/I/J correto.

A fórmula/template deve ser coerente com o helper testado. Teste de substring isolado não basta.

## Fora do escopo

Não alterar fechamento/competência, `purchaseDate > closingDay`, future installments, refunds, saldo, budget, áudio, Open Finance, schema v2, timezone, recorrência, autorização/titularidade, deploy, flags, backfill ou remoção de legado.

## Validação

- revisão adversarial antes da edição;
- menor patch causal;
- `node --check` nos módulos alterados;
- `git diff --check`;
- testes causais novos;
- regressão dos testes focais ROAD-01.2;
- somente quando estável, uma suíte ampla proporcional conforme `AGENTS.md`;
- relatório com arquivos, comandos, contagens, riscos e `READY_FOR_CHAT_AUDIT` ou `BLOCKED`.
