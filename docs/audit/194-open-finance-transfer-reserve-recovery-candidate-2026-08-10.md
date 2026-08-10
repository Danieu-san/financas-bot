# Gate 37 - recovery da separacao entre principal e rendimento

Data: 2026-08-10

## Estado proposto

`RECOVERY LOCAL VERDE; AGUARDA REAUDITORIA INDEPENDENTE`.

O recovery permanece read-only, com `financial_writes=0`, sem deploy e sem
acesso a dados reais.

## Parecer anterior

O candidato `f94d8f9648514cad41757fa662698ffd4e3af31f` recebeu `NO-GO` por
um unico achado `HIGH`: a conversa separava aplicacao, resgate e rendimento,
mas `OpenFinanceProactiveReviewStore.decideByCode()` ainda aceitava a decisao
legada generica `reserve` para `review_kind='income'`.

Essa entrada direta podia reintroduzir no dominio terminal a mistura de
principal e ganho que o contrato do Gate 37 proibia.

## Recuperacao implementada

- `reserve` foi removido do conjunto aceito pelo store para revisao de entrada;
- continuam aceitos somente `reserve_redemption` e `investment_income` para
  credito, alem de entrada, transferencia e incerteza;
- a prova nova chama o store real com `reserve`, exige rejeicao e confirma que
  a revisao continua pendente;
- a prova terminal anterior passou a usar uma decisao tipada diferente para
  continuar verificando conflito depois da primeira decisao;
- nenhum caminho financeiro, de entrega ou de escrita foi alterado.

## Evidencia focal

- Gate 36 e Gate 37 combinados: `25/25`;
- rejeicao direta do valor generico no store real: verde;
- syntax check do store: verde.

## Evidencia hermetica final

- execucao unica posterior ao recovery: `1592` testes;
- aprovados: `1582`;
- falhas: `0`;
- skips esperados: `10`;
- cobertura: linhas `90.96%`, branches `73.7%`, funcoes `90.65%`;
- executor valido, local-only, com status de saida `0`.

As contagens sao evidencia local do Codex, nao execucao independente. A suite
ampla nao sera repetida sem mudanca causal posterior.

## Limites preservados

- o pareamento, outbox, runtime e politica familiar do candidato permanecem
  inalterados;
- Gate 34 segue pausado e Gate 35 em `PARTIAL_NO_GO`;
- escrita e segunda confirmacao continuam pertencendo ao Gate 38;
- nenhuma promocao ou producao foi autorizada por este recovery.
