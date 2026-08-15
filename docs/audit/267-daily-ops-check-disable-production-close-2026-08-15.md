# Check operacional diário das 09:05 — fechamento de produção

Data: 2026-08-15

## Decisão

O envio `FinancasBot - check diario` foi desativado pela configuração já
existente `DAILY_OPS_CHECK_ENABLED=false`.

Não houve mudança de código. O cron das 09:05 permanece registrado, mas o
serviço retorna `disabled` antes de construir ou enviar a mensagem. Isso mantém
rollback simples e não altera os jobs das 07:00, 20:00 ou qualquer outro cron.

## Evidência

- código confirma fronteira isolada e fail-closed pela flag;
- testes focais de serviço e scheduler: 34/34;
- configuração anterior: `true`; configuração vigente: `false`;
- `.env` anterior preservado somente no servidor para rollback;
- processo reiniciado uma vez de forma controlada;
- release ativo permaneceu
  `28f106d4e9b150cd7e04f589075d3eb873e7cc25`;
- read-model, dashboard e WhatsApp retomaram normalmente;
- health final: `ok=true`, `sqlite=true`, WhatsApp `ready/healthy`.

## Veredito

`DAILY-OPS-09H05: DESATIVADO EM PRODUÇÃO`.

A ausência efetiva da mensagem será observável no próximo horário de 09:05,
sem necessidade de espera ativa. Essa observação não bloqueia o fechamento da
configuração porque o caminho `disabled` foi exercitado diretamente pelos
testes e ocorre antes de qualquer envio.
