# Gate 35 - baseline prospectivo zero das Caixinhas

Data: 2026-08-09

## Declaracao e decisao

Daniel declarou que o saldo atual agregado das Caixinhas do Nubank Daniel e
zero. A declaracao vale como baseline prospectivo a partir de 2026-08-09.

Foi decidido nao reconstruir por inferencia o saldo das Caixinhas no inicio da
janela historica. Essa reconstrucao exigiria separar principal e rendimentos em
um periodo no qual o provedor informa zero linhas de historico ligadas as
posicoes.

## Alcance

- o baseline zero nao altera retroativamente o RX iniciado em 2025-07-01;
- o blocker `daniel_nubank:investment_history_unlinked` permanece como ressalva
  historica conhecida;
- aplicacao e resgate futuros de Caixinha serao transferencias patrimoniais;
- somente rendimento futuro comprovado sera ganho financeiro;
- nenhum saldo, lancamento ou planilha foi escrito nesta decisao;
- `financial_writes=0`.

## Proximo estado

A investigacao historica das Caixinhas esta encerrada por baixo valor marginal.
O Gate 35 permanece `PARTIAL_NO_GO` somente para completude historica e nao
bloqueia o Gate 36. O acompanhamento prospectivo das reservas pertence ao Gate
37, depois do tratamento de entradas e estornos.
