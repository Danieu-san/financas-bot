# Fase 6B - importacao XLS/XLSX e exportacao filtrada

Data: 2026-07-14

## Objetivo

Aceitar planilhas bancarias sem criar um segundo fluxo de importacao e permitir
que o usuario obtenha um arquivo financeiro legivel sem expor identificadores
internos. Toda importacao continua passando pelo preview e pela conciliacao ja
usados por CSV/OFX; a exportacao e somente leitura.

## Contrato de importacao

- formatos novos: `.xls` e `.xlsx`;
- limite padrao: 1 MiB e 1.000 linhas, configuravel pelos limites existentes;
- o parser escolhe exatamente uma aba com data, descricao e valor;
- abas auxiliares sem dados financeiros sao ignoradas;
- duas abas financeiras, formulas, arquivo malformado e excesso de linhas
  falham fechados;
- linhas normalizadas entram no mesmo contrato de transacao, preview,
  duplicidade e conciliacao de CSV/OFX;
- nenhum fato e gravado pelo parser. A confirmacao posterior continua
  obrigatoria no fluxo de importacao existente;
- PDF, imagem e OCR continuam fora da 6B.

## Contrato de exportacao

O comando deterministico exige periodo e aceita filtros exatos por conta,
categoria e uma unica origem (`gastos`, `entradas` ou `cartao`). As leituras
recebem o `user_id` autorizado e consultam `Saidas`, `Entradas` e, quando
existir, `Lancamentos Cartao`.

O XLSX possui uma unica aba `Exportacao` e somente as colunas publicas:

- Data;
- Tipo;
- Descricao;
- Categoria;
- Subcategoria;
- Valor;
- Conta;
- Origem.

`user_id`, `card_id`, referencia de linha, chave de operacao, id de planilha e
demais campos internos nao sao incluidos. Texto que poderia virar formula ao
abrir o arquivo e neutralizado. O limite padrao e 1.000 linhas; excesso falha
sem truncamento.

## Rollout e rollback

- padrao: `FINANCIAL_FILE_IO_MODE=off`;
- canario: `FINANCIAL_FILE_IO_MODE=canary` com allowlist exata em
  `FINANCIAL_FILE_IO_USER_IDS`;
- modo invalido falha fechado para `off`;
- CSV e OFX nao dependem da nova flag;
- promocao global para `on` ainda nao esta autorizada;
- rollback: executar o configurador com
  `FINANCIAL_FILE_IO_CANARY_ACTION=disable` e reiniciar o PM2 com ambiente
  atualizado.

## E2E automatico

`scripts/runFinancialFileIoE2E.js`:

1. resolve exatamente um usuario ativo;
2. gera XLS e XLSX sinteticos em diretorio temporario;
3. exige preview completo nos dois formatos, sem confirmacao ou escrita;
4. usa a politica de rollout real e o handler real de exportacao;
5. le a planilha pessoal somente em modo read-only;
6. abre o XLSX gerado e confere aba, colunas e ausencia de identificadores;
7. remove todos os arquivos sinteticos e exige `cleanup=zero`.

Esse E2E substitui o smoke manual da fatia porque atravessa parser, politica,
Google Sheets, handler e serializacao do documento sem depender de uma acao no
celular e sem criar fatos financeiros.

## Evidencia local

- TDD com RED para formatos ainda nao suportados e modulo de exportacao ausente;
- gate 6B: `41/41`;
- suite integral: `851/851`, zero falha, skip ou cancelamento;
- E2E: `imports=2`, `export_rows=9`, `writes=zero`, `cleanup=zero`,
  `privacy=true`;
- SheetJS `0.20.3` obtido do CDN oficial, com URL e integridade fixadas no
  lockfile;
- `npm audit --audit-level=high`: zero vulnerabilidades;
- sintaxe, construtor real de `MessageMedia` e `git diff --check`: verdes.

## Evidencia de producao

- implementacao: `8e69094e588b43d9a6c4b714e458a8f0b2c8f627`;
- endurecimento do E2E para usar a politica real:
  `f7a286848e094524fd6e93bb57313b5a06751a80`;
- deploy por fast-forward e backup
  `.env.pre-6b-8e69094-20260714T061500Z`;
- gate remoto: `41/41`; audit high com zero vulnerabilidades;
- rollout `canary` para exatamente um usuario;
- PM2 online, WhatsApp pronto e health `{"ok":true,"sqlite":true}`;
- E2E final: `imports=2`, `export_rows=17`, `writes=zero`, `cleanup=zero`,
  `privacy=true`;
- hash remoto exato `f7a286848e094524fd6e93bb57313b5a06751a80` e worktree
  rastreado limpo.

## Decisao final

`GO de producao`. A Fase 6B esta encerrada e a 6C - comprovantes financeiros
vinculados - esta autorizada a iniciar. Importacao e exportacao permanecem em
canario para um usuario; promocao global continua sem autorizacao.
