# N02-G — revisão documental de responsabilidade do estorno

## Primeira tentativa (2026-09-20)

Candidato: `614abbe9d5088ed756794f276a863fb34360948e`.
Pai confirmado pelo Git local/remoto:
`22e7616b7ed7cb984a26193d53f4fd736ae1c3f6`.
Chat GPT-5.6 Sol, esforço Alta, conversa limpa no projeto finançasBot.
Uma tentativa automática. Nenhum intersticial de segurança observado.

Veredito: **NÃO APTO para implementar; parecer limitado pelo acesso à fonte**.
Não é GO nem revisão independente dos dois grafos.

O auditor confirmou o hash pelo patch e a inclusão de um único documento.
Leu a proposta, refund_amount.json, graph-binding-contract-v1.md,
metricEffects.js e metricEffects.cases.js. Não conseguiu ler graphs-v2.json:
o leitor recusou conteúdo maior que 4.194.304 bytes. Não confirmou o parent
independentemente e não executou testes.

Achados e confronto local:

1. CRÍTICO: fonte central não acessível. Procede como limitação probatória;
   preparar extrato integral dos dois objetos, vinculado ao blob de origem,
   sem afirmar que isso equivale à leitura externa do arquivo integral.
2. ALTO: fundamento individual dos guards insuficiente. Procede: vínculo,
   mesma pessoa e aresta de pessoa têm referências normativas identificáveis;
   confirmed/expense no alvo não têm predicado explícito generalizador nesses
   grafos. A revisão passa a declará-los emenda normativa proposta, não regra
   já comprovada por fingerprint ou pelo código.
3. MÉDIO: aresta de pessoa condicional. Procede; proposta revisada fixa
   traversal do candidato à pessoa, leitura de id, checagem de kind/ID e uso
   na igualdade de pessoa, sem família/nome ou segunda travessia dispensável.
4. MÉDIO: negativos publicados de vínculo usam net_consumption. Procede;
   especificar matriz explícita refund_amount, contextos month e date, e
   comparação profunda da prova preservada contra o blob de base.

A direção conceitual não foi rejeitada, mas o auditor não aprovou implementação.
Não há GO adicional, contrato alterado, produção ou teste externo executado.

## Nova submissão

Permitida somente após nova evidência material e novo hash. Proposta revisada
e extrato não constituem, por si, parecer aprovado. Código local posterior ao
commit de base permanece fora deste pacote documental. A revisão seguinte
deve declarar o alcance real da leitura do extrato e da emenda semântica.
