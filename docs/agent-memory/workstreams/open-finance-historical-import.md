# Estado - importacao historica Open Finance

Atualizado em: 2026-08-14

## Objetivo ativo

Preparar um lote historico idempotente a partir do RX saneado, confrontando cada
movimento com a planilha pessoal realmente usada pelo bot antes de qualquer
escrita financeira.

## Estado vigente

- worktree isolada: `codex/open-finance-historical-import-g41`;
- o snapshot da planilha central legada foi invalidado para este gate;
- um gasto sintetico de R$ 0,01, com marcador exclusivo, foi criado pelo fluxo
  real do WhatsApp, localizado na planilha pessoal informada por Daniel e
  removido pelo proprio bot; a releitura confirmou ausencia do marcador;
- a fonte valida passou a ser somente a planilha pessoal consolidada;
- o cofre Pluggy foi preservado e atualizado por uma unica leitura live:
  quatro fontes, nove contas/cartoes e 2.351 transacoes, com observacao em
  2026-08-11 e `financial_writes=0`;
- a cobertura de 2025-07-01 ate 2026-07-27 agora esta completa;
- o planejador usa Saidas, Entradas, Transferencias e Lancamentos Cartao;
  cartoes sao separados por `card_id` e contas por Conta Financeira;
- meses de cobranca historicos sao evidenciados pelo `bill_id`, conta do cartao
  e vencimento da fatura Pluggy; dia de fechamento ausente nao e inventado;
- o catalogo real confirmou que `card-itau` ja e o cartao Thais/Itau; nenhum
  novo cartao deve ser criado;
- somente a conta Cristina/Nubank faltava e foi criada idempotentemente na aba
  existente Contas Financeiras, com releitura confirmando uma ocorrencia;
- o vinculo privado explicito `thais_itau -> card-itau` evita inferir titular
  pelo nome generico do cartao e preserva o catalogo consolidado;
- a simulacao apos esses cadastros vincula quatro contas e quatro cartoes; a
  poupanca Itau sem movimentos no recorte permanece sem destino;
- plano privado simulado: 856 prontos, 33 duplicatas provaveis, 53 pendentes
  excluidos, 1.248 em revisao e 161 fora da janela;
- o configurador agora aceita regras e decisoes privadas revisadas somente por
  arquivo absoluto fora do repositorio, valida o schema e as mantem separadas
  das sugestoes automaticas;
- descricoes semanticamente inequivocas e evidencias ja usadas na planilha
  elevaram o plano para 1.202 prontos; pagamentos de fatura confirmados foram
  excluidos como movimento financeiro, nunca categorizados como despesa;
- plano privado vigente: 1.202 prontos, 33 duplicatas provaveis, 118 excluidos,
  837 em revisao e 161 fora da janela; restam 489 categorias, 238 entradas ou
  estornos, 106 creditos/pagamentos de cartao e 4 moedas nao BRL para revisao;
- uma regra exata semanticamente inequívoca foi ampliada para correspondencia
  parcial e elevou o plano a 1.205 prontos, com 834 revisoes;
- o pareamento familiar sem referencia agora exige valor oposto, datas dentro
  da janela e a ate um dia, contas bancarias distintas, correspondencia
  mutuamente unica e identificacao bilateral pela identidade explicita de cada
  conta; a identidade da conta prevalece sobre o titular vinculado;
- o produto real consolidou 32 pares familiares: plano privado atual com 1.237
  prontos, 33 duplicatas provaveis, 150 excluidos, 770 em revisao e 161 fora da
  janela, sempre com `financial_writes=0`;
- rendimentos explicitamente identificados de Caixinha foram classificados por
  decisao privada confirmada, sem transformar principal de reserva em receita;
- estorno bancario pre-salvamento agora neutraliza tambem o debito original
  somente quando ambos estao ausentes da planilha, pertencem a mesma conta,
  possuem valores exatamente opostos, semantica explicita, identidades unicas e
  intervalo de ate 30 dias; qualquer concorrencia permanece retida;
- o recálculo privado atual tem 1.272 prontos, 33 duplicatas provaveis, 158
  excluidos, 727 em revisao e 161 fora da janela, sempre com
  `financial_writes=0`;
- nenhuma linha historica foi escrita; `financial_writes=0`;
- a unica criacao estrutural necessaria foi concluida pelo canal Google
  autenticado e confirmada por releitura direta da planilha; nao houve criacao
  de aba, alteracao do catalogo de cartoes, restart ou deploy.

