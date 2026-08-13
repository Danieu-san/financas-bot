# Gate 41 — transferência histórica explícita e linha já existente

Data: 2026-08-12

## Objetivo

Fechar duas ambiguidades privadas sem ampliar o catálogo operacional:

1. permitir que um débito bancário histórico, revisado individualmente, produza
   uma linha de transferência para um destino textual que não é conta ativa do
   bot;
2. permitir que uma transação histórica, revisada individualmente, seja marcada
   como já existente somente quando uma única linha factual da planilha comprova
   descrição confirmada, valor, proximidade de data e identidade do usuário.

## Arquivos do candidato

- `scripts/buildOpenFinanceHistoricalImportConfig.js`
- `src/openFinance/openFinanceHistoricalImportPlanner.js`
- `tests/openFinanceHistoricalImportConfig.test.js`
- `tests/openFinanceHistoricalImportPlanner.test.js`

## Fronteiras e controles

- as duas classificações novas são aceitas somente em `decisionOverrides`,
  indexadas por identidade estável de uma transação; regras amplas de comerciante
  não podem criá-las;
- `internal_transfer` exige destino textual explícito, débito de fonte bancária e
  destino diferente da origem; falhas permanecem em `needs_review`;
- o destino textual aparece somente no plano da linha histórica de
  `Transferências`; não cria `accountBinding`, não adiciona conta ao catálogo e
  não participa de saldo ou uso futuro;
- `existing_sheet_match` exige exatamente uma linha com descrição confirmada,
  mesmo valor absoluto, diferença máxima de dois dias, mesmo `user_id` e conta
  compatível quando a linha antiga possui esse campo;
- divergência de valor, usuário, conta ou multiplicidade mantém a transação em
  `needs_review` e não produz plano de escrita;
- toda saída do planejador preserva `financial_writes=0`.

## Evidência local relatada

- testes RED demonstraram que o configurador rejeitava as novas decisões e que
  o planejador não executava nenhuma delas antes da implementação;
- testes focais finais: 48/48 verdes nos dois arquivos afetados;
- bateria hermética histórica: 12 suítes, 122 testes verdes, zero falhas, zero
  skips;
- recálculo privado somente leitura: 11 decisões examinadas, sendo quatro
  despesas prontas, duas linhas existentes sem `write_plan` e cinco
  transferências prontas; `financial_writes=0`;
- o inventário privado manteve oito vínculos e nenhum vínculo novo para o
  destino histórico textual;
- nomes, valores, IDs, descrições privadas, snapshots, planos e decisões reais
  permanecem fora do Git.

As contagens acima são evidência relatada pelo executor local e não devem ser
tratadas pelo auditor como execução independente.

## Não autorizado

- escrita histórica na planilha;
- criação de conta financeira;
- ativação do writer histórico;
- deploy ou alteração de produção;
- inferência de destino ou de equivalência sem decisão privada explícita.

## Critério da auditoria independente

O candidato recebe `GO TECNICO LOCAL` somente se a inspeção do hash imutável
confirmar que os dois caminhos são estritamente individuais, falham fechados,
não cadastram destino operacional, não produzem escrita durante o planejamento
e que os testes exercitam o código real e os controles negativos declarados.
