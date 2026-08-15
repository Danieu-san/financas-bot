# Gate ativo - Gate 42 recuperacao dos alertas proativos

Atualizado em: 2026-08-15

## Estado

`CANDIDATO TECNICO LOCAL; AGUARDANDO AUDITORIA INDEPENDENTE`.

## Objetivo

Impedir que replay temporal legitimo de proposta ou revisao nunca apresentada
derrube todo o ciclo Open Finance, sem aceitar mudanca causal ou consentimento
obsoleto.

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

## Proxima acao

Publicar o hash e obter auditoria independente. Deploy e smoke real dependem de
`GO` sem lacuna indispensavel.
