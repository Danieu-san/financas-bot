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
- dois destinos estruturais faltam: conta Cristina/Nubank e cartao Thais/Itau;
  Daniel autorizou cria-los;
- o plano privado desses cadastros foi derivado do RX, Pluggy e padroes da
  planilha, com saldo inicial reconstruido e vencimento evidenciado;
- a simulacao apos esses cadastros vincula quatro contas e quatro cartoes; a
  poupanca Itau sem movimentos no recorte permanece sem destino;
- plano privado simulado: 856 prontos, 33 duplicatas provaveis, 53 pendentes
  excluidos, 1.248 em revisao e 161 fora da janela;
- nenhuma linha historica foi escrita; `financial_writes=0`;
- a criacao estrutural real aguarda canal Google user-scoped. A leitura local
  falhou fechada, a interface autenticada nao concluiu a edicao e o SSH OCI
  estava indisponivel, sem restart, deploy ou escrita parcial.

## Evidencia local atual

- sintaxe do planejador: verde;
- planejador focal: 19/19;
- configurador focal: 5/5;
- bateria causal focal: 33/33 testes verdes;
- bateria hermetica ampla: 132/132 testes verdes, sem falhas;
- nenhum artefato privado, descricao, valor, ID ou segredo entrou no Git.

## Proxima acao

Criar idempotentemente os dois cadastros estruturais na planilha pessoal pelo
servico Google user-scoped, reler a planilha, recalcular o plano real e resolver
os grupos privados residuais. Somente depois publicar o hash imutavel e obter
auditoria independente.

## Capacidade

`Codex -> Sol -> Alto -> criar e validar os dois destinos estruturais do Gate 41.`
