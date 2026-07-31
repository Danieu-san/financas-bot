# Ativação funcional Open Finance na OCI

Atualizado em: 2026-07-31

Este runbook promove somente as flags da proposta proativa e da escrita
confirmada. Ele não instala código, não usa AWS e não substitui o release OCI
por artefato.

## Invariantes

1. Alerta e reconciliação não escrevem.
2. `prompt` mantém `OPEN_FINANCE_WRITE_MODE=off`.
3. `confirm` exige Daniel presente, segunda confirmação explícita, operation key
   e recibo.
4. O controlador exige um único PM2 online no hash esperado.
5. O `.env` é copiado para backup privado antes da alteração.
6. Falha de restart ou health restaura exatamente o `.env`, reinicia o mesmo
   script e exige health verde.
7. O health exige SQLite e WhatsApp `ready/healthy`.

## Pré-condições

- provedor: Oracle OCI;
- raiz: `/home/ubuntu/financas-bot`;
- processo: `financas-bot`;
- script ativo e `APP_COMMIT_SHA` confirmados;
- `OPEN_FINANCE_ALERT_MODE=canary`;
- `OPEN_FINANCE_RECONCILIATION_MODE=canary`;
- `OPEN_FINANCE_SHADOW_PREVIEW_MODE=canary`;
- stores de staging, revogação, preview e outbox existentes;
- Daniel disponível para o smoke antes da etapa `confirm`.

## 1. Planejar sem mutação

No servidor, dentro do slot auditado:

```bash
node scripts/release/openFinanceActivationRelease.js plan \
  --target /home/ubuntu/financas-bot \
  --env /home/ubuntu/financas-bot/.env \
  --stage prompt
```

O plano mostra somente as seis flags funcionais. Nenhum caminho privado, token
ou segredo é impresso.

## 2. Ativar somente a proposta

Esta etapa permite pergunta e revisão, mas mantém escrita impossível:

```bash
node scripts/release/openFinanceActivationRelease.js apply \
  --target /home/ubuntu/financas-bot \
  --stage prompt \
  --expected-commit <HASH_ATIVO_COMPLETO> \
  --process financas-bot \
  --health-url http://127.0.0.1:8787/dashboard/health \
  --health-attempts 60 \
  --confirm-config-change
```

Validar health local/público, um PM2, zero reinício crescente e ausência de
escrita. Um evento `new` pode oferecer a proposta aos dois cônjuges; match ou
ambiguidade não pode oferecer escrita.

## 3. Ativar escrita confirmada

Somente com Daniel presente e depois da auditoria independente do candidato:

```bash
node scripts/release/openFinanceActivationRelease.js apply \
  --target /home/ubuntu/financas-bot \
  --stage confirm \
  --expected-commit <HASH_ATIVO_COMPLETO> \
  --process financas-bot \
  --health-url http://127.0.0.1:8787/dashboard/health \
  --health-attempts 60 \
  --confirm-config-change \
  --confirm-financial-write \
  --confirm-user-present
```

Smoke obrigatório:

1. atualizar o Item no Meu Pluggy;
2. receber o mesmo evento `new` nos dois WhatsApps;
3. um cônjuge aceita; o outro não pode tomar a revisão;
4. revisar pessoa, categoria, pagamento, conta/cartão e observação;
5. a primeira confirmação prepara e pede a confirmação final;
6. a segunda confirmação cria exatamente uma linha;
7. o recibo é entregue;
8. repetir `sim`, reiniciar ou reenviar não cria outra linha;
9. Sheets, ledger, read-model e dashboard mostram o mesmo efeito;
10. remover qualquer marcador de teste e provar zero resíduo.

## 4. Rollback imediato de escrita

Preserva a proposta para diagnóstico, mas remove capacidade de gravar:

```bash
node scripts/release/openFinanceActivationRelease.js apply \
  --target /home/ubuntu/financas-bot \
  --stage write-off \
  --expected-commit <HASH_ATIVO_COMPLETO> \
  --process financas-bot \
  --health-url http://127.0.0.1:8787/dashboard/health \
  --health-attempts 60 \
  --confirm-config-change
```

Para desligar também a proposta, usar `--stage off`.

## GO/NO-GO

`GO` exige auditoria independente, health completo, escrita única somente após
duas confirmações, recibo, replay idempotente, coerência entre fontes e cleanup
zero. Qualquer divergência executa `write-off` e resulta em `NO-GO`.