## Atualizacao prevalente do candidato bilateral

- uma passagem semantica conservadora, limitada a descricoes comerciais
  inequivocas, elevou o plano privado a 1.311 prontos, 34 duplicatas provaveis,
  158 excluidos e 687 em revisao;
- o candidato bilateral de pagamento de fatura exige debito bancario
  explicitamente classificado, credito `POSTED` de cartao, BRL, identidades
  unicas, ausencia na planilha, valor igual, ate tres dias e unicidade mutua;
- o snapshot privado fechou 37 contrapartes sem criar item pronto: o plano
  candidato tem 1.311 prontos, 34 duplicatas provaveis, 195 excluidos, 650 em
  revisao e 161 fora da janela, sempre com `financial_writes=0`;
- o residual permanece retido: 417 categorias, 160 creditos bancarios, 69
  creditos ou ajustes de cartao sem vinculo forte e 4 moedas nao BRL.

## Atualizacao privada v8

- doze regras privadas adicionais, restritas a comerciantes inequivocos e uma
  receita institucional explicita, fecharam 13 itens sem alterar codigo;
- o plano privado vigente tem 1.324 prontos, 34 duplicatas provaveis, 195
  excluidos, 637 em revisao e 161 fora da janela;
- o residual e composto por 406 categorias, 158 creditos bancarios, 69
  creditos ou ajustes de cartao sem vinculo forte e 4 moedas nao BRL;
- a proxima reducao exige decisao humana sobre grupos repetidos opacos; nenhuma
  classificacao fraca sera inferida e `financial_writes=0` permanece.

## Atualizacao privada v9

- Daniel confirmou que PIX recebidos de Cristina sao reembolsos de parcelas do
  casamento e que as transferencias recorrentes para Dhalyn sao mensalidades do
  Spotify, classificadas como Assinaturas;
- a direcao foi preservada: os 11 PIX enviados a Cristina continuam retidos e
  nao foram confundidos com os recebimentos;
- as duas regras fecharam 17 itens e elevaram o plano privado a 1.341 prontos,
  34 duplicatas provaveis, 195 excluidos, 620 em revisao e 161 fora da janela;
- o residual e composto por 396 categorias, 151 creditos bancarios, 69
  creditos ou ajustes de cartao sem vinculo forte e 4 moedas nao BRL;
- nenhuma linha financeira foi escrita e nenhum dado privado entrou no Git.

## Atualizacao privada v10

- uma recorrencia de servico e um pagamento eventual, antes agrupados pelo
  primeiro nome do recebedor, foram separados pela identidade completa e
  classificados conforme decisao de Daniel;
- cinco itens passaram a prontos: o plano privado tem 1.346 prontos, 34
  duplicatas provaveis, 195 excluidos, 615 em revisao e 161 fora da janela;
- um grupo confirmado como pagamento de emprestimo permanece retido porque
  duas parcelas parecem ja estar representadas na planilha sob outra descricao;
- cinco transferencias confirmadas como internas permanecem retidas ate a conta
  de destino ser identificada, evitando inventar contraparte ou trata-las como
  despesa;
- `financial_writes=0` e nenhum dado privado entrou no Git.

## Atualizacao privada v11

- sete grupos comerciais repetidos receberam semantica explicita de Daniel e
  foram classificados somente nos conjuntos equivalentes confirmados;
- 49 itens passaram a prontos: o plano privado tem 1.395 prontos, 34
  duplicatas provaveis, 195 excluidos, 566 em revisao e 161 fora da janela;
- os grupos ainda nao conferidos, o pagamento de emprestimo parcialmente
  representado e as transferencias internas sem destino identificado continuam
  retidos;
- `financial_writes=0` e nenhum dado privado entrou no Git.

## Atualizacao privada v12 e fechamento tecnico local

- o destino das cinco transferencias internas foi confirmado como uma conta
  historica externa que nao deve integrar o catalogo operacional do bot;
- as seis parcelas do grupo revisado foram reconciliadas: quatro permanecem
  despesas prontas e duas foram comprovadas como linhas ja existentes, sem
  `write_plan` e sem duplicacao;
- o recálculo privado vigente tem 1.404 prontos, 2 existentes, 34 duplicatas
  provaveis, 195 excluidos, 555 em revisao e 161 fora da janela;
- o catalogo permaneceu com oito vinculos; nenhum vinculo foi criado para o
  destino historico textual;
