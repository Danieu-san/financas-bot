# Estado - RX historico segmentado Open Finance

Atualizado em: 2026-08-05

## Objetivo

Provar a prontidao de release do fluxo numerico usando somente fixtures ou uma
copia consistente do estado vigente, sem alterar flags, producao ou dados reais.

## Estado

`GATES 31, 32 E 33 COM GO TECNICO LOCAL INDEPENDENTE; GATE 34 ESPECIFICADO;
WRITES OFF; SEM DEPLOY AUTORIZADO`.

O nucleo local da revisao numerada foi encerrado no commit auditado
`987404c37a5839058be5010d2a036f963819a511`. O parecer independente confirmou
zero achados dentro do alcance: consistencia bidirecional com o RX, pagina e
selecao isoladas por telefone, estado familiar cifrado/reiniciavel e protecao
contra substituicao isolada por envelope anterior. O registro de fechamento e
`docs/audit/142-open-finance-historical-ambiguity-numbered-review-independent-close-2026-08-05.md`.
Esse GO nao cobre entrada/entrega WhatsApp, consumo posterior das decisoes,
salvamento, deploy ou producao.

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

O recovery no hash `95b56590f516e4df34ae9293b9a482c12394cc44`
recebeu `GO TECNICO LOCAL` independente. O auditor confirmou o identificador
em builder, stderr real, stdout e relatorio, bem como a remocao do oraculo
tautologico, sem lacuna indispensavel residual. O alcance nao autoriza
producao, deploy ou escrita; a proxima previa privada permanece somente leitura
e depende da autorizacao operacional ja registrada.

A previa privada read-only posterior ao GO criou relatorio agregado com o gate
novo, nove segmentos e `financial_writes=0`; todos os cinco arquivos privados
permaneceram byte a byte inalterados. O blocker de inicio desconhecido da
poupanca Itau desapareceu e nao houve atividade anterior ao lifecycle
declarado. O resultado continua `NO_GO` por tres blockers: serie de parcela
ambigua, historico de investimento sem ligacao a posicao e semantica ambigua de
movimentos de investimento. A ultima decorre de 22 movimentos Daniel Nubank
rotulados `RESGATE_APLIC_FINANCEIRA` cuja direcao nao corresponde a regra
assumida; valores, datas, IDs e descricoes permaneceram fora do Git.

A documentacao primaria do Pluggy confirmou que `type=CREDIT` significa entrada
e `type=DEBIT` significa saida. A inspecao privada agregada encontrou 54
resgates Daniel Nubank `CREDIT/positivo`, 22 resgates `DEBIT/negativo` e 39
rendimentos Thais Itau `CREDIT/positivo`. Portanto, as 22 linhas sao
contraditorias com o rotulo do provedor e devem continuar ambiguas; nao ha
correcao de sinal a aplicar. A API possui o endpoint por posicao
`/investments/{id}/transactions`, com tipos como `BUY`, `SELL`, `TRANSFER` e
`INTEREST`, mas o cliente atual coleta somente a lista de posicoes e a cobertura
publica nao garante transacoes de investimento Nubank.

Em 2026-08-04, a implementacao de coleta por posicao foi iniciada a partir do
HEAD `88f0d494286e19bdb9468ce1359c0bee2e1736d5` e pausada a pedido do usuario
antes de alterar produto. Foram adicionados somente testes RED em
`tests/openFinancePluggyReadOnly.test.js` e
`tests/openFinanceHistoricalRx.test.js`. A bateria focal conjunta terminou com
35 testes, 25 aprovados e 10 falhas esperadas, provando que o produto ainda nao:

- coleta ou pagina `/investments/{id}/transactions`;
- distingue disponibilidade dessa fonte de uma lista vazia;
- normaliza o historico minimo por posicao sem descricao privada;
- propaga a nova evidencia cifrada pelo vault;
- publica no RX o resumo ligado a posicao.

Decisao de desenho ja tomada: o endpoint por posicao nao autoriza casar uma
linha bancaria com uma posicao apenas por data ou valor. Logo, o novo historico
pode fechar somente `investment_history_unlinked`; as 22 linhas bancarias com
rotulo de resgate e direcao contraditoria continuam em
`investment_movement_semantics_ambiguous`. Erros diferentes de 403/404 devem
abortar o snapshot inteiro; 403/404 viram `unavailable`, nunca zero. O vault
ja cifra o item normalizado inteiro, portanto a propagacao pode ser provada por
round-trip sem migracao de schema SQLite.

