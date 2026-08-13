# Gate 41 — recuperação dos controles negativos

Data: 2026-08-12

## Escopo

Este candidato responde somente ao `NO-GO` estático emitido para o commit
`fecc5210556071fc48a8d2736fa5e8d459d78fc2`. O auditor considerou a lógica
defensiva, mas exigiu evidência focal explícita para controles negativos que o
manifesto 230 já declarava.

## Recuperação realizada

Em `tests/openFinanceHistoricalImportPlanner.test.js`:

- `existing_sheet_match` agora prova falha fechada quando a conta financeira da
  linha existente diverge da origem;
- `existing_sheet_match` agora prova falha fechada quando a data fica além da
  janela máxima de dois dias;
- `existing_sheet_match` agora prova falha fechada quando a descrição confirmada
  diverge da linha factual;
- `internal_transfer` agora prova falha fechada para débito originado em fonte
  não bancária;
- os casos novos e os casos positivos das duas decisões usam a identidade
  estável `source_ref` emitida pelo próprio planejador para indexar
  `decisionOverrides`, em vez do atalho por `transaction.id`.

Cada negativa exige `state=needs_review`, o motivo fechado correspondente e
nenhum caminho de escrita financeira. Nenhuma lógica de produto foi alterada
depois do primeiro parecer.

## Evidência local relatada

- `git diff --check`: verde;
- testes focais dos dois arquivos afetados: 48/48 verdes;
- a bateria histórica hermética anterior permanece 122/122 verde porque não
  houve mudança causal de produto depois dela; ela não foi repetida apenas para
  alterar testes focais;
- nenhum snapshot, nome, valor, conta, descrição ou decisão privada foi
  incluído no Git.

As contagens são evidência relatada pelo executor e não execução independente do
auditor.

## Alcance

O candidato continua autorizando somente fechamento técnico local. Permanecem
fora do escopo escrita histórica, cadastro de conta, ativação do writer,
importação real, deploy e produção.

## Critério da reauditoria

O Gate 41 recebe `GO TECNICO LOCAL` somente se o novo hash imutável confirmar
que os testes exercitam os módulos reais, cobrem todas as negativas requeridas
no primeiro parecer e preservam as fronteiras declaradas no manifesto 230.
