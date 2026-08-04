# Estado - RX historico segmentado Open Finance

Atualizado em: 2026-08-04

## Objetivo

Produzir um RX historico deterministico a partir do snapshot normalizado do
Pluggy, com inicio historico explicito, inventario familiar exato e zero escrita
financeira.

## Estado

`RX-HIST-TIME-INV-01 GO TECNICO LOCAL; PREVIEW PRIVADO READ-ONLY NAO AUTORIZADO`.

O `GO TECNICO LOCAL` anterior de `RX-HIST-SEG-01`, no hash
`62ec19532f1e4d288efa7c3fb75291540358fdd5`, continua valido para o contrato
antigo, mas foi superado para qualquer preview real. O usuario esclareceu duas
fronteiras temporais diferentes e o inventario familiar completo; o candidato
atual incorpora essas condicoes antes de abrir dados reais.

O primeiro candidato temporal/inventarial, no hash
`3103677231897f6a64b9bcd89c8cd2c16d2835e1`, recebeu `NO-GO` independente:
o arquivo esperado ainda podia descrever um inventario menor autoconsistente,
a CLI so confrontava forma/titularidade/contagem depois de abrir o vault e o
identificador publico ainda era o gate anterior. O recovery fixa o inventario
canonico no produto, valida inventario e aliases antes do snapshot/vault e usa
`RX-HIST-TIME-INV-01` em builder, stdout e erro da CLI.

O primeiro recovery, no hash
`5cee2aa4fcd0814d0f783f6680b035e8c8408bae`, recebeu novo `NO-GO`
exclusivamente probatorio. O auditor considerou a implementacao materialmente
fechada, mas exigiu JSON sintaticamente invalido, prova direta de zero chamadas
de snapshot/copia nas rejeicoes pre-vault e subprocesso real cobrindo o JSON de
erro em stderr. O recovery probatorio atual adiciona essas tres evidencias sem
alterar o contrato financeiro.

O recovery probatorio, no hash
`19c9df0c624c658860d9d4e39fceffa08b78deaf`, recebeu `GO TECNICO LOCAL`
independente. O auditor leu integralmente manifesto, builder, CLI e testes,
confirmou o fechamento das tres lacunas anteriores e nao identificou lacuna
causal indispensavel residual. O alcance continua estritamente local: nao
autoriza abrir dados privados, executar preview real, escrever, deployar ou
alterar producao.

## Contrato temporal

- inicio do RX historico: `2025-07-01`;
- corte de elegibilidade de novos alertas: `2026-07-28`;
- o corte de alertas pertence ao fluxo operacional de notificacao e nao entra
  na CLI nem no relatorio do RX;
- transacoes anteriores ao inicio historico nao participam da reconstrucao;
- nenhuma data ausente e inferida.

## Inventario familiar obrigatorio

| Fonte | Conta bancaria | Cartao | Escopo titular |
|---|---:|---:|---|
| Daniel Nubank | 1 | 1 | Daniel |
| Thais Nubank | 1 | 1 | Thais |
| Thais Itau | 1 | 1 | Thais |
| Cristina Nubank | 1 | 1 | Thais |

Total: quatro contas bancarias, quatro cartoes, dois segmentos de Daniel e seis
segmentos vinculados a Thais. A conta Itau de Thais existia em `2025-07-01`; o
cartao Itau de Thais nao existia nessa data. A data exata de criacao desse
cartao nao e inventada.

## Evidencia local atual

- o builder confronta o inventario recebido com o contrato familiar canonico;
- a CLI valida forma, quatro aliases, titularidade e contagens do arquivo antes
  de criar a copia ou abrir o vault;
- fonte ausente ou extra, tipo/quantidade divergente e titular incorreto falham
  fechado;
- lifecycle pode ser declarado por conta, sem aplicar a existencia da conta ao
  cartao do mesmo banco;
- teste focal: 15/15;
- bateria causal Open Finance: 340/340;
- suite hermetica final: 1.469 testes, 1.459 aprovados, 0 falhas e 10 skips
  conhecidos;
- cobertura: linhas 90,62%, branches 72,96%, funcoes 90,22%;
- nenhuma chamada Pluggy nova, dado real, planilha, deploy, OCI, WhatsApp ou
  escrita financeira.

## Invariantes

- conta bancaria e cartao nunca sao fundidos, mesmo quando pertencem ao mesmo
  banco ou pessoa;
- o escopo de Cristina permanece Thais; somente os dois segmentos Nubank de
  Daniel ficam no escopo Daniel;
- `account.balance` de cartao nao e rotulado como fatura;
- conta ou cartao inexistente no inicio historico fica `not_applicable`, nunca
  zero;
- parcelas usam numero e competencia fornecidos pelo provedor;
- IDs e descricoes de transacao nao aparecem no resumo;
- resultado declara `financial_writes=0`.

## Proxima acao

Com autorizacao especifica para acessar a copia privada, preparar e executar uma
unica previa read-only fora do repositorio. Antes dessa autorizacao, nao abrir o
backup nem consultar dados reais. Planilha, escrita financeira, deploy e
producao continuam fora do alcance.

## Capacidade

`Codex -> Sol -> Medio -> preparar a previa privada read-only, apos autorizacao.`