O candidato local fechou as 10 falhas RED e acrescentou cobertura adversarial
para estado misto, limite de paginacao, campos obrigatorios, gate runtime
independente e round-trip cifrado positivo. O cliente consulta somente GET,
limita posicoes e paginas, converte 403/404 em indisponibilidade explicita e
aborta o snapshot em qualquer outro erro. O contrato v2 descarta descricao e
mantem apenas tipo, valores e datas; o RX agrega por posicao e nunca cruza essa
fonte com uma linha bancaria por heuristica. A bateria causal terminou 356/356
e a suite ampla final substitutiva terminou com 1.481 testes, 1.471 aprovados,
zero falhas e 10 skips conhecidos. A primeira ampla verde foi superada quando
a revisao adversarial fechou o caso `quantity=null`; depois dessa mudanca houve
 novo focal e uma unica ampla final. Nao houve chamada Pluggy live nem acesso a
dados privados.

O candidato publicado no hash
`facee30b9725e4322b5cd5117c5499408c9f1910` recebeu `NO-GO`
independente. A revisao encontrou uma falha real: `totalPages=0` com resultados
ou `totalPages` inferior a pagina corrente podiam encerrar a coleta como
valida. Tambem pediu provas diretas para 403/404 em pagina posterior, 200 vazio,
limite de posicoes e os seis campos obrigatorios. O recovery rejeita os
metadados contraditorios e cobre todas essas bordas. A hipotese de mistura apos
403/404 nao se reproduziu: o cliente ja descartava todas as linhas daquela
posicao; a nova prova torna esse comportamento causalmente explicito.

O recovery publicado no hash
`260ff76986fc98682317c1570a3dc760e870045f` recebeu novo `NO-GO`
exclusivamente probatorio. O auditor confirmou todas as propriedades
funcionais e nao encontrou defeito critico ou alto, mas observou que o teste do
limite de posicoes exigia apenas a rejeicao final. O recovery probatorio atual
instala um tripwire na fronteira HTTP e exige zero chamadas ao historico por
posicao quando o limite e excedido. Nenhum codigo de produto foi alterado e,
por isso, a suite ampla verde anterior nao foi repetida.

O recovery probatorio no hash
`3369804a215de33a8146a53b794bc9f33b435b51` recebeu `GO TECNICO LOCAL`
independente. O auditor confirmou que o tripwire usa o cliente real, observa a
fronteira HTTP exata, exige a rejeicao especifica e prova zero requests ao
historico antes do gate. Todas as severidades ficaram zeradas e nao ha lacuna
indispensavel residual. O fechamento nao autoriza chamada Pluggy live, previa
privada, salvamento, planilha, deploy ou producao.

A unica leitura Pluggy live autorizada terminou em `GO` sem persistir payload,
atualizar Item ou escrever dados. A fonte relevante apresentou historico por
posicao disponivel e suficiente para uma previa privada; as contagens e o
detalhamento financeiro ficaram somente em checkpoint local ignorado pelo Git.
Uma coincidencia de cardinalidade observada e apenas pista: nao cria identidade
e nao autoriza pareamento ou reclassificacao. PM2 permaneceu unico, online, sem
reinicios e com health/WhatsApp verdes.

A previa privada cifrada posterior ligou todas as posicoes observadas e fechou
`investment_history_unlinked`. O primeiro calculo reutilizou um lifecycle
privado obsoleto e falhou fechado; o recálculo no mesmo cofre aplicou a
declaracao ja confirmada do usuario — contas bancarias Itau existentes no
inicio e cartao posterior — e removeu `account_start_unknown` sem nova chamada
Pluggy. O resultado final permanece `NO_GO` somente pelas classes
`installment_series_ambiguous` e
`investment_movement_semantics_ambiguous`; a associacao de cada blocker a uma
fonte fica exclusivamente no relatorio privado. O cofre temporario foi
removido, o relatorio ficou fora do Git e `financial_writes=0`.

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
- teste focal do recovery atual: 39/39;
- bateria causal Open Finance do recovery atual: 359/359;
- suite hermetica final do recovery atual: 1.484 testes, 1.474 aprovados,
  0 falhas e 10 skips conhecidos;
