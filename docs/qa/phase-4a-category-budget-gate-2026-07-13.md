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

## Decisao local inicial

`GO local` para a Fase 4A. Nenhuma flag, variavel de ambiente, planilha real,
dado financeiro real, dashboard ou API foi alterado. O GO de producao dependia
de commit/push, deploy por fast-forward, testes remotos, saude do processo e
smoke read-only das tres perguntas.

## Primeiro smoke de producao e hotfix

O primeiro smoke no WhatsApp, ja no commit `4336da1`, deu `NO-GO` nas tres
perguntas. A pergunta de restante manteve dominio e operacao, mas o plano do
Gemini removeu o filtro de categoria e a composicao contextual descreveu o
orcamento global como se fosse de Alimentacao. As perguntas seguintes foram
capturadas como follow-ups genericos e responderam ranking de gastos.

O hotfix torna o plano deterministico recebido do classificador autoritativo
para o dominio de orcamento, ignora follow-up generico quando a nova mensagem
traz sinal explicito de orcamento e desativa a composicao contextual para
categoria, subcategoria, status ou deteccao de estouro. Testes reproduzem a
sequencia real e uma resposta contextual adversarial. Evidencia apos o hotfix:
bateria focada isolada `284/284` e suite completa isolada `769/769`.

## Repeticao do smoke e fechamento

O hotfix `c38d4b2` foi publicado e implantado. Na segunda execucao manual pelo
WhatsApp, as tres perguntas chegaram aos intents corretos:

1. `Quanto resta do orcamento de alimentacao?` informou realizado de
   `R$ 458,58` e ausencia de alocacao, sem assumir orcamento zero.
2. `Quais categorias estouraram o orcamento?` informou corretamente que nenhuma
   categoria alocada estourou no ciclo.
3. `Qual o ritmo diario da categoria moradia no orcamento?` nao caiu em ranking,
   mas a mensagem ainda confundia categoria existente sem alocacao com categoria
   ausente do catalogo.

O ajuste final `2e22af7` separou esses casos na composicao deterministica. A
regressao exata passou localmente dentro da bateria focada `284/284`; no servidor,
`tests/financialAgent.test.js` passou `82/82`. O deploy por fast-forward terminou
com PM2 online, commit remoto `2e22af7`, WhatsApp pronto e health
`{"ok":true,"sqlite":true}`.

No reteste manual final, a pergunta de ritmo de Moradia respondeu que a categoria
nao tem alocacao definida no ciclo e, por isso, nao possui restante nem ritmo
diario definidos, sem trata-la como orcamento zero. Nenhuma pergunta escreveu
dados financeiros e nenhuma flag, `.env`, planilha, dashboard ou API foi
alterado.

## Decisao final

`GO de producao` para encerrar os sete passos oficiais da Fase 4A. O primeiro
`NO-GO`, o hotfix e o reteste ficam preservados como evidencia do gate. O proximo
passo oficial e `4B - API de dashboard v2`, ainda nao iniciado.