- o primeiro candidato recebeu `NO-GO` apenas por cobertura negativa focal
  incompleta; conta divergente, data fora da janela, descricao divergente,
  fonte nao bancaria e identidade `source_ref` receberam provas explicitas;
- o hash `3a528407f97d1bc7aa923807de74c62af23200ab` recebeu `GO TECNICO LOCAL`
  independente, sem achados bloqueantes ou lacuna indispensavel;
- nenhuma linha financeira foi escrita e `financial_writes=0` permanece.

## Atualizacao privada v20

- nove decisoes humanas agrupadas foram registradas fora do repositorio:
  cursos, cabelo, devolucao de emprestimo, churrasco, itens para casa e
  manutencao do carro;
- os descritores foram limitados ao beneficiario completo ou ao beneficiario
  real do intermediador `JIM.COM`, sem classificar transferencias homonimas;
- a comparacao causal provou exatamente 29 transicoes de `needs_review` para
  `ready`, nas contagens esperadas, sem nenhuma mudanca inesperada;
- o plano privado vigente tem 1.569 prontos, 2 existentes, 34 duplicatas
  provaveis, 195 excluidos, 390 em revisao e 161 fora da janela;
- cobertura completa, oito bindings e `financial_writes=0` foram preservados;
  nenhuma linha financeira foi escrita e nenhum dado privado entrou no Git.

## Atualizacao privada v23

- o segundo lote humano classificou almocos, manutencao e montagem da casa,
  compras do casamento e duas transferencias internas familiares;
- uma regra inicial alcancou um terceiro movimento de Juliana que nao havia
  sido apresentado; o plano foi fechado novamente, o movimento permaneceu em
  revisao e somente depois da confirmacao explicita de Daniel foi classificado;
- o resultado final possui exatamente 16 transicoes autorizadas para `ready`,
  incluindo tres ocorrencias de Juliana e duas transferencias, sem estados
  inesperados;
- o plano privado vigente tem 1.585 prontos, 2 existentes, 34 duplicatas
  provaveis, 195 excluidos, 374 em revisao e 161 fora da janela;
- toda consulta humana futura deve apresentar por ocorrencia data, valor,
  conta/cartao, titular/origem e descricao antes de aplicar a resposta;
- cobertura completa, oito bindings e `financial_writes=0` foram preservados.

## Atualizacao privada v24

- quinze ocorrencias apresentadas com contexto completo foram decididas
  individualmente e confirmadas como movimentos distintos;
- nove foram classificadas como alimentacao de rua, duas parcelas como cinema
  e quatro refeicoes como alimentacao da lua de mel;
- o uso exclusivo de `decisionOverrides` evitou transformar nomes humanos ou
  descritores comerciais em regras amplas para ocorrencias nao apresentadas;
- a comparacao causal provou exatamente 15 transicoes para `ready`, sem estado
  inesperado ou movimento adicional;
- o plano privado vigente tem 1.600 prontos, 2 existentes, 34 duplicatas
  provaveis, 195 excluidos, 359 em revisao e 161 fora da janela;
- cobertura completa, oito bindings e `financial_writes=0` foram preservados.

## Atualizacao privada v25

- seis transferencias humanas foram decididas por data, valor, origem e
  descricao: cinco lanches comuns e um cafe da manha da lua de mel;
- dois movimentos com semantica explicita de quitacao foram classificados como
  emprestimo, reutilizando a categoria historica ja estabelecida;
- a comparacao causal provou exatamente oito transicoes para `ready`, com
  distribuicao 5/1/2 e nenhum estado inesperado;
- o plano privado vigente tem 1.608 prontos, 2 existentes, 34 duplicatas
  provaveis, 195 excluidos, 351 em revisao e 161 fora da janela;
- restou somente um grupo de categoria repetido, `saldo em atraso`, que
  permanece retido por nao representar compra nova;
- cobertura completa, oito bindings e `financial_writes=0` foram preservados.

## Atualizacao privada v26

- sete gastos do casamento foram classificados individualmente: tres servicos,
  tres alimentos e uma compra, todos preservando a subcategoria `CASAMENTO`;
- uma transferencia para empresa de educacao foi classificada como curso por
  semantica comercial explicita;
- a comparacao causal provou exatamente oito transicoes para `ready`, com
  distribuicao 3/3/1/1 e nenhum estado inesperado;
- o plano privado vigente tem 1.616 prontos, 2 existentes, 34 duplicatas
  provaveis, 195 excluidos, 343 em revisao e 161 fora da janela;
- cobertura completa, oito bindings e `financial_writes=0` foram preservados.

