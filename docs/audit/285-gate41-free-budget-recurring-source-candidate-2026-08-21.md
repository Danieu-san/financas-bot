# Gate 41 — candidato de verdade do gasto livre na entrada pública

Data: 2026-08-21

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

## Problema observado em produção

Depois da promoção do hash `ec2219f131ed29933dd093967eacb093dc661ea0`,
a pergunta real `quanto resta do meu gasto livre?` respondeu gasto no ciclo de
R$ 1.256,81. Uma reprodução somente leitura com os mesmos módulos e fontes da
release mostrou que R$ 150,00 vinham de uma saída correspondente a conta
recorrente cadastrada.

O motor já excluía pagamentos recorrentes quando recebia o catálogo `Contas`,
mas a entrada pública carregava essa aba somente para intents de contas. As
intents de orçamento carregavam saídas, cartões e configurações, porém passavam
catálogo vazio ao mesmo motor. A política aprovada exige recorrentes
cadastrados fora do gasto livre.

## Mudança causal

`messageHandler` inclui `Contas!A:I` nas leituras somente quando a intenção já
exige orçamento ou pertence ao conjunto preexistente de consultas de contas.
A ordem de leitura e o cursor de montagem de `dataSources` permanecem os
mesmos. Não há escrita, nova classificação, memória automática de
estabelecimentos ou alteração na política de elegibilidade.

## Prova causal

O novo teste atravessa `handleMessage` pela pergunta pública, com uma saída
flexível avulsa de R$ 20,00 e uma saída de R$ 150,00 que corresponde a conta
recorrente ativa. Ele exige simultaneamente:

- leitura de `Contas` no contexto da planilha pessoal do usuário;
- gasto livre no ciclo de R$ 20,00;
- ausência do total incorreto de R$ 170,00.

Evidências locais:

- syntax check dos dois arquivos: verde;
- teste focal público: `1/1`;
- bateria causal de elegibilidade: `6/6`;
- alerta por cartão mais pergunta pública: `2/2`;
- suíte hermética ampla única: 1.757 testes, 1.742 aprovados, cinco falhas e 10
  skips, cobertura de linhas 91,60%;
- as cinco falhas ficaram exclusivamente em
  `userStateSnapshotSecurity.test.js`, sem interseção com o diff;
- a suíte protegida oficial, repetida isoladamente e serial logo após a
  bateria ampla, passou `14/14`, incluindo exatamente os cinco casos que haviam
  falhado. A bateria ampla não foi repetida sem mudança causal.

As contagens são evidência relatada e não execução do auditor.

## Arquivos para leitura integral

1. este manifesto;
2. `src/handlers/messageHandler.js`;
3. `tests/financialStateMachine.test.js`;
4. `src/query/financialQueryEngine.js`;
5. `src/utils/freeBudgetEligibility.js`.

## Questões de auditoria

1. A entrada pública passa a fornecer o catálogo recorrente exigido pelo motor
   sem ampliar leituras fora de intents de orçamento ou contas?
2. A ordem de `sheetReads` e `nextSheetIndex` continua causalmente consistente
   em todas as combinações de transferências, contas, metas e orçamento?
3. O teste usa a entrada pública e falharia se `Contas` deixasse de ser lida?
4. A evidência focal e o `14/14` isolado sustentam que as cinco falhas da bateria
   ampla são residuais não causais, ou existe lacuna indispensável antes do GO?

## Limite

Este candidato não autoriza promoção sozinho. Exige auditoria independente por
hash imutável. Se aprovado, deve ser promovido por novo artefato OCI, seguido
de health, pergunta real e confirmação de que o total cai de R$ 1.256,81 para
R$ 1.106,81 sem inclusão de categorias essenciais ou recorrentes.
