# RX-HIST-AMBIGUITY-RECONCILE-01 - recovery de identidade integral do RX

Data: 2026-08-05

Commit anterior auditado: `e552d84cac049d7878c6d2f6bcc55b86d90e2404`

## Motivo do recovery

A auditoria independente retornou `NO-GO` por duas causas. A decisao estava
vinculada ao escopo familiar e ao conjunto ambiguo, mas nao a uma identidade
integral dos dados fonte e do RX. Alem disso, a prova de restart comparava o
snapshot reaberto, mas nao reconciliava novamente esse snapshot nem preservava
um blocker nao relacionado.

## Fechamento

- o review calcula `rx_ref` como HMAC de uma serializacao canonica, recursiva e
  ordenada dos itens normalizados completos e do RX read-only;
- `review_ref` incorpora `familyScope`, `rx_ref` e todos os `item_ref`;
- o `rx_ref` fica dentro do envelope autenticado e volta no snapshot privado;
- o plano recalcula e exige os mesmos `rx_ref` e `review_ref` antes de aceitar
  qualquer decisao;
- qualquer mudanca em dado ambiguo ou nao ambiguo, inclusive uma mudanca de
  identidade que preserve o relatorio agregado, invalida o snapshot antigo;
- a reabertura real do SQLite agora e seguida por nova reconciliacao, comparada
  integralmente com o resultado anterior ao restart;
- um blocker externo de cobertura de fatura permanece depois que somente as
  ambiguidades de parcela e investimento sao resolvidas;
- `financial_writes=0`, ausencia de proposta e ausencia de autorizacao de
  salvamento permanecem invariantes.

## Evidencia causal

- review, reconciliador, runtime WhatsApp e RX: 54/54;
- snapshot parcial, decisao adulterada, candidate ID trocado, dado nao ambiguo
  alterado com RX agregado igual e dado nao ambiguo com novo RX falham fechado;
- replay antes e depois de reabrir o store SQLite produz relatorio identico e
  preserva `thais_nubank:bills_partial`;
- suite hermetica ampla unica do recovery: 1.519 testes, 1.509 aprovados, zero
  falhas e 10 skips conhecidos;
- cobertura: linhas 90,77%, branches 73,40%, funcoes 90,43%;
- syntax checks e `git diff --check` verdes.

## Alcance

O recovery fecha somente as duas causas do `NO-GO` no gate read-only. Nao ativa
`prompt`, nao cria proposta, nao salva, nao chama Pluggy real e nao toca
planilha, deploy ou producao. O estado maximo permanece `candidato aguardando
reauditoria independente`.