## Atualizacao privada v27

- dois debitos confirmados como pagamento de fatura foram excluidos do consumo;
  o primeiro acionou o pareamento bilateral ja auditado e excluiu tambem sua
  contraparte unica de mesmo valor no cartao;
- uma transferencia para Cristina foi registrada como interna com destino na
  conta `Cristina - Nubank`;
- papelaria, tres refeicoes da lua de mel e um bolo de aniversario foram
  classificados por ocorrencia e finalidade;
- a comparacao causal provou nove transicoes: seis para `ready` e tres para
  `excluded`, incluindo a contraparte forte da fatura, sem estado inesperado;
- o plano privado vigente tem 1.622 prontos, 2 existentes, 34 duplicatas
  provaveis, 198 excluidos, 334 em revisao e 161 fora da janela;
- cobertura completa, oito bindings e `financial_writes=0` foram preservados.

## Atualizacao privada v28

- dez ocorrencias foram classificadas com base nas respostas contextuais de
  Daniel: refeicoes, registro profissional, rateio de trabalho, presentes e
  refeicoes da lua de mel, imposto de renda e multa de transito;
- a autorizacao ampla para Wise foi registrada como compra do celular da
  Thais, mas a regra encontrou somente uma ocorrencia no snapshot vigente;
- a comparacao causal provou exatamente dez transicoes de `needs_review` para
  `ready`, sem qualquer outra alteracao de estado;
- o plano privado vigente tem 1.632 prontos, 2 existentes, 34 duplicatas
  provaveis, 198 excluidos, 324 em revisao e 161 fora da janela;
- cobertura completa, oito bindings e `financial_writes=0` foram preservados.

## Atualizacao privada v33

- dezessete ocorrencias adicionais foram saneadas por decisoes contextuais e
  comprovantes consultados somente no cofre privado: alimentacao, lazer,
  presentes, combustivel, moradia e mercado;
- regras amplas explicitamente autorizadas cobriram tres ocorrencias `Du M` e
  mantiveram `Du Maduro` preparado sem atingir item no snapshot vigente;
- as duas ocorrencias do mesmo estabelecimento de itens para casa foram
  classificadas individualmente, sem generalizar o descritor para terceiros;
- as cinco comparacoes causais intermediarias provaram 4, 5, 4, 2 e 2
  transicoes para `ready`, sempre sem mudanca colateral;
- o plano privado vigente tem 1.649 prontos, 2 existentes, 34 duplicatas
  provaveis, 198 excluidos, 307 em revisao e 161 fora da janela;
- cobertura completa, oito bindings e `financial_writes=0` foram preservados;
  nenhum comprovante, valor, NSU, identificador ou dado bancario entrou no Git.

## Atualizacao do catalogo recorrente

- a captura da planilha agora inclui o catalogo `Contas`; o configurador
  reutiliza a regra real do produto, falha fechado em conflito e protege regras
  curtas contra coincidencia comercial sem contexto de pagamento;
- o recalculo privado passou a 1.438 prontos, 2 existentes, 34 duplicatas
  provaveis, 195 excluidos, 521 em revisao e 161 fora da janela;
- 82 sugestoes recorrentes foram registradas; grupos ja cadastrados deixaram a
  fila residual e preservaram `Recorrente=Sim` nas linhas bancarias aplicaveis;
- bateria focal 56/56 e bateria historica ampla 127/127 verdes;
- candidato documentado em
  `docs/audit/233-open-finance-historical-recurring-accounts-candidate-2026-08-12.md`,
  recebeu `NO-GO` independente: a leitura suprimia erro de aba ausente e nao
  provava que `Contas` era realmente obrigatoria;
- o recovery agora valida retorno nao vazio no snapshot e exige novamente o
  catalogo na fronteira de configuracao; regra inativa, cartao sem recorrencia
  sintetica e CLI com a funcao real receberam testes negativos;
- recovery focal 60/60 e bateria historica ampla 131/131 verdes;
- recovery documentado em
  `docs/audit/234-open-finance-historical-recurring-accounts-recovery-candidate-2026-08-13.md`,
  recebeu `GO TECNICO LOCAL` independente no hash
  `a1bdaa55c66613b5027132760e356f2530c734c0`, sem achados materiais ou
  lacuna indispensavel no escopo read-only;
- fechamento registrado em
  `docs/audit/235-open-finance-historical-recurring-accounts-independent-close-2026-08-13.md`.

## Evidencia local atual

