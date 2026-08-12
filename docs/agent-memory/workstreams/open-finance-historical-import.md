# Estado - importacao historica Open Finance

Atualizado em: 2026-08-12

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
- nenhum artefato privado, descricao, valor, ID ou segredo entrou no Git.

## Proxima acao

Obter de Daniel a semantica dos grupos privados repetidos restantes usando
data, valor, conta/cartao e recorrencia, aplicar cada decisao somente ao conjunto
equivalente confirmado e recalcular o plano com `financial_writes=0`.

## Capacidade

`Codex -> Sol -> Baixo -> coletar a semantica dos grupos privados residuais do Gate 41.`