- cobertura do recovery: linhas 90,67%, branches 73,26%, funcoes 90,32%;
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

O primeiro candidato do gate 31, no hash
`e552d84cac049d7878c6d2f6bcc55b86d90e2404`, recebeu `NO-GO`
independente. O auditor identificou que o snapshot nao estava preso a um digest
integral do RX e que a prova de restart nao reconciliava novamente o snapshot
reaberto nem preservava blocker externo.

O recovery calcula um `rx_ref` HMAC canonico dos itens fonte completos e do RX,
incorpora-o ao `review_ref` e exige ambos na aplicacao. A prova altera dado nao
ambiguo mantendo as mesmas ambiguidades — inclusive com o agregado inalterado —
e exige rejeicao. Depois de reabrir o SQLite, executa novamente o reconciliador,
compara o relatorio integral e preserva um blocker de fatura nao relacionado.
A bateria causal passou 54/54 e a suite hermetica passou 1.509 de 1.519 testes,
zero falhas e 10 skips conhecidos. Manifesto:
`docs/audit/148-open-finance-historical-ambiguity-rx-identity-recovery-candidate-2026-08-05.md`.

O hash `23007057ae04862d2319b93fa230312de723f1c2` recebeu `GO TECNICO
LOCAL` independente. O auditor confirmou o fechamento integral das duas causas,
sem achado remanescente ou lacuna indispensavel no alcance read-only. Registro:
`docs/audit/149-open-finance-historical-ambiguity-reconciliation-independent-close-2026-08-05.md`.

O gate 32 implementa o fluxo numerico de salvamento sem misturar o RX historico
iniciado em 2025-07-01 com o corte operacional de alertas em 2026-07-28. Um
destinatario recebe ate quatro compras elegiveis numa mensagem e pode responder
`salvar 1`, `salvar 1 e 3` ou `salvar todas`; uma proposta isolada preserva
`sim`. A selecao reserva o item para o primeiro conjuge e cria somente uma fila
de revisoes individuais. Transporte, reserva e replay foram provados atomicos e
fail-closed, inclusive apos reabertura e falha ambigua, sempre com
`financial_writes=0`.

A bateria causal passou 214/214. A suite hermetica ampla final executou 1.530
testes, aprovou 1.520, falhou zero e manteve 10 skips conhecidos; cobertura de
linhas 90,75%, branches 73,39% e funcoes 90,51%. Manifesto:
`docs/audit/150-open-finance-numeric-save-flow-candidate-2026-08-05.md`.

O estado maximo e candidato local aguardando auditoria independente por hash
imutavel. Nao ativar flags, nao fazer deploy e nao usar producao neste gate.

O hash `a10931d8f8cdb2291ffe0b39927778cb71a9f46d` recebeu `NO-GO`
independente. Transporte atomico, selecao familiar e revisoes individuais
foram confirmados, mas a fila auxiliar podia ficar apenas em memoria entre a
remocao do estado corrente e a abertura do proximo item. Uma queda antes do
flush periodico deixaria propostas reservadas sem retomada publica.

O recovery remove essa janela: o runtime e o handler usam transicoes duraveis
do state store cifrado, e o handler persiste
`awaiting_open_finance_save_batch_continue` antes de tentar o proximo item. A
prova publica injeta falha de catalogo, elimina o estado residente, reabre o
snapshot do disco e retoma exatamente a segunda revisao com `continuar`.
Tambem ficou explicito o rollback integral de leases adulterados nos caminhos
`accepted_unconfirmed` e `release`. Focal 12/12 e bateria causal 171/171.
Suite hermetica ampla final: 1.530 testes, 1.520 aprovados, zero falhas e 10
skips conhecidos; cobertura de linhas 90,78%, branches 73,45% e funcoes
90,52%.
Manifesto:
`docs/audit/151-open-finance-numeric-save-flow-durable-queue-recovery-candidate-2026-08-05.md`.

