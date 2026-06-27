# Financial Command Planner Canary

Use este runbook somente para um canario aprovado e marker-only. O baseline de producao permanece `shadow`; o Gemini Planner existente continua ativo.

## Pre-gates

- Codigo e testes do command planner implantados.
- `npm test`, `npm audit --audit-level=high`, `git diff --check` e scan de NUL verdes.
- PM2 online, `/dashboard/health` saudavel e logs com `Bot pronto para receber mensagens`.
- Usuario E2E unico, `ACTIVE`, nao-admin e resolvido para o `userId` confiavel do app.
- E2E usa marcador `TESTE_APAGAR_...` e limpeza exata/idempotente.

## Ativar sem restart

1. Salvar backup protegido do `.env` fora do repositorio.
2. Alterar somente:

```text
FINANCIAL_COMMAND_PLANNER_MODE=canary
FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS=<userId-confiavel-unico>
```

3. Recarregar o processo sem reiniciar o WhatsApp:

```bash
pm2 sendSignal SIGHUP financas-bot
```

4. Confirmar nos logs apenas `mode=canary allowlisted_users=1`, sem IDs.
5. Confirmar que o PID nao mudou, PM2 continua online, health segue verde e o WhatsApp nao reiniciou.

O handler rejeita `route`, valores invalidos e `canary` sem allowlist, preservando a configuracao anterior.

## E2E bill.pay

Executar `npm run test:whatsapp:e2e:bill-pay` com as travas E2E, telefone do bot, telefone do usuario de teste e `WHATSAPP_E2E_TEST_USER_LOOKUP` quando o usuario estiver cadastrado por `@lid`.

O fluxo deve:

- reconhecer a conta recorrente antes de categoria/gasto;
- pedir forma de pagamento e confirmacao;
- gravar uma unica `Saídas` com `Recorrente=SIM`;
- projetar `bill_payment` com impacto zero no orcamento livre;
- remover somente o marcador criado e confirmar segunda limpeza com zero resultados.

## Rollback sem restart

Alterar somente:

```text
FINANCIAL_COMMAND_PLANNER_MODE=shadow
FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS=
```

Enviar novo `SIGHUP` e confirmar log sanitizado `mode=shadow allowlisted_users=0`, PID inalterado, health verde e WhatsApp ready.

## GO/NO-GO

`GO` apenas se o E2E e a limpeza passarem, nao houver duplicidade/escrita fora do marcador, a telemetria estiver sanitizada e o bot permanecer operacional. Qualquer falha exige rollback imediato para `shadow` e decisao `NO-GO`.

## Fixture em ambiente externo

Quando o navegador E2E roda localmente e o bot roda na EC2, o seed local pode usar outro vínculo OAuth/planilha. Nesse cenário:

1. Use o mesmo `BILL_PAY_E2E_RUN_ID` no seed remoto e na conversa local.
2. Faça seed e cleanup marker-only no ambiente alvo (EC2).
3. Execute o runner local com `BILL_PAY_E2E_FIXTURE_MODE=external`.
4. Após sucesso ou falha, reverta para `shadow` e confirme zero marcador em `Contas`, `Saídas`, ledger shadow e read-model.

O runner exige uma nova mensagem recebida, identificada por fingerprint/`data-id` ainda não visto, contendo todos os textos esperados. Histórico antigo não pode liberar a próxima etapa.
