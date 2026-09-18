# Retorno mecânico — FinançasBot NEXT-02 / N02-A

Data: 2026-09-05
Tarefa: `FIN-NEXT02-N02A-REAUDIT-RETURN-20260905`

## Objeto recebido

- commit auditado: `af83a4e0cd79de5e582ce2bd030eb0328da32d52`;
- parent único: `5d4339f46a9ec412d6c86894853435c7238dbcf1`;
- veredito independente: **NO-GO**.

## Findings recebidos

### HIGH-01 — boundary de `expenses.sum`

`expenses.sum` aceita IDs internos de conta/cartão em argumentos destinados ao
modelo e os ecoa no claim. O contrato de Model Data Boundary exige labels
públicas ou referências efêmeras; por isso o finding é bloqueante para N02-A.

### MEDIUM-01 — `coverage` e `as_of`

Uma cobertura declarada `complete` pode sustentar ausência conclusiva além do
cutoff informado por `as_of`. A relação temporal precisa ser fechada sem ampliar
a cadeia causal além do parecer recebido.

### MEDIUM-02 — vínculo do pagamento de fatura

`invoice_payment` valida `settles_card_id`, mas o evento canônico não preserva
esse vínculo material. A neutralidade do pagamento em `expenses.sum` permanece,
mas a provenance do cartão liquidado é perdida.

## Limite da evidência

O parecer foi uma revisão estática independente do commit publicado. Os números
locais `20/20`, `86/86` e `1.939 PASS` não foram reexecutados pelo auditor e não
são convertidos neste retorno em prova independente.

Este retorno não altera o candidato, não encerra NEXT-02, não abre NEXT-03 e não
solicita auditoria duplicada do mesmo hash. Nenhuma ação de produção, writer,
adapter real, OCI, WhatsApp, Google, Pluggy, dado real, segredo, sessão ou `.env`
foi executada nesta tarefa.
