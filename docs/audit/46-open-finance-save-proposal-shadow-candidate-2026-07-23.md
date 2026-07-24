# 9P.0 — candidato de propostas Open Finance em shadow

Atualizado em: 2026-07-23

Base imutável:
`f8d124f785f89479642fbf4847a9f4c3860a268d`.

## Objetivo

Criar a fundação durável da proposta proativa de salvamento sem expor pergunta,
comando ou escrita. O modo permanece `off` por padrão e aceita somente `shadow`
nesta fatia.

## Desenho implementado

- propostas ficam em tabela própria dentro do preview SQLite privado já incluído
  no backup/restore v3;
- somente decisão reconciliada `new`, classificação `purchase` e estado
  `POSTED` é elegível;
- alias, geração e observação produzem referência e operation key estáveis;
- payload privado usa AES-256-GCM com AAD e não aparece em listagens públicas;
- leitura e cancelamento local exigem um WhatsApp da allowlist familiar;
- replay não duplica, não reabre cancelamento e não estende a expiração;
- retenção e revogação removem também as propostas;
- runtime shadow exige reconciliação e preview em canary antes do polling;
- mensagem WhatsApp, outbox e política de escrita não foram promovidos.

Estornos, eventos pendentes, ambiguidades, duplicidades e fonte incompleta
continuam fora da proposta e falham fechados.

## Evidência executada

- RED causal: `0/3`;
- prova causal: `4/4`;
- Open Finance diretamente afetado: `42/42`;
- gate exaustivo local: `1.270` testes, `1.265` aprovados, zero falhas, cinco
  skips previstos e zero TODO;
- cobertura: linhas `89,96%`, branches `72,01%`, funções `89,73%`;
- sintaxe, diff e workflow: verdes.

O runner exaustivo bloqueou rede e subprocessos não permitidos. Não houve
produção, deploy, polling real, Google, WhatsApp ou Pluggy reais.

## Arquivos do produto e prova

- `.env.example`;
- `src/openFinance/openFinanceCanaryRuntime.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `tests/openFinanceSaveProposalShadow.test.js`;
- `docs/agent-memory/current.md`;
- `docs/agent-memory/known-issues.md`;
- `docs/plans/current-gate.md`;
- este documento.

## Travas preservadas

- `OPEN_FINANCE_WRITE_MODE=off`;
- `OPEN_FINANCE_SAVE_PROPOSAL_MODE=canary` rejeitado;
- nenhuma pergunta “quer salvar?”;
- nenhuma leitura/revisão remota do store;
- nenhuma proposta de estorno;
- nenhum dado privado em log ou evidência.

## Pedido de auditoria

Confirmar o hash e a base; revisar apenas os oito arquivos acima; confrontar o
contrato com a prova relatada; classificar achados por severidade e emitir
`GO TÉCNICO LOCAL` ou `NO-GO`. O parecer é estático e não autoriza deploy.
