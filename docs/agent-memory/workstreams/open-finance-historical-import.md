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
- nenhuma linha historica foi escrita; `financial_writes=0`;
- a unica criacao estrutural necessaria foi concluida pelo canal Google
  autenticado e confirmada por releitura direta da planilha; nao houve criacao
  de aba, alteracao do catalogo de cartoes, restart ou deploy.

## Evidencia local atual

- planejador focal com controles adversariais de pagamento de fatura: 22/22;
- runtime focal com relogio deterministico: 12/12;
- configurador focal apos a auditoria: 10/10; caminho absoluto de decisoes
  privadas dentro do repositorio agora e rejeitado antes da leitura;
- bateria hermetica ampla do candidato, cobrindo todas as suites
  `openFinanceHistorical*.test.js`: 106/106 testes verdes, sem falhas;
- auditoria independente do hash
  `e9a73b8a6d982d94941dfc73d9b1f393f561e0fd`: `NO-GO`, com um achado ALTO
  na fronteira do caminho privado; o achado foi corrigido e aguarda reauditoria
  em novo hash;
- auditoria independente do hash
  `fe374a3ee3a67457c02e74268984c7428fbcb2ac`: `GO TECNICO LOCAL`, zero
  achados e nenhuma lacuna indispensavel no escopo read-only;
- nenhum artefato privado, descricao, valor, ID ou segredo entrou no Git.

## Proxima acao

Publicar e reauditar a correcao da fronteira do arquivo privado; depois revisar
duplicatas, entradas, estornos e os grupos de categoria ainda ambiguos,
preservando `financial_writes=0`.

## Capacidade

`Codex -> Sol -> Alto -> validar e auditar o saneamento privado do Gate 41.`
