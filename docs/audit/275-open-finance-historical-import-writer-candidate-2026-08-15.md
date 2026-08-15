# Gate 41 - writer historico idempotente

Data: 2026-08-15

## Veredito solicitado

Avaliar se o candidato sustenta `GO TECNICO LOCAL` para o writer historico do
RX, sem autorizar por si so aplicacao real, alteracao da planilha ou producao.

## Arquivos do candidato

- `src/openFinance/openFinanceHistoricalImportWriter.js`;
- `scripts/runOpenFinanceHistoricalImportWriter.js`;
- `tests/openFinanceHistoricalImportWriter.test.js`;
- este manifesto.

O hash imutavel do candidato sera o commit que publicar estes quatro arquivos.

## Contrato implementado

1. o writer aceita somente plano com cobertura completa, `writable=false`,
   `financial_writes=0`, zero `needs_review`, resumo coerente e `plan_hash`
   recalculado sobre todas as entradas;
2. a data observada ainda deve cobrir o fim da janela e o artefato completo
   recebe um segundo SHA-256, exigido junto com o `plan_hash` na aplicacao;
3. somente itens `ready` com destino, operacao, esquema, `user_id` e, quando
   aplicavel, `card_id` validos entram no lote; qualquer `write_plan` em outro
   estado falha fechado;
4. cada item recebe `operationKey` deterministica e atravessa o
   `appendRowToSheet` real com planilha de usuario obrigatoria e o ledger
   financeiro persistente;
5. operacao ja `committed` vira replay sem chamada externa; `pending` ou
   `uncertain` entra apenas em `reconcileOnly`; falha interrompe o lote antes
   dos itens seguintes e permite retomada pelo mesmo plano;
6. a CLI exige plano privado fora do repositorio, modo unico, confirmacao
   explicita, hash e fingerprint exatos; stdout contem apenas agregados;
7. `dry-run` nao abre ledger nem chama Google; aplicacao real continua
   separada e bloqueada ate auditoria, backup e novo dry-run contra a planilha
   vigente.

## Evidencia privada agregada

- plano lido fora do Git e validado pelo hash
  `4b765e1a7c2ebdf3fa21d0b2659effbd1f8e979e884dc6d56c9c8a1f7230de92`;
- fingerprint integral local
  `6a88bffd275292e6365538e7f146859d5af12bd2de5af877499d23df5d574bf7`;
- 2.351 itens: 1.863 `ready`, 2 `existing`, 34
  `possible_duplicate`, 291 `excluded`, zero `needs_review` e 161
  `outside_window`;
- destinos gravaveis: 178 entradas, 1.215 lancamentos de cartao, 342 saidas
  e 128 transferencias;
- 1.863 chaves de operacao unicas e `financial_writes=0` no dry-run;
- nenhuma descricao, valor, referencia, pessoa, conta ou decisao privada foi
  versionada.

## Testes executados

- syntax check do modulo e da CLI: verde;
- teste focal do writer: 7/7;
- bateria causal planejador + CLI read-only + writer: 69/69;
- prova com o `appendRowToSheet` real e cliente Google sintetico: quatro abas
  gravadas uma vez e replay integral com zero novos appends;
- falha parcial, restart, estado incerto, hash alterado, cobertura vencida,
  residuo de revisao, destino invalido e falta de confirmacao falham fechado;
- unica suite hermetica ampla: 140 arquivos, 1.736 aprovados, zero falhas e
  dez skips controlados; cobertura de linhas 91,57%, branches 74,44% e
  funcoes 91,15%;
- `git diff --check`: verde antes do commit.

## Limites preservados

- nenhuma planilha real foi alterada por este candidato;
- o dry-run acima prova compatibilidade com o plano fechado anterior, nao
  substitui o novo snapshot da planilha depois dos smokes reais;
- backup, ensaio de rollback, dry-run vigente, aplicacao e reconciliacao final
  permanecem etapas posteriores;
- a execucao operacional deve manter um unico processo do writer por vez.

## Perguntas para auditoria

1. A validacao impede que qualquer estado nao `ready` alcance o writer?
2. Hash, fingerprint e confirmacoes vinculam a aplicacao ao artefato exato?
3. O uso do ledger real sustenta replay, falha parcial e recovery incerto sem
   novo append cego?
4. A CLI e os resultados evitam publicar dados privados?
5. Ha achado material ou lacuna causal indispensavel dentro deste escopo
   tecnico local?