O recovery foi publicado no hash
`1d233aecdf5b810a364f0d8c3202e18b0ff36aa9` e recebeu `GO TECNICO LOCAL`
independente. O auditor confirmou a persistencia cifrada imediata da fila, a
retomada pela entrada publica depois de reabrir o estado do disco e o rollback
integral dos caminhos ACK, `accepted_unconfirmed` e `release`. Achados
residuais: CRITICAL 0, HIGH 0, MEDIUM 0 e LOW 0; nenhuma lacuna indispensavel.
Registro:
`docs/audit/152-open-finance-numeric-save-flow-independent-close-2026-08-05.md`.

O gate 32 esta encerrado somente no alcance tecnico local. Flags, deploy,
Pluggy/Sheets/WhatsApp reais e producao permanecem fora do escopo.

O gate 33 foi especificado em
`docs/plans/workstreams/open-finance-numeric-save-release.md`. Ele deve provar,
antes de qualquer deploy, o cutoff efetivo de `2026-07-28`, a nao ressurreicao
de backlog anterior, a terminalidade de `accepted_unconfirmed`, a
compatibilidade de estados individuais antigos com lotes novos e o rollback do
conjunto persistido. A primeira etapa e exclusivamente RED/local.

A fila posterior ficou formalizada no roadmap do workstream:

- gate 34: deploy OCI e smoke do fluxo numerico de compras, ainda sem escrita;
- gate 35: revisao humana e recalculo final do RX historico, sem inferir
  parcelas ou movimentos de investimento ambiguos;
- gate 36: propostas proativas de estornos e entradas, semanticamente separadas
  de transferencias internas;
- gate 37: pareamento de transferencias e reservas/Caixinhas sem criar receita
  ou despesa artificial;
- gate 38: escrita gradual por classe, com compra primeiro e cada expansao
  condicionada ao proprio GO, segunda confirmacao, idempotencia e recibo.

Essa ordem impede que uma transferencia seja salva como entrada e que uma
ambiguidade historica contamine as novas classes. Nenhum gate posterior foi
iniciado ou autorizado por este registro.

## Capacidade

`Codex -> Sol -> Alto -> implementar a fronteira RED causal do gate 33 sem acessar producao.`

## Handoff portatil - 2026-08-05

- objetivo ativo: iniciar a fronteira RED causal de
  `OF-NUMERIC-SAVE-RELEASE-01` (gate 33);
- commit de partida do gate 33:
  `9b36cc95935ca0e7c546e525f2aa10fc46d50859`;
- ultimo HEAD publicado antes deste checkpoint:
  `6bbe49ac2132a394477c65b7fee936c4ce9e5c83`;
- concluido: gate 32 com GO tecnico local independente, charter do gate 33 e
  ordem formal dos gates 34 a 38;
- trabalho parcial: nenhum codigo ou teste RED do gate 33 foi iniciado;
- decisao vigente: provar primeiro cutoff, backlog, compatibilidade de estado,
  restart e rollback em ambiente local/copia consistente;
- risco principal: ressuscitar proposta anterior a `2026-07-28` ou misturar
  estado individual legado com lote numerico;
- ultima evidencia confiavel de produto: gate 32 com focal 12/12, causal
  171/171 e suite hermetica 1.530 total, 1.520 aprovados, zero falhas e 10
  skips; nenhuma mudanca causal posterior;
- mudancas posteriores: somente documentacao dos gates 33 a 38 e deste
  checkpoint;
- arquivos alheios: nenhum arquivo sujo observado na raiz canonica antes do
  checkpoint;
- autorizacoes externas: commit/push e handoff portatil autorizados; deploy,
  flags, producao, Pluggy/Sheets/WhatsApp reais nao autorizados por este gate;
- proxima acao: criar a prova RED local do gate 33;
- capacidade de retomada: `Codex -> Sol -> Alto`.

O HEAD exato resultante e a raiz portatil nova devem ser obtidos de
`Trabalho Codex no outro PC/OPEN-THIS.json`; esse ponteiro prevalece sobre
qualquer copia antiga do SSD.

## Gate 33 - candidato local de prontidao de release

Atualizado em: 2026-08-06

O gate `OF-NUMERIC-SAVE-RELEASE-01` foi implementado em worktree isolada a
partir de `25c7c6be8953214aa1e4310403a006efcc9c88bb`. O preflight exige os
quatro aliases e seus cutoffs explicitos em `2026-07-28` ou posterior, modos
canary, proposta `prompt`, escrita `off` e aprovacao falsa.

