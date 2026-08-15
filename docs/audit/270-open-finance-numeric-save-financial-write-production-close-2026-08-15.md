# Fluxo numérico e escrita de compra — fechamento funcional do núcleo

Data: 2026-08-15

## Release observado

- produto ativo: `37e58c57c9cccd622556fe849dbc6230416ec8b3`;
- provedor: Oracle OCI;
- processo: `financas-bot`, único, online e sem reinícios;
- health local e público: `ok=true`, `sqlite=true`, WhatsApp
  `ready/healthy`.

## Smoke real

O WhatsApp de Daniel recebeu um único lote numerado com quatro compras e os
comandos `salvar 1`, `salvar 1 e 3` e `salvar todas`. O item 1 foi selecionado
e percorreu o produto real:

1. reserva individual do item no lote familiar;
2. revisão guiada de categoria e cartão;
3. revalidação final contra Open Finance e planilha;
4. segundo consentimento explícito;
5. escrita única na aba consolidada de cartões;
6. recibo durável entregue ao usuário.

A operação apareceu uma única vez como `committed` no ledger de escritas e a
finalização durável chegou a `receipt_delivered`. Os outros três itens não
foram escritos. O lançamento usado no smoke é uma despesa real que estava
ausente da planilha; por isso, não foi apagado como resíduo sintético.

## Veredito por gate

- Gate 34, núcleo do lote numérico em produção: `GO FUNCIONAL`;
- Gate 39, núcleo da escrita de compra com confirmação final: `GO FUNCIONAL`;
- idempotência observável: uma operação e um recibo para a seleção;
- escrita automática continua inexistente: nada é salvo sem revisão e segundo
  consentimento.

O fechamento ampliado da mensagem proativa permanece pendente: pessoa,
conta/cartão e categoria devem chegar pré-preenchidos quando a origem e as
regras determinísticas já fornecem evidência forte. Esse ajuste deve ser
provado com o backlog real antes da aplicação do writer histórico.

## Achado lateral preservado

O lote continha despesas anteriores ao dia do smoke. Elas são novas para a
reconciliação/outbox, não compras bancárias novas. O RX saneado permaneceu
read-only e, portanto, não materializou os itens prontos na planilha. Esse
achado não invalida a escrita unitária, mas impede declarar completos os totais
financeiros até o writer histórico do Gate 41 ser fechado e aplicado.