- planejador focal com controles adversariais de pagamento de fatura: 22/22;
- runtime focal com relogio deterministico: 12/12;
- configurador focal apos a auditoria: 10/10; caminho absoluto de decisoes
  privadas dentro do repositorio agora e rejeitado antes da leitura;
- planejador focal do pareamento familiar bilateral: 27/27;
- planejador focal apos a neutralizacao de estorno pre-salvamento: 30/30;
- revalidacao focal apos fechar a leitura de creditos ja salvos em Entradas:
  31/31;
- bateria hermetica ampla do candidato familiar, cobrindo todas as suites
  `openFinanceHistorical*.test.js`: 111/111 testes verdes, sem falhas;
- bateria hermetica ampla do candidato de estorno pre-salvamento: 114/114
  testes verdes, sem falhas;
- bateria hermetica ampla do recovery apos o NO-GO: 115/115 testes verdes,
  sem falhas;
- teste focal do pareamento bilateral de pagamento de fatura: 34/34;
- bateria explicita das 12 suites historicas no novo candidato: 118/118, sem
  falhas ou skips;
- auditoria independente do hash
  `e9a73b8a6d982d94941dfc73d9b1f393f561e0fd`: `NO-GO`, com um achado ALTO
  na fronteira do caminho privado;
- reauditoria independente do hash
  `87f5e9ad767301cb3ec34197ca13cd470ade55af`: `GO TECNICO LOCAL`, zero
  achados e nenhuma lacuna indispensavel; o achado anterior foi fechado;
- auditoria independente do hash
  `c5d325927721436432d2d38caa7366c77ab1d732`: `GO TECNICO LOCAL`, zero
  achados e nenhuma lacuna indispensavel no pareamento familiar bilateral;
- auditoria independente do hash
  `2577ebc49efbfa18c845fe77e6c9e9954b00f109`: `NO-GO`, com um achado ALTO:
  a ausencia do estorno era verificada somente em Saidas, sem consultar
  Entradas; a recuperacao agora seleciona a aba pela direcao do movimento e
  possui teste causal proprio;
- reauditoria independente do hash
  `6dc4e7e36e36f011fa3252412aae36071d654e1e`: `GO TECNICO LOCAL`, achado
  anterior fechado, zero achados por severidade e nenhuma lacuna indispensavel
  no escopo read-only;
- auditoria independente do hash
  `fe374a3ee3a67457c02e74268984c7428fbcb2ac`: `GO TECNICO LOCAL`, zero
  achados e nenhuma lacuna indispensavel no escopo read-only;
- auditoria independente do hash
  `7387a371ef4805ea7b8966685a9ec9411a70530c`: `GO TECNICO LOCAL`, sem
  achados altos ou medios e sem lacuna indispensavel; o unico achado baixo e
  de granularidade focal de testes e nao abre caminho causal;
- testes focais das decisoes historicas explicitas: 48/48 verdes; a bateria
  historica ampla anterior permaneceu 122/122 e nao foi repetida sem mudanca
  causal de produto;
- reauditoria independente do hash
  `3a528407f97d1bc7aa923807de74c62af23200ab`: `GO TECNICO LOCAL`, zero
  achados bloqueantes e nenhuma lacuna indispensavel no escopo;
- nenhum artefato privado, descricao, valor, ID ou segredo entrou no Git.

## Proxima acao

O saneamento privado por recorrencia, pesquisa comercial e decisoes humanas
elevou o plano de `1.438` para `1.649` itens prontos e reduziu de `521` para
`307` itens em revisao. O catalogo privado vigente e
`historical-private-decisions-v33.json`; config, plano, lote de revisao e
revisao enriquecida vigentes sao, respectivamente, `v173`, `v174`, `v175` e
`v176`. O hash privado do plano e
`eb28a1dc70699e04c3da6fd4b15705b7f00325ac3dae39bdbed5391dbeab22ed`;
cobertura completa, oito bindings e `financial_writes=0` foram preservados.

Continuar somente com os 307 residuais: apresentar data, valor, conta/cartao,
titular/origem e descricao de cada ocorrencia; agrupar intermediadores
por beneficiario antes de perguntar, pesquisar apenas estabelecimentos e
consultar Daniel uma vez por identidade humana ainda sem semantica. Manter
moedas nao BRL, creditos sem vinculo forte, saldos rotativos e duplicatas
provaveis retidos. Nao habilitar writer historico.

## Capacidade

`Codex -> Sol -> Medio -> pesquisar e classificar somente ambiguidades residuais do Gate 41.`