O ensaio cria um bundle coerente v3 em copia local com staging, baseline,
outbox, preview, journal, ancora terminal e state store cifrado. O restore
quarentena backlog anterior ao corte, preserva `accepted_unconfirmed` como
terminal, recupera leases expirados, reclama somente pendencias elegiveis e
prova rollback pelo fingerprint integral. A compatibilidade cobre estado
individual antigo e lote numerico novo depois de reabertura, sempre com
`financial_writes=0` e sem efeito externo.

Evidencia local: focal `6/6`; bateria causal `226/226`; suite hermetica ampla
1.536 total, 1.526 aprovados, zero falhas e 10 skips conhecidos; cobertura de
linhas 90,80%, branches 73,37% e funcoes 90,52%; syntax checks e
`git diff --check` verdes. Nenhuma chamada Pluggy/Sheets/WhatsApp real, flag,
deploy ou producao foi executada.

Estado maximo: `candidato local aguardando auditoria independente por hash
imutavel`. Proxima acao: publicar somente os arquivos sanitizados deste gate e
submeter o commit a uma conversa limpa no Chat. O gate operacional 34 continua
fora do escopo e requer autorizacao/presenca de Daniel.

O candidato `a27ac8160cf797a04d4e798929bfae2ae427a6ff` recebeu `NO-GO`
independente. O bloqueador `HIGH` era causal: `rollback_match` comparava duas
restauracoes limpas, sem reverter a arvore realmente alterada. O parecer tambem
registrou falta de auditoria do backlog na arvore pos-rollback, quiescencia
mecanica da copia, tripwire de efeitos externos e politica imutavel.

O recovery reverte o mesmo diretorio instalado e compara seu fingerprint
recursivo integral, inclusive removendo arquivo extra injetado. Depois do
rollback, reabre o outbox, prova zero reclamacao anterior ao corte, preserva
`accepted_unconfirmed` e falha para pendencia estranha. A origem precisa manter
o mesmo fingerprint durante o snapshot; a CLI exige confirmacao quiescente;
aliases/cutoffs ficam congelados desde o preflight; o focal bloqueia
`fetch`/HTTP/HTTPS/sockets e preserva zero escrita no handler.

Evidencia final do recovery: focal `8/8`; causal `228/228`; suite hermetica
1.538 total, 1.528 aprovados, zero falhas e 10 skips; cobertura de linhas
90,81%, branches 73,36% e funcoes 90,52%. Estado maximo: `recovery candidato
aguardando nova auditoria independente por novo hash`. O gate 34 permanece fora
do escopo.

O recovery `3e94bb43c7bf13e0bf6521a9a36236080f83af7d` recebeu novo
`NO-GO` com apenas um `MEDIUM` residual. O auditor confirmou fechados os dois
`HIGH`, o tripwire de efeitos e a politica imutavel, mas demonstrou que
`state_store.tmp` ou `state_store.replay.tmp` podiam surgir depois do precheck
sem participar do fingerprint posterior.

O segundo recovery inclui a existencia e o conteudo desses temporarios no
fingerprint antes/depois e os verifica novamente imediatamente antes do
manifesto. A prova injeta `state_store.tmp` durante o `checkpoint()` assincrono,
exige `numeric_save_release_source_changed_during_snapshot` e confirma a
remocao do bundle parcial. WAL e rollback journal SQLite com conteudo tambem
integram a verificacao; SHM derivado nao e tratado como dado persistente.

Evidencia final atual: focal `9/9`; causal `229/229`; suite hermetica 1.539
total, 1.529 aprovados, zero falhas e 10 skips; cobertura de linhas 90,82%,
branches 73,38% e funcoes 90,53%. Estado maximo: `segundo recovery candidato
aguardando nova auditoria independente por novo hash`. Gate 34 continua fora
do escopo.

O segundo recovery foi publicado no hash imutavel
`ea803c5c29919daa582355046536bd22bf8f88a1` e recebeu `GO TECNICO LOCAL`
independente. O auditor confirmou literalmente o hash, leu integralmente os
seis arquivos alterados e encerrou o residual da corrida de temporarios com
`CRITICAL 0`, `HIGH 0`, `MEDIUM 0` e `LOW 0`. O registro de fechamento e
`docs/audit/156-open-finance-numeric-save-release-independent-close-2026-08-06.md`.

