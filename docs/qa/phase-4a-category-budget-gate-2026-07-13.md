# Gate da Fase 4A - Orcamento por categoria

Data: 2026-07-13

## Escopo

Conclusao dos sete passos oficiais de `4A - Contrato de orcamento por
categoria`: modelo e invariantes, testes adversariais, catalogo semantico,
calculo deterministico, perguntas read-only e reconciliacao com o orcamento
familiar global. A API e o dashboard v2 da 4B permanecem fora do escopo.

## Contrato e autoridades

- Alocacoes: `canonical_budget_allocations`, em centavos, por ciclo,
  categoria/subcategoria e escopo pessoal/familiar.
- Realizado: Query Engine/read-model existente, preservando a paridade com as
  fontes atuais e incluindo compensacoes canonicas negativas sem duplicar
  gastos ordinarios.
- Respostas: restantes, estouros e ritmo diario sao compostos a partir do
  contrato deterministico. Gemini nao calcula totais nem cria categorias.
- Ausencia: categoria sem alocacao nao equivale a teto zero; fonte canonica
  indisponivel nao equivale a realizado zero.

## Invariantes verificadas

- Soma do realizado por categoria igual ao total familiar explicavel do ciclo.
- Soma das alocacoes igual ao total das categorias alocadas e reconciliada com
  o orcamento global por alocado, nao alocado e excesso.
- Compra em cartao contada uma vez por competencia; pagamento de fatura neutro.
- Conta recorrente paga nao contada novamente como gasto livre.
- Transferencia neutra para consumo.
- Reembolso, refund e chargeback reduzem a categoria correta.
- Importacao conciliada nao duplica lancamento manual.
- Ciclos com inicio nos dias 28, 30 e 31 e virada de mes preservados.

## Privacidade e isolamento

O leitor canonico abre o SQLite somente para leitura, filtra eventos pelos
usuarios autorizados e resolve um unico domicilio antes de buscar alocacoes. A
consulta final exige simultaneamente `household_id`, tipo e id do escopo. Falta
ou ambiguidade de vinculo falha fechada. O contrato publico omite ids de pessoa,
familia e linhas internas.

## Evidencia local

- Teste integrado da Fase 4A: aprovado, incluindo uma alocacao de familia
  externa que deve permanecer invisivel.
- Testes focados: `284/284`.
- Suite completa: `769/769`.
- Auditoria de dependencias em nivel high: `0 vulnerabilities`.
- Verificacao de sintaxe: aprovada.
- `git diff --check`: aprovado, apenas avisos esperados de LF/CRLF.

## Decisao

`GO local` para a Fase 4A. Nenhuma flag, variavel de ambiente, planilha real,
dado financeiro real, dashboard ou API foi alterado. O GO de producao depende
de commit/push, deploy por fast-forward, testes remotos, saude do processo e
smoke read-only das tres perguntas. Depois disso, o proximo passo oficial e
`4B - API de dashboard v2`.
