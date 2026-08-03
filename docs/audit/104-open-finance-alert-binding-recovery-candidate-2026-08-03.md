# Open Finance — candidato de recovery de alertas e vínculo conversacional

Data: 2026-08-03

## Incidente observado

O smoke familiar `prompt-only` expôs quatro comportamentos distintos:

1. uma mensagem interativa aceita pelo transporte sem id do provedor chegou ao
   WhatsApp, mas o runtime não criou o estado conversacional correspondente;
2. uma movimentação bancária classificada como transferência estava presente
   no snapshot do provedor, porém a allowlist do outbox alertava somente compra
   e estorno;
3. um marcador sintético de saldo de fatura em atraso foi classificado como
   compra positiva;
4. uma compra e um estorno relatados pelo usuário não estavam presentes no
   snapshot retornado pelo provedor nem após atualização dos Items.

Nenhuma escrita financeira ocorreu. Valores, descrições, telefones, tokens e
identificadores privados não fazem parte deste manifesto.

## Escopo do candidato

- tornar alertáveis compra, estorno, pagamento de fatura, transferência,
  entrada, saída bancária e tarifa/juros, preservando bloqueio para incerteza,
  parcela futura e marcador sintético de saldo;
- classificar marcador de saldo em atraso como `bill_balance`, sem proposta de
  compra;
- distinguir transporte resolvido sem id de falha ambígua: somente o primeiro
  pode vincular uma proposta ao telefone destinatário;
- persistir no estado auxiliar a referência exata e o principal destinatário;
- impedir uma segunda proposta interativa para o mesmo telefone durante o
  ciclo, sem bloquear mensagens somente leitura;
- aceitar `sim`, `não` ou `cancelar` apenas para a proposta exatamente vinculada
  àquele destinatário; uma resposta sem vínculo continua fail-closed;
- preservar `financial_writes=0`, write mode `off` e aprovação falsa.

## Evidência local

Bateria causal afetada:

```text
node --test tests/openFinanceLifecycle.test.js tests/openFinanceAlertOutbox.test.js tests/openFinanceWhatsappCanaryDelivery.test.js tests/openFinanceCanaryRuntime.test.js tests/openFinanceSaveProposalConversation.test.js tests/openFinanceFamilyAlerts.test.js tests/financialStateMachine.test.js
```

Resultado: `192/192`, zero falha.

O teste familiar combina uma entrega confirmada por id para um cônjuge e uma
entrega resolvida sem id para o outro. A resposta do segundo telefone toma a
revisão exata uma única vez; a tentativa posterior do primeiro não duplica o
efeito e permanece com zero escrita financeira.

A suíte temporal de 9P.4 revelou cinco fixtures vencidos em 31/07/2026. O prazo
comum de teste foi tornado futuro e estável, sem mudança no produto, e a suíte
passou `13/13`.

Suíte hermética final: `1.431` testes, `1.426` aprovados, zero falha e cinco
skips funcionais esperados. Cobertura: linhas `90,57%`, branches `72,93%` e
funções `90,12%`. `git diff --check`: verde.

## Limites explícitos

- O runtime não sintetiza eventos ausentes no provedor. A ausência relatada de
  compra/estorno exige observação posterior ou investigação junto ao provedor,
  não criação artificial de lançamento.
- Eventos já terminalizados como não alertáveis no outbox não são reenviados
  retroativamente; a ampliação vale para novas observações.
- Neste candidato, propostas proativas continuam restritas a compras
  reconciliadas. Entradas, transferências, saídas bancárias, pagamentos e
  tarifas passam a ser visíveis, mas seu salvamento exige gate próprio com
  semântica e writers adequados.
- Nenhuma flag, integração, dado real ou produção foi alterado.

## Estado

`CANDIDATO LOCAL; AGUARDANDO AUDITORIA INDEPENDENTE; NO-GO PARA DEPLOY`.

Após `GO TÉCNICO LOCAL`, o estado autorizado é release OCI por artefato
imutável, mantendo proposta `prompt`, escrita `off` e aprovação falsa, seguido
de health e observação de uma nova movimentação real. A etapa `confirm`
continua bloqueada.
