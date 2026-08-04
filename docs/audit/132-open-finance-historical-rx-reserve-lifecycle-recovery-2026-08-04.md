# 132 - Recovery do identificador do RX de reserva/lifecycle

Data: 2026-08-04

## Origem

O commit `457f31b588b10ca0d9fe48e9fa7397ec3a2b0e12` recebeu `NO-GO`
independente porque a implementacao funcional do candidato estava presente,
mas builder e CLI ainda publicavam `RX-HIST-TIME-INV-01`. Os testes comparavam
essas saidas com a constante importada e, por isso, nao provavam o nome do gate.

## Recovery

- a constante runtime passa a ser `RX-HIST-RESERVE-LIFECYCLE-01`;
- o teste do builder confronta a saida com o literal independente;
- o subprocesso de erro confronta o JSON de stderr com o mesmo literal;
- o subprocesso verde confronta stdout e relatorio gravado com o literal;
- nenhuma semantica financeira, lifecycle, inventario ou permissao muda.

## Evidencia local

- teste focal: 21/21;
- bateria causal Open Finance: 343/343;
- suite hermetica ampla final: 1.475 testes, 1.465 aprovados, 0 falhas e
  10 skips conhecidos; cobertura 90,65% linhas, 73,10% branches e 90,28% funcoes;
- auditoria independente do recovery: pendente.

## Alcance

Este recovery continua local e read-only. Nao autoriza previa privada,
salvamento, planilha, deploy, OCI, WhatsApp ou producao.
