# Gate ativo - Gate 40 compras de cartao em fatura aberta

Atualizado em: 2026-08-10

## Estado

`GO TECNICO LOCAL NO HASH 30e23da19db67af601ddec713876966899f3334f;
DEPLOY OCI PENDENTE`.

## Objetivo

Permitir que uma compra real e nao parcelada da fatura aberta gere proposta
numerada sem esperar o fechamento da fatura, preservando identidade,
reconciliacao, segundo consentimento e efeito unico quando o Pluggy promover o
mesmo lancamento de `PENDING` para `POSTED`.

## Commit de partida

`f0d94d1eff341335e1a2077396018ac6239f72c1`.

## Escopo

- interpretar `PENDING` de conta `CREDIT` como fatura aberta quando a
  classificacao real continua `purchase`;
- gerar proposta somente para compra positiva, reconciliada como `new` e sem
  parcelamento suportado;
- aceitar apenas a progressao monotona do mesmo lancamento de `PENDING` para
  `POSTED`;
- deduplicar o transporte da proposta entre os dois estados;
- corrigir a mensagem read-only para nao dizer que o banco ainda nao confirmou.

## Não escopo

- liberar parcela futura ou compra parcelada;
- aplicar a regra a conta bancaria, entrada, estorno ou transferencia;
- mudar regras de categoria, planilha, segundo consentimento ou escrita;
- fabricar transacao para smoke;
- deploy antes da auditoria independente.

## Invariantes

1. `PENDING` continua preservado como estado bruto do provedor.
2. Parcela futura ou serie parcelada nao recebe proposta por este gate.
3. Apenas conta `CREDIT` e classificacao `purchase` positiva sao elegiveis.
4. `POSTED -> PENDING`, mudanca de valor, conta, descricao, data ou identidade
   falham fechado.
5. `PENDING -> POSTED` do mesmo lancamento nao cria segunda proposta nem segunda
   mensagem.
6. A escrita continua exigindo revisao guiada, segundo consentimento,
   revalidacao final e reconciliacao `new`.

## Riscos

- confundir fatura aberta com autorizacao bancaria pendente;
- liberar parcela futura junto com compra corrente;
- duplicar a proposta na mudanca de estado do provedor;
- aceitar alteracao causal de fonte sob a aparencia de mudanca de status.

## Etapas

1. Confirmar a semantica oficial do Pluggy.
2. Produzir RED no runtime e na revalidacao final.
3. Centralizar elegibilidade e progressao monotona.
4. Validar store, outbox, entrega, fluxo numerico e finalizacao.
5. Executar uma unica suite hermetica ampla no candidato estavel.
6. Publicar commit sanitizado e obter auditoria independente por hash. Concluido
   no commit `421270f98a3a6c5eccee21af39557cfecabb04ac`, sem achados nem lacuna
   tecnica indispensavel.
7. Promover por artefato OCI e executar smoke real.
8. Preflight de release encontrou `ip-address@10.2.0` vulneravel; a correcao
   minima para `10.5.0` passou em instalacao limpa, audit high zerado, smoke da
   cadeia proxy/SOCKS e nova suite hermetica ampla `1632/1622/0/10`.
9. Reauditoria independente do hash `30e23da19db67af601ddec713876966899f3334f`
   confirmou o delta minimo, o fechamento dos tres avisos e preservou o GO
   tecnico local do Gate 40.

## Critérios de GO

- RED causal convertido em verde no caminho real;
- bateria afetada e suite hermetica ampla verdes;
- diff e workflow sem erro;
- commit imutavel publicado e auditoria independente sem lacuna indispensavel;
- deploy OCI, health e logs verdes antes do smoke financeiro real.

## Condições de parada

- qualquer parcelamento ou conta bancaria se tornar elegivel;
- regressao de identidade, deduplicacao, segundo consentimento ou efeito unico;
- auditoria independente emitir NO-GO ou acesso insuficiente;
- divergencia de hash, artefato, flags ou saude da OCI.

## Proxima acao

Construir e verificar o artefato imutavel do hash auditado, autenticar na OCI e
executar prepare, plan, promote e health conforme o runbook.

## Referencias

- `src/openFinance/openFinancePurchaseProposalEligibility.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/openFinance/openFinanceAlertOutbox.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `src/openFinance/openFinanceWhatsappCanaryDelivery.js`;
- `docs/audit/220-open-finance-open-invoice-purchase-candidate-2026-08-10.md`;
- `docs/audit/221-open-finance-open-invoice-purchase-independent-close-2026-08-10.md`;
- `docs/audit/222-gate40-ip-address-security-preflight-candidate-2026-08-10.md`;
- `docs/audit/223-gate40-ip-address-security-independent-close-2026-08-10.md`;
- documentacao oficial Pluggy: `https://docs.pluggy.ai/docs/transactions`;
- documentacao oficial Pluggy: `https://docs.pluggy.ai/docs/credit-card-installments`.
