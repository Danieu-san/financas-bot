# Estado - RX historico segmentado Open Finance

Atualizado em: 2026-08-04

## Objetivo

Produzir um RX historico deterministico a partir do snapshot normalizado do
Pluggy, com inicio historico explicito, inventario familiar exato e zero escrita
financeira.

## Estado

`RX-HIST-TIME-INV-01 CONTRATO SUCESSOR CANDIDATO; AUDITORIA INDEPENDENTE PENDENTE`.

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

O preflight privado read-only autorizado em 2026-08-04 validou o checksum do
backup local e abriu somente uma copia extraida do vault. Antes de gerar o
relatorio, o inventario real falhou fechado: `thais_itau` possui uma conta
corrente, uma poupanca e um cartao, enquanto o contrato canonico auditado
admitia somente uma conta bancaria e um cartao nessa fonte. Nenhum relatorio
foi criado, nenhum ID, saldo ou transacao foi exposto e `financial_writes=0`.
O GO anterior continua valido para o contrato que auditou, mas esse contrato
foi factualmente superado para uso com a copia privada.

O candidato sucessor exige tambem o multiconjunto exato de subtipos: no Itau
da Thais, uma corrente, uma poupanca e um cartao. O preflight sanitizado mostrou
ainda que Caixinhas podem aparecer como posicoes de investimento e que apenas
parte de seus movimentos recebe `operation_type` financeiro do provedor. O RX
agora mantem posicoes separadas, resume somente movimentos rotulados pelo
provedor, nunca infere pela descricao e bloqueia reconciliacao enquanto o
historico da posicao nao estiver ligado.

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
| Thais Itau | 2 | 1 | Thais |
| Cristina Nubank | 1 | 1 | Thais |

O contrato auditado totalizava quatro contas bancarias e quatro cartoes; a
tabela acima registra o inventario sucessor exigido pelo preflight. No Itau da
Thais, conta corrente, poupanca e cartao sao segmentos distintos. A conta
corrente Itau existia em `2025-07-01`; o cartao Itau nao existia nessa data. O
inicio da poupanca ainda nao possui fonte confirmada e deve permanecer
desconhecido, nunca inferido nem zerado.

## Evidencia local atual

- o builder confronta o inventario recebido com o contrato familiar canonico;
- a CLI valida forma, quatro aliases, titularidade e contagens do arquivo antes
  de criar a copia ou abrir o vault;
- fonte ausente ou extra, tipo/quantidade divergente e titular incorreto falham
  fechado;
- lifecycle pode ser declarado por conta, sem aplicar a existencia da conta ao
  cartao do mesmo banco;
- teste focal: 15/15;
- bateria causal Open Finance: 337/337;
- suite hermetica final: 1.469 testes, 1.459 aprovados, 0 falhas e 10 skips
  conhecidos;
- cobertura: linhas 90,62%, branches 72,97%, funcoes 90,23%;
- nenhuma chamada Pluggy live; a copia privada foi usada somente no preflight
  sanitizado, sem imprimir IDs, saldos ou transacoes;
- nenhuma planilha, deploy, OCI, WhatsApp ou escrita financeira.

## Invariantes

- conta bancaria e cartao nunca sao fundidos, mesmo quando pertencem ao mesmo
  banco ou pessoa;
- conta corrente, poupanca e cartao Itau sao segmentos distintos;
- o escopo de Cristina permanece Thais; dois segmentos ficam no escopo Daniel
  e sete no escopo Thais;
- `account.balance` de cartao nao e rotulado como fatura;
- conta ou cartao inexistente no inicio historico fica `not_applicable`, nunca
  zero;
- parcelas usam numero e competencia fornecidos pelo provedor;
- Caixinhas/investimentos ficam fora das contas bancarias e nao sao somados a
  elas; somente `operation_type` do provedor pode marcar movimento relacionado;
- descricao nunca vira evidencia de aplicacao ou resgate;
- posicao sem historico ligado gera `investment_history_unlinked`;
- IDs e descricoes de transacao nao aparecem no resumo;
- resultado declara `financial_writes=0`.

## Proxima acao

Publicar o candidato sucessor e obter auditoria independente por hash imutavel.
Somente depois de `GO TECNICO LOCAL` reexecutar uma unica previa read-only na
copia privada. Planilha, escrita financeira, deploy e producao continuam fora
do alcance.

## Capacidade

`Codex -> Sol -> Alto -> publicar e auditar o contrato sucessor.`
