# Fase 9E.1 - canario real de compra e estorno - 2026-07-16

## Veredito

`GO final` depois de um incidente real de duplicacao, correcao e replay sem nova
entrega.

## Evidencia real

- uma compra Nubank Daniel de R$ 11,93 e o estorno correspondente apareceram
  somente depois da atualizacao manual no Meu Pluggy;
- o baseline encontrou tres observacoes novas: compra, estorno e uma entrada
  independente;
- somente compra e estorno ficaram alertaveis; a entrada permaneceu bloqueada;
- o primeiro ciclo entregou a compra duas vezes porque o transporte resolveu a
  Promise sem retornar ID do provedor e o worker interpretou isso como falha;
- a confirmacao do usuario fechou exatamente o alerta ambiguo pela referencia
  interna, impedindo uma terceira copia;
- a correcao passou a registrar aceite local deterministico quando o envio
  resolve sem ID do provedor;
- o estorno foi entregue uma unica vez;
- restart/replay posterior produziu zero nova entrega;
- estado final sanitizado: dois alertas enviados, zero pendente, um evento nao
  alertavel bloqueado e zero escrita financeira.

## Controles preservados

- runtime somente em `canary`, com uma unica fonte (`daniel_nubank`);
- `OPEN_FINANCE_WRITE_MODE=off`;
- polling nunca chama Pluggy Update Item;
- apenas `purchase` e `refund` sao alertaveis;
- destinatario precisa resolver para exatamente um usuario ativo;
- baseline, staging e outbox permanecem cifrados;
- toda mensagem informa que nada foi salvo automaticamente;
- logs agora separam `delivered` do ciclo de `cumulative_sent`, evitando que um
  replay pareca uma nova entrega.

## Evidencia tecnica final

- Open Finance: `71/71`;
- suite completa: `964/964`;
- pre-gates 6A `17/17`, 6B `41/41`, 6C `8/8`, 6D `5/5`, 6E `5/5`;
- npm audit: zero vulnerabilidades;
- producao no commit `efc4e92db7e9035952ce50fa5832f39544f112d7`;
- health `ok=true`, `sqlite=true`, WhatsApp pronto;
- ciclo pos-deploy: `new=0`, `delivered=0`, `retries=0`,
  `cumulative_sent=2`, `writes=0`.

## Limitacao da rota gratuita

Para disponibilidade imediata, a atualizacao continua manual no Meu Pluggy. O
polling do FinancasBot le automaticamente o que o provedor ja atualizou, mas nao
forca sincronizacao bancaria. Nenhuma dependencia Pro, webhook pago ou meio de
pagamento foi adicionada.