O gate 33 esta encerrado somente no alcance tecnico local. Gate 34, deploy OCI,
flags, Pluggy/Sheets/WhatsApp reais e producao continuam fora do escopo. A
proxima acao e apenas preparar o gate operacional 34 para execucao futura com
Daniel presente e autorizacao explicita.

## Gate 34 - charter operacional preparado

Atualizado em: 2026-08-07

O charter `OF-NUMERIC-SAVE-OCI-01` foi preparado em
`docs/plans/workstreams/open-finance-numeric-save-oci.md`. Ele fixa o hash de
produto auditado `ea803c5c29919daa582355046536bd22bf8f88a1`, separa preparacao
somente leitura de promocao/restart e exige uma segunda autorizacao antes da
mutacao remota.

O smoke espera polling natural, usa os dois telefones somente com Daniel
presente, prova reserva unica e mantem `OPEN_FINANCE_WRITE_MODE=off`, aprovacao
`false` e `financial_writes=0`. `confirm`, escrita, gates 35 a 38 e qualquer
acao remota permanecem nao autorizados.

Proxima acao: com Daniel presente, iniciar a fronteira A pelo hash e pela
redescoberta sanitizada da infraestrutura vigente; sem presenca/autorizacao,
parar neste checkpoint.

Autorizacao permanente registrada em 2026-08-07: construir/verificar localmente
o artefato deste gate e fazer descoberta OCI sanitizada estritamente read-only.
Upload, prepare remoto, backup novo, restart, flags, promocao, mensagem, polling
e smoke continuam exigindo autorizacao propria. O artefato do hash
`ea803c5c29919daa582355046536bd22bf8f88a1` foi construido e verificado
localmente, com 799 arquivos e checksums do pacote e instalador validos. A
descoberta remota esta aguardando novo login na console Oracle: o host historico
nao responde e nao foi reutilizado sem validacao.

Depois do login, a console confirmou duas VMs relacionadas ao bot em `Running`.
A VM Ubuntu historica e a VM candidata anterior estao inacessiveis por
22/80/443, enquanto a subnet publica e a security list mostram ingress para as
tres portas. Nenhum DNS conhecido aponta para qualquer VM observada. Sem acesso
autenticado, PM2, health, flags, stores e `financial_writes=0` permanecem
`NAO_DISPONIVEL`.

Estado vigente do gate 34: `NO-GO` antes de upload. Evidencia:
`docs/audit/157-open-finance-numeric-save-oci-frontier-a-preflight-2026-08-07.md`.
Proxima acao: obter autorizacao propria para diagnostico operacional mutavel ou
restabelecer acesso por um caminho ja aprovado; nao preparar nem promover o
artefato enquanto a identidade da unica producao e sua saude nao forem provadas.

Diagnostico read-only adicional confirmou rota padrao, internet gateway
`Available`, regras publicas para HTTP/HTTPS e metricas recentes de CPU/memoria
nas duas VMs. SSH permanece limitado a um CIDR cuja correspondencia atual nao
foi confirmada. A menor proxima acao e criar conexao serial efemera somente na
VM Ubuntu para listeners, firewall, SSH, Caddy, PM2 e health read-only; a
criacao dessa conexao exige autorizacao propria e nao autoriza reparo ou reboot.

Daniel autorizou uma regra SSH `/32` temporaria para o IP atual e diagnostico
somente leitura. A regra tornou a VM Ubuntu alcancavel, confirmou a chave de
host previamente confiada e o servidor Ubuntu esperado, mas a chave local
disponivel foi recusada antes de qualquer comando remoto. A regra temporaria foi
removida e sua ausencia foi confirmada; nenhuma mutacao ficou ativa.

Estado vigente: gate 34 continua `NO-GO` antes de upload. PM2, health, flags,
stores e `financial_writes=0` seguem `NAO_DISPONIVEL`. Menor proxima acao:
autorizar uma conexao serial efemera somente na VM Ubuntu para diagnostico
interno read-only; troca de chave ou qualquer reparo exigem autorizacao separada.

O pacote privado recuperado em 2026-08-07 continha a configuracao de producao e
uma chave permanente diferente da chave historica recusada. A ACL herdada do
ZIP foi reduzida a Thais, Administradores e Sistema; a chave autenticou na VM
Ubuntu e tornou console serial desnecessario. Nenhum material privado foi lido
ou registrado.

