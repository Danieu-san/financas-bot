# Gate ativo - Gate 43 recuperacao de conversa Open Finance orfa

Atualizado em: 2026-08-15

## Estado

`CANDIDATO TECNICO LOCAL; AUDITORIA INDEPENDENTE PENDENTE`.

## Objetivo

Remover somente estado conversacional Open Finance sem respaldo duravel vivo,
para que os dois principals voltem a receber o lote numerado.

## Escopo

- confronto entre estado, revisoes ativas/prontas e confirmacoes prontas;
- limpeza duravel somente de estado Open Finance orfao;
- metrica sanitizada de estados recuperados;
- testes de preservacao das fronteiras vivas e alheias.

## Não escopo

- reabrir ou reenviar transportes historicos;
- alterar elegibilidade, reconciliacao ou classificacao de transacoes;
- corrigir dashboard, check diario ou limite mensal;
- reconstruir o RX historico.

## Invariantes

1. Conversa alheia ao Open Finance nunca e removida.
2. Revisao ativa, revisao pronta valida ou confirmacao pronta nunca e removida.
3. Transporte historico nunca e reaberto ou reenviado por esta correcao.
4. Apenas contagem sanitizada aparece no log.
5. Nenhum caminho deste gate cria escrita financeira.

## Evidencia

- producao: dois estados de selecao vivos, zero revisoes ativas e zero
  confirmacoes prontas;
- focal `17/17`;
- bateria diretamente afetada `31/31`;
- ampla `1725` total, `1715` pass, `0` fail, `10` skip.

## Critérios de GO

1. Auditor independente confirma que somente estado Open Finance orfao e limpo.
2. Auditor confirma preservacao de revisoes, confirmacoes e conversas alheias.
3. Deploy por artefato preserva estado e processo unico.
4. Primeiro ciclo OCI registra `recovered_states=2`, entrega um unico lote por
   principal e mantem `financial_writes=0`.

## Condições de parada

- `NO-GO` independente ou lacuna indispensavel;
- divergencia de codigo depois do hash auditado;
- checksum, health, processo, sessao WhatsApp ou estado OCI divergente;
- qualquer indicio de escrita financeira automatica.

## Proxima acao

Publicar o commit sanitizado, obter auditoria independente e, com `GO`, promover
o artefato auditado na OCI e validar a autocura/lote numerado.
