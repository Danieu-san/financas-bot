# ADR-004 - Undo financeiro marker-only por recibo

Data: 2026-07-14

Status: aceito para a Fase 6E

## Decisão

O primeiro undo financeiro é deliberadamente restrito a `sheet.append.marker_only`.
Uma operação só é reversível quando cria um recibo explícito com escopo de
usuário, aba, marcador exato e fingerprint da linha. O undo relê a planilha e
só remove a linha quando existe exatamente uma correspondência de marcador e
fingerprint e o item não foi conciliado.

O recibo interno guarda apenas o mínimo necessário para provar a identidade da
linha. O histórico público é append-only e omite usuário, mensagem, marcador,
conteúdo financeiro e fingerprint.

## Matriz v1

| Operação | Reversível na 6E | Motivo |
| --- | --- | --- |
| Append explicitamente registrado como marker-only | Sim | Identidade exata e cleanup limitado podem ser provados. |
| Append financeiro comum sem recibo de undo | Não | Não há autoridade retroativa para escolher uma linha. |
| Item importado ou já conciliado | Não | A exclusão quebraria o vínculo de reconciliação. |
| Update/manutenção em lote | Não | Exige snapshot/compensação ainda não contratados. |
| Delete, movimento de plano ou operação incerta | Não | Não existe inversa segura e inequívoca nesta fase. |
| OCR/preview ou comprovante no Drive | Não | Staging não grava fato; arquivo vinculado tem ciclo de vida próprio. |

## Propriedades de segurança

- flag fail-closed e canário por allowlist exata;
- recibo idempotente por hash de escopo + chave da operação;
- segunda chamada retorna replay e não executa nova exclusão;
- linha ausente, alterada ou duplicada bloqueia sem apagar;
- item conciliado bloqueia antes da leitura/exclusão;
- toda tentativa gera evento sanitizado, inclusive bloqueio, falha e replay.

## Consequência

A 6E entrega a base segura e auditável sem prometer undo geral. Expandir para
lançamentos reais exige um contrato compensatório por tipo de operação e novo
gate; não deve ser feito inferindo a última linha da planilha.