O preflight autenticado confirmou SSH/Caddy ativos, listeners esperados, um
PM2 online sem restart, health/SQLite/WhatsApp verdes, seis flags seguras,
stores em `0600` sob diretorios `0700` e ausencia de sidecars SQLite residuais.
Logs foram avaliados somente por contagens sanitizadas. Todas as regras SSH
temporarias foram removidas. Evidencia vigente:
`docs/audit/158-open-finance-numeric-save-oci-key-recovery-preflight-2026-08-07.md`.

Estado atual: acesso SSH recuperado; gate 34 ainda `NO-GO` antes de upload por
backup/restore v3, verificacao agregada dos stores e segunda VM pendentes. A
proxima implementacao local pode seguir sem herdar autorizacao de deploy.

O primeiro backup/restore v3 OCI concluiu quatro arquivos, paridade, retencao,
revogacao isolada, limpeza do restore e `financial_writes=0`, mas revelou o
diretorio do pacote em `0775`. O diretorio real foi reduzido imediatamente a
`0700`; raiz e arquivos ja estavam privados.

Recovery local em
`docs/audit/159-open-finance-backup-private-directory-recovery-candidate-2026-08-07.md`:
criacao e endurecimento explicitos em `0700`, verificacao POSIX fail-closed e
teste adversarial para destinos preexistentes em `0755`. Evidencia focal/causal
`9/9 + 9/9`, checks sintaticos e diff verdes.

O hash imutavel `2af482094cd325f2e6c7f543020c07babcfd5d57` recebeu `GO TECNICO
LOCAL` independente, com zero achado critico, alto ou medio. Um `LOW` de
cobertura rara foi aceito como nao bloqueante porque o produto ja verifica o
modo efetivo e falha fechado. Fechamento:
`docs/audit/160-open-finance-backup-private-directory-recovery-independent-close-2026-08-07.md`.

Estado atual: recovery encerrado; artefato anterior invalidado. Proxima acao:
construir novo artefato e provar na OCI backup/restore real com diretorio do
pacote em `0700`, antes de preparar o plano de promocao.

## Gate 34 - fronteira A concluida com uma precondicao externa pendente

Atualizado em: 2026-08-07

O artefato `2219590411fbea993bc8baa608e6a86c372dea27` foi reconstruido,
verificado localmente e na OCI e preparado em slot isolado. O backup/restore v3
executado pelo codigo novo passou com diretorio real em `0700`, arquivos em
`0600`, paridade, retencao, revogacao somente na copia, limpeza integral e
`financial_writes=0`.

A VM OCI candidata antiga foi identificada pela console e parada graciosamente;
a producao Ubuntu permaneceu com processo unico, zero restart, health,
SQLite/WhatsApp e flags seguros. Todas as regras SSH temporarias foram
removidas.

Plano e evidencia:
`docs/audit/161-open-finance-numeric-save-oci-frontier-a-plan-2026-08-07.md`.
O rollback aponta para a release anterior e o novo slot ainda nao foi
promovido.

Estado: `NO-GO PARA PROMOCAO` somente porque `aws_pm2_stopped` nao recebeu
prova factual: o host historico nao responde e a console AWS exige login. Apos
confirmar a AWS, apresentar o plano a Daniel e exigir a autorizacao final com
presenca para o smoke familiar. Nenhum polling ou mensagem foi disparado.

## Gate 34 - primeira promocao revertida e recovery de readiness

Atualizado em: 2026-08-07

Daniel confirmou que a AWS antiga ja estava parada e, presente com os dois
telefones, autorizou a promocao e o smoke. Essa confirmacao do usuario resolveu
a precondicao operacional, embora a AWS nao tenha sido revalidada de forma
independente nesta execucao.

O preflight imediato ficou verde. A promocao do artefato `2219590411fbea993bc8baa608e6a86c372dea27`
iniciou, o candidato autenticou o WhatsApp e chegou a 100% de carregamento, mas
a unica tentativa de `ready rescue` falhou e o health permaneceu fechado. O
controlador executou rollback automatico para `1a1630949cf6acb301a2a054e61987d1cf516fb4`.
A release anterior recuperou processo unico, health, SQLite e WhatsApp verdes;
o instalador encerrou e a regra SSH temporaria foi removida. Nao houve segunda
promocao, polling forcado, smoke ou escrita financeira.

