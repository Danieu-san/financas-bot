# Fase 6A - correcao e categorizacao em lote

Data: 2026-07-14

## Objetivo

Permitir manutencao repetitiva de gastos sem transformar uma interpretacao
ampla em escrita silenciosa. Toda operacao precisa de filtro estreito, preview
obrigatorio, confirmacao final, revalidacao no momento da escrita,
idempotencia e rollback logico em caso de falha parcial.

## Escopo permitido

Operacoes:

- `expense.recategorize_many`: altera `categoria` e, quando a aba suporta,
  `subcategoria`;
- `expense.correct_many`: altera somente `descricao` ou `observacoes`.

Abas autorizadas:

- `Saidas`;
- `Lancamentos Cartao`.

Campos criticos proibidos em lote:

- valor e data;
- responsavel/proprietario;
- forma de pagamento e conta financeira;
- cartao, parcela e mes de cobranca;
- recorrencia, status e `user_id`.

Esses campos continuam exigindo correcao individual. Texto que parece formula
de planilha tambem e rejeitado.

## Selecao e preview

- correspondencia de `user_id` e exata;
- o filtro precisa conter descricao, categoria atual ou periodo valido;
- os tokens da descricao precisam estar todos presentes, sem fuzzy destrutivo;
- o limite e 25 itens; lotes maiores falham fechados e nunca sao truncados;
- o preview mostra aba, data, descricao, antes/depois e valor total apenas
  informativo;
- nenhuma escrita ocorre antes de `sim`;
- os detalhes financeiros do preview ficam somente em memoria por 15 minutos;
  `state_store` recebe apenas chave opaca e contagem;
- reinicio ou expiracao perde o preview e cancela a escrita com seguranca.

## Execucao confiavel

Cada linha recebe chave filha idempotente. Antes da primeira escrita e antes de
cada linha, o snapshot atual precisa ser identico ao preview. Divergencia
interrompe o lote. Se uma escrita falhar depois de outras terem sido aplicadas,
as linhas anteriores sao restauradas em ordem inversa. Falha no rollback vira
estado `uncertain` e nunca produz mensagem de sucesso.

## Rollout e rollback

- padrao: `BATCH_MAINTENANCE_MODE=off`;
- canario: `BATCH_MAINTENANCE_MODE=canary` com
  `BATCH_MAINTENANCE_USER_IDS=<user_id exato>`;
- promocao global futura: `on`, ainda nao autorizada;
- modo invalido falha fechado para `off`;
- rollback operacional: executar o configurador com
  `BATCH_MAINTENANCE_CANARY_ACTION=disable` e reiniciar o PM2 com ambiente
  atualizado.

O utilitario `scripts/configureBatchMaintenanceCanary.js` resolve exatamente
um usuario `ACTIVE`, grava apenas modo/allowlist, preserva permissao `0600` da
`.env` e nao imprime o identificador.

## E2E automatico

`scripts/runBatchMaintenanceE2E.js`:

1. resolve exatamente um usuario ativo por lookup explicito;
2. usa banco de recibos SQLite temporario;
3. cria uma saida e um lancamento de cartao com marcador exclusivo;
4. executa preview e confirmacao pelo handler real;
5. verifica categoria nas duas abas e subcategoria na saida;
6. remove exatamente as linhas marcadas;
7. exige `cleanup=zero` e apaga o SQLite temporario.

## Evidencia local

- desenvolvimento TDD com RED por modulo ausente antes de cada implementacao;
- gate 6A final: `17/17`;
- regressao direcionada de roteamento/estado: `291/291`;
- suite integral: pre-gate `16/16` e baseline `848/848` antes da adicao final
  da politica; politica final repetida no gate `17/17`;
- `npm audit --audit-level=high`: zero vulnerabilidades;
- sintaxe e `git diff --check`: verdes.

## Decisao antes do deploy

`GO local`. O GO de producao depende de publicar o codigo, habilitar canario
para exatamente um usuario, executar testes remotos, reiniciar com health
verde, rodar o E2E real marker-only e confirmar limpeza total.
