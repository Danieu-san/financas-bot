# Estado - importacao historica Open Finance

Atualizado em: 2026-08-11

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
- nenhuma linha historica foi escrita; `financial_writes=0`;
- a unica criacao estrutural necessaria foi concluida pelo canal Google
  autenticado e confirmada por releitura direta da planilha; nao houve criacao
  de aba, alteracao do catalogo de cartoes, restart ou deploy.

## Evidencia local atual

- sintaxe do planejador: verde;
- planejador focal: 19/19;
- configurador focal corrigido: 6/6;
- bateria hermetica ampla do candidato, cobrindo todas as suites
  `openFinanceHistorical*.test.js`: 99/99 testes verdes, sem falhas;
- nenhum artefato privado, descricao, valor, ID ou segredo entrou no Git.

## Proxima acao

Recalcular o plano real com a conta Cristina/Nubank existente e o vinculo
explicito `thais_itau -> card-itau`, resolver os grupos privados residuais e
publicar um novo hash imutavel para auditoria independente.

## Capacidade

`Codex -> Sol -> Alto -> recalcular e auditar o Gate 41 corrigido.`
