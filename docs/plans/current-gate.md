# Gate ativo - Gate 42 recuperacao dos alertas proativos

Atualizado em: 2026-08-15

## Estado

`CANDIDATO CORRIGIDO; AGUARDANDO REAUDITORIA INDEPENDENTE`.

## Objetivo

Impedir que replay temporal legitimo de proposta ou revisao nunca apresentada
derrube todo o ciclo Open Finance, sem aceitar mudanca causal ou consentimento
obsoleto.

## Escopo

- refresh exclusivo de `source.date` antes de qualquer transporte;
- replay duravel de revisoes proativas sem renovar retencao;
- lista fechada de codigos seguros no `reason` do log `NO_GO`;
- testes e evidencia de recuperacao sem escrita financeira.

## Não escopo

- habilitar writer financeiro ou consentir lancamentos;
- alterar elegibilidade de transacoes;
- corrigir dashboard, check diario ou limite mensal;
- reconstruir o RX historico.

## Invariantes

1. Proposta com qualquer evidencia de transporte nao pode mudar.
2. Apenas `source.date` pode ser corrigida antes do transporte, mantendo todos
   os outros campos e o mesmo estado elegivel do provedor.
3. Revisao duravel conserva criacao e expiracao originais em todo replay.
4. Erro externo ou texto livre nao aparece no log.
5. Nenhum caminho deste gate cria escrita financeira.

## Evidencia

- clone real OCI: `GO`, `refreshed=8`, `pending=76`, duas entregas simuladas e
  `financial_writes=0`;
- focal `43/43`;
- causal `402/402`;
- ampla `1723` total, `1713` pass, `0` fail, `10` skip.

## Critérios de GO

1. Auditor independente confirma a fronteira exclusiva de data e transporte.
2. Auditor confirma que apenas os dois codigos fechados podem aparecer em
   `reason` e que texto livre vira `unknown`.
3. Deploy por artefato preserva estado e processo unico.
4. Primeiro ciclo OCI conclui `GO`, entrega um unico lote familiar e mantem
   `financial_writes=0` antes do consentimento normal.

## Condições de parada

- `NO-GO` independente ou lacuna indispensavel;
- divergencia de codigo depois do hash auditado;
- checksum, health, processo, sessao WhatsApp ou estado OCI divergente;
- qualquer indicio de escrita financeira automatica.

## Proxima acao

Publicar o novo hash e obter reauditoria independente. Deploy e smoke real
dependem de `GO` sem lacuna indispensavel.