Recovery local:
`docs/audit/162-open-finance-numeric-save-whatsapp-readiness-recovery-candidate-2026-08-07.md`.
O resgate agora repete no maximo tres vezes enquanto a inicializacao continuar
pendente e possui cancelamento idempotente. Evidencia: `11/11` focados,
`56/56` afetados, sintaxe e diff verdes.

Estado: `CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`; gate 34 permanece
`NO-GO` para nova promocao. Proxima acao: commit sanitizado, push e auditoria do
Chat pelo hash imutavel. Somente um GO autoriza reconstruir o artefato e repetir
o preflight/promocao.

O primeiro commit do recovery, `1883877c4412d0827185b88557a55117bdc3d1c3`,
nao recebeu veredito: a geracao do Chat foi interrompida depois de ficar sem
progresso. Dois achados validos foram incorporados antes da interrupcao:
revalidacao do estado pendente depois do `await` de anexacao e teto real de tres
tentativas mesmo sob configuracao futura maior. A evidencia atualizada e
`12/12` focados e `57/57` afetados. O estado continua `CANDIDATO AGUARDANDO NOVA
AUDITORIA POR NOVO HASH`; nenhuma nova promocao foi executada.

O segundo hash, `3bb037893372867e7912123cb1ef304e05812d1e`, tambem nao
recebeu veredito formal. A revisao identificou que o primeiro binding duplicado
na versao pinada de `whatsapp-web.js` nao prova que a longa anexacao de todos os
listeners terminou. O recovery atual instala single-flight antes de
`client.initialize()`: inicializacao e resgate aguardam a mesma promessa, sem
forcar sincronizacao durante anexacao concorrente; uma chamada posterior a uma
conclusao continua permitida. Evidencia atual: `14/14` focados e `59/59`
afetados. Estado permanece `CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE POR NOVO
HASH`; producao continua saudavel na release anterior.

O terceiro hash, `c4f63f1c9937a39d185cf1595a850dc076333ba1`, recebeu
`NO-GO TECNICO LOCAL` formal: zero CRITICAL/HIGH, um MEDIUM por falta de teste
da rejeicao/limpeza/retry do single-flight e dois LOW, incluindo cancelamento
isolado durante tentativa ativa e promessa permanentemente pendente. O recovery
atual adiciona a prova de rejeicao compartilhada seguida de retry real e inclui
`cancelled` no predicado passado a tentativa em voo. Evidencia atual:
`16/16` focados e `61/61` afetados. A promessa permanentemente pendente segue
fail-closed pelo health e rollback OCI e foi aceita como risco baixo. Estado:
`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE POR NOVO HASH`; sem nova promocao.

O hash final `ce49c0705120ea9a421e05fd60a9373aea889019` recebeu `GO
TECNICO LOCAL` independente: CRITICAL/HIGH/MEDIUM zero, um LOW aceito e nenhuma
lacuna indispensavel. O Chat confirmou o mesmo SHA e os seis arquivos, sem
executar os testes locais. Fechamento:
`docs/audit/163-open-finance-numeric-save-whatsapp-readiness-independent-close-2026-08-07.md`.

Estado atual: recovery de readiness encerrado localmente; producao continua
saudavel na release anterior e nao ha regra SSH temporaria. Proxima acao:
construir artefato exatamente do hash auditado, verificar/preparar novo slot e
repetir preflight, promocao com rollback e smoke familiar do gate 34.

O artefato do hash auditado foi construido e verificado localmente: manifesto
com `807` arquivos, pacote e instalador com checksums validos. Checkpoint:
`docs/audit/164-open-finance-numeric-save-recovery-artifact-checkpoint-2026-08-07.md`.

A sessao Oracle expirou antes da criacao da nova regra SSH. Nenhuma regra foi
adicionada, a porta permaneceu fechada e nao houve upload ou acesso remoto.
Estado: `ARTEFATO LOCAL VERDE; AGUARDANDO LOGIN ORACLE`. Proxima acao exata:
Daniel autentica a aba Oracle e informa `pronto`; entao adicionar `/32`
temporario, repetir preflight e preparar/promover o slot sob o mesmo rollback.
