# OF-FAMILY-01 - candidato de alertas familiares proativos

Data: 2026-07-30

Base:
`68accefbd186b9ddef58addfd394ad034e874683`.

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Este gate é local. Não altera configuração, flags, planilha, sessão WhatsApp ou
produção e não autoriza deploy.

## Contrato implementado

- cada movimentação Open Finance elegível gera uma linha durável por cônjuge;
- Daniel e Thaís recebem a mesma movimentação familiar nova;
- a reconciliação consulta os dois escopos familiares autorizados e falha
  fechado quando a fonte interna não está disponível;
- item já representado no ledger/planilha não entra no outbox;
- o alerta já oferece continuar para salvar, sem exigir `salvar <referência>`;
- nenhuma escrita financeira ocorre durante descoberta, reconciliação, alerta
  ou primeira resposta;
- o primeiro cônjuge que responde assume a revisão durável e o segundo não
  consegue abrir uma revisão ou efeito duplicado.

## Implementação

`src/openFinance/openFinanceAlertOutbox.js`:

- aceita somente política estritamente owner-only ou o casal exato
  Daniel/Thaís;
- migra o índice owner-only preservando linhas existentes;
- usa unicidade por evento, marco e destinatário;
- enfileira payload cifrado separado por cônjuge;
- ordena linhas do mesmo evento de forma adjacente.

`src/openFinance/openFinanceCanaryRuntime.js`:

- resolve os dois usuários internos para reconciliação no modo familiar;
- resolve os dois atores de confirmação;
- exige política familiar uniforme e rejeita mistura de modos;
- ajusta o máximo da rodada para não cortar o par de destinatários.

`src/openFinance/openFinanceWhatsappCanaryDelivery.js`,
`src/openFinance/openFinanceShadowPreviewStore.js` e
`src/openFinance/openFinanceSaveProposalConversation.js`:

- entregam a proposta aos dois sem reservar a confirmação no envio;
- vinculam a revisão ao primeiro ator familiar autorizado que responder;
- recusam a segunda tentativa concorrente com resposta segura;
- preservam o fluxo owner-only anterior.

A mensagem não inventa categoria. A classificação é feita na conferência
guiada existente, usando o catálogo autorizado.

## Provas locais

RED inicial:

- quatro provas familiares falharam antes da implementação por rejeição da
  política compartilhada, ausência de fanout e vínculo exclusivo ao titular.

GREEN final:

- sintaxe dos sete arquivos alterados: verde;
- suíte focal e afetada: `77/77`;
- `git diff --check`: verde.

As provas incluem:

1. duas linhas e duas entregas idempotentes para um evento;
2. migração de outbox owner-only preenchido sem perda;
3. bloqueio de item já representado na fonte interna;
4. proposta proativa sem preparação antecipada da confirmação;
5. disputa entre os dois cônjuges com um único vencedor;
6. fluxo público de resposta com revisão única e zero escrita;
7. ciclo real do runtime com limite configurado em um e duas mensagens
   entregues, uma para cada cônjuge;
8. reconciliação compartilhada contra os dois `user_id`.

## Invariantes

1. O compartilhamento deriva somente da política familiar explícita.
2. Política mista ou fora do casal falha fechado.
3. Ausência de fonte interna nunca vira “movimentação nova”.
4. Retry e replay não duplicam a linha do mesmo destinatário.
5. A confirmação permanece one-time e vinculada ao primeiro ator.
6. `financial_writes=0` até a revisão e confirmação final já protegidas pelos
   gates anteriores.

## Arquivos para auditoria

- `docs/audit/91-open-finance-family-alerts-candidate-2026-07-30.md`;
- `src/openFinance/openFinanceAlertOutbox.js`;
- `src/openFinance/openFinanceCanaryRuntime.js`;
- `src/openFinance/openFinanceWhatsappCanaryDelivery.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `tests/openFinanceFamilyAlerts.test.js`;
- `tests/openFinanceCanaryRuntime.test.js`.

## Critério de fechamento

A auditoria independente deve confirmar que o fanout é exatamente para o casal,
que a reconciliação antecede a entrega, que a migração preserva o outbox
existente, que o primeiro respondente vence sem efeito duplicado e que não resta
lacuna causal indispensável para o fechamento técnico local.
