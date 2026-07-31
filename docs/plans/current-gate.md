# Gate ativo - OF-FAMILY-01 alertas familiares proativos

Atualizado em: 2026-07-30

Base:
`bb6b102a56fb23fed154017a359a9953d5627285`.

## Estado

`EM DIAGNÓSTICO LOCAL`.

## Objetivo

Entregar a Daniel e Thaís os alertas de novas movimentações Open Finance
elegíveis do casal, somente quando a movimentação ainda não estiver
representada na planilha, com proposta proativa de classificação e salvamento.

## Escopo

- resolução explícita dos dois destinatários familiares autorizados;
- reconciliação fail-closed contra o ledger/planilha antes da entrega;
- uma mensagem por destinatário e movimentação elegível;
- proposta de salvamento com referência estável e classificação sugerida;
- confirmação posterior sem gravação automática;
- retry/outbox sem duplicar alerta ou efeito financeiro.

## Não escopo

- correção dos números e fontes do dashboard;
- substituição da fatura corrente por limite usado;
- ativação global, mensagem real, restart ou deploy OCI;
- expansão para pessoas fora do casal autorizado.

## Invariantes

1. Acesso familiar deriva do vínculo autorizado, nunca do nome do cartão.
2. Ausência ou falha da fonte de reconciliação não vira “não cadastrado”.
3. Item já representado na planilha não gera alerta.
4. Nenhum alerta grava lançamento automaticamente.
5. Reenvio, retry ou duas rotas de descoberta não duplicam alerta nem proposta.
6. Referências, logs e mensagens não expõem IDs internos ou segredos.

## Etapas

1. [pendente] Mapear descoberta, reconciliação, outbox, entrega e confirmação.
2. [pendente] Fixar contrato RED para dois destinatários e item já cadastrado.
3. [pendente] Implementar fanout e proposta mínima fail-closed.
4. [pendente] Executar testes focais, afetados e workflow.
5. [pendente] Publicar candidato sanitizado e auditar no Chat.

## Critérios de GO

- Daniel e Thaís recebem cada item familiar novo exatamente uma vez;
- item já cadastrado não é entregue;
- fonte indisponível não produz falso alerta;
- mensagem oferece proposta de salvamento e confirmação explícita;
- confirmação de um destinatário não permite duplicação pelo outro;
- nenhuma escrita ocorre antes da confirmação válida;
- auditoria independente sem lacuna indispensável.

## Condições de parada

- necessidade de ler ou alterar planilha real para provar o contrato local;
- ambiguidade sobre vínculo familiar ou escopo da planilha;
- regressão de privacidade, deduplicação ou idempotência financeira;
- `NO-GO` independente.

## Próxima ação exata

Mapear no código a origem das transações, a reconciliação com a planilha, o
outbox, o roteamento atual por proprietário e a confirmação `salvar`.

## Capacidade

`Codex -> Sol -> Alto -> implementar e auditar o gate OF-FAMILY-01.`
