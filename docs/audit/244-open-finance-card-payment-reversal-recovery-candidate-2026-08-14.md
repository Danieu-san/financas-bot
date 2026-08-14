# Gate 41.2 - recuperacao probatoria da devolucao de pagamento de fatura

Data: 2026-08-14

## Origem da recuperacao

A auditoria independente do hash
`f8b803079b84f4c470651539ed1a26ddd21e2301` confirmou o contrato defensivo da
implementacao, mas manteve `NO-GO` por uma lacuna probatoria MEDIA: faltavam
provas negativas para identidade de provedor repetida, devolucao ja presente
ou fortemente duplicada na planilha escopada e ambiguidade inversa entre uma
devolucao e mais de um pagamento original candidato.

## Controles adicionados

O teste do planejador real agora exige que:

1. duas ocorrencias com a mesma identidade estavel do provedor nao recebam o
   motivo `strong_linked_card_payment_reversal`;
2. uma devolucao ja existente em `Entradas` termine como `existing`, sem ser
   neutralizada novamente e sem `write_plan`;
3. dois pagamentos originais concorrentes tornem o pareamento bilateral
   ambiguo e mantenham a devolucao fechada, com `financial_writes=0`.

O terceiro controle exercita a fronteira causal completa: a unicidade mutua
falha primeiro no pareamento real de pagamento de fatura, portanto nenhum par
forte pode ser reutilizado para neutralizar a devolucao.

## Evidencia executada

- syntax check do teste alterado: verde;
- bateria causal focal: `68/68`, sem falhas ou skips;
- unica bateria historica ampla posterior a evidencia material nova:
  `143/143`, sem falhas ou skips;
- nenhuma mudanca de produto foi necessaria apos o primeiro parecer;
- nenhum dado privado ou artefato financeiro foi adicionado ao Git.

## Alcance

Este recovery acrescenta somente evidencia adversarial ao candidato anterior.
Permanece local e read-only, sem writer, importacao, planilha, recorrencia,
WhatsApp, deploy ou producao. O estado maximo antes da reauditoria por novo
hash e `candidato aguardando auditoria`.
