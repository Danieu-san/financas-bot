# Estado - RX historico segmentado Open Finance

Atualizado em: 2026-08-04

## Objetivo

Produzir um RX historico deterministico a partir do snapshot normalizado do
Pluggy, com inicio historico explicito, inventario familiar exato e zero escrita
financeira.

## Estado

`RX-HIST-RESERVE-LIFECYCLE-01 CANDIDATO EM VALIDACAO LOCAL`.

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

O candidato sucessor, no hash
`7a4540b4df7efe01b91720007671953832182d64`, recebeu `NO-GO` independente
por uma unica lacuna: o filtro de `operation_type` por substring aceitava o
falso positivo `NAO_APLICAVEL`. O recovery ancora rotulos financeiros
positivos e adiciona esse valor como caso adversarial, sem alterar inventario,
lifecycle, segmentacao ou bloqueadores.

O recovery, no hash
`bce32c50de6026fc81a3a310577ec70f401423e0`, recebeu `GO TECNICO LOCAL`
independente. O auditor confirmou a leitura integral do manifesto, produto e
testes, o fechamento do falso positivo, a preservacao dos rotulos validos e a
ausencia de regressao causal ou lacuna indispensavel residual. Fica autorizada
somente uma previa read-only na copia privada.

A previa autorizada terminou em `NO_GO` antes de criar relatorio, devido a uma
colisao de identidade de parcela. A copia SQLite permaneceu byte a byte
inalterada. O diagnostico sanitizado provou que duas linhas sem identificador
forte compartilham parcela e metadados, mas possuem datas distintas; portanto
nao e seguro deduplicar nem considera-las compras distintas. O recovery atual
preserva as linhas como observadas, marca a serie e os totais como ambiguos,
nao infere parcelas ausentes e bloqueia reconciliacao.

O candidato no hash
`22a97729df02d123ec7d754f97b86bd2439f099d` recebeu `GO TECNICO LOCAL`
independente sem lacuna substantiva residual. A autorizacao operacional da
ultima linha permaneceu limitada apenas porque o estado do manifesto ainda
dizia, incorretamente, que a suite final estava pendente, apesar de a evidencia
verde ja constar no mesmo arquivo. O recovery atual e exclusivamente
documental; nao altera codigo, testes ou evidencias.

O fechamento documental no hash
`6042cfcd012e5a6010428aed8e026c63493e2d0f` foi confirmado
independentemente e autorizou uma unica nova previa. A execucao concluiu com
relatorio agregado e `NO_GO` controlado: inventario 5+4 validado, SQLite
inalterado e zero escrita. Permanecem tres blockers: identidade ambigua de
parcela, historico de investimento sem ligacao a posicao e inicio desconhecido
da poupanca Itau. Nenhum dado financeiro privado foi levado ao Git.

O usuario confirmou depois que todas as contas bancarias, inclusive a poupanca
Itau, ja existiam em `2025-07-01`; somente o cartao Itau surgiu durante o RX.
Assim, o inicio da poupanca deixa de ser blocker, sem inventar sua data de
abertura. O candidato atual trata aplicacao em Caixinha e resgate como
transferencias patrimoniais internas: continuam nos movimentos brutos usados
para saldo, mas nao viram receita ou despesa. Rendimento permanece ganho;
rotulo generico ou direcao incompatível falham fechado. Serie de parcela
ambigua fica bloqueada para salvamento ate resolver sua identidade.

O primeiro candidato de reserva/lifecycle, no hash
`457f31b588b10ca0d9fe48e9fa7397ec3a2b0e12`, recebeu `NO-GO` independente
por uma unica divergencia probatoria: builder e CLI ainda publicavam o gate
anterior, e os testes comparavam as saidas apenas com a mesma constante
importada. O recovery muda o literal runtime para
`RX-HIST-RESERVE-LIFECYCLE-01` e confronta builder, stderr e stdout/relatorio
com literais independentes, sem alterar o contrato financeiro.

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
Thais, conta corrente, poupanca e cartao sao segmentos distintos. Todas as
contas bancarias da tabela existiam em `2025-07-01`, conforme declaracao do
usuario. O cartao Itau nao existia nessa data e passa a integrar o RX somente
quando observado/disponivel, sem herdar o lifecycle da conta.

## Evidencia local atual

- o builder confronta o inventario recebido com o contrato familiar canonico;
- a CLI valida forma, quatro aliases, titularidade e contagens do arquivo antes
  de criar a copia ou abrir o vault;
- fonte ausente ou extra, tipo/quantidade divergente e titular incorreto falham
  fechado;
- lifecycle pode ser declarado por conta, sem aplicar a existencia da conta ao
  cartao do mesmo banco;
- teste focal do candidato atual: 21/21;
- bateria causal Open Finance do candidato atual: 343/343;
- suite hermetica final do candidato atual: 1.475 testes, 1.465 aprovados,
  0 falhas e 10 skips conhecidos;
- cobertura do recovery: linhas 90,65%, branches 73,10%, funcoes 90,28%;
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
- aplicacao e resgate de reserva sao transferencias patrimoniais internas, nao
  receita nem despesa; rendimento continua ganho;
- semantica de investimento generica ou incompatível falha fechado;
- posicao sem historico ligado gera `investment_history_unlinked`;
- parcela ambigua nao e elegivel a salvamento antes da resolucao de identidade;
- IDs e descricoes de transacao nao aparecem no resumo;
- resultado declara `financial_writes=0`.

## Proxima acao

Concluir bateria causal, uma unica suite ampla, publicar o candidato e obter
auditoria independente. Somente depois de GO, reexecutar a previa privada com
a poupanca marcada como existente no inicio e sem inventar a data exata do
cartao Itau. Planilha, escrita financeira, deploy e producao continuam fora do
alcance.

## Capacidade

`Codex -> Sol -> Medio -> validar e auditar o candidato de reserva e lifecycle.`
