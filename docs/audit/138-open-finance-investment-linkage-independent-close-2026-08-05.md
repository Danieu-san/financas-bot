# 138 - RX historico: fechamento independente da ligacao por posicao

Data: 2026-08-05

## Hash auditado

`3369804a215de33a8146a53b794bc9f33b435b51`

## Parecer independente

O Chat confirmou a leitura integral do manifesto 137, do cliente Pluggy
read-only e da suite focal no mesmo hash imutavel. O veredito foi
`GO TECNICO LOCAL`.

Achados informados:

- critico: 0;
- alto: 0;
- medio: 0;
- baixo: 0;
- nenhuma lacuna indispensavel residual.

O auditor confirmou que o tripwire:

- instancia `PluggyReadOnlyClient` real;
- envolve a fronteira `fetchImpl`;
- observa exatamente `/investments/{id}/transactions`;
- fornece duas posicoes com limite igual a uma;
- exige `pluggy_investment_position_limit`;
- exige contador de requests igual a zero depois da rejeicao.

Assim, mover o gate para depois da primeira coleta tornaria o contador positivo
e faria o teste falhar, mesmo que a rejeicao final permanecesse.

## Confronto com evidencia local

O parecer e consistente com a revisao e a execucao local:

- teste focal final: 39/39;
- bateria causal Open Finance anterior ao recovery somente probatorio: 359/359;
- suite hermetica ampla do codigo de produto: 1.484 testes, 1.474 aprovados,
  zero falhas e 10 skips conhecidos;
- workflow e `git diff --check`: verdes;
- nenhuma rede real, dado privado, escrita financeira ou acao de producao.

## Estado autorizado

`RX-HIST-INVESTMENT-LINKAGE-01 GO TECNICO LOCAL`.

Este fechamento nao autoriza chamada Pluggy live, previa privada, salvamento,
planilha, deploy ou producao. Uma leitura live continua sendo uma acao
operacional separada e depende de autorizacao explicita.
