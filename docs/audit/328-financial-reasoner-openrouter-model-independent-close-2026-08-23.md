# ARQ-06 — fechamento independente do modelo público do OpenRouter

Data: 2026-08-23

## Hash auditado

`551f6832ec0d802631101e0980ca8daf5059f70d`

## Veredito

`GO TÉCNICO LOCAL`.

O auditor confirmou leitura integral dos cinco arquivos causais no snapshot
imutável, incluindo o teste por faixas até o EOF, e verificou o catálogo e a
documentação oficiais atuais do OpenRouter.

## Achados

- crítico: zero;
- alto: zero;
- médio: zero;
- baixo: zero;
- lacuna indispensável residual: nenhuma.

## Conclusão causal

O slug `openai/gpt-4o-mini` é público e oferece Structured Outputs por JSON
Schema. O recovery troca somente o fallback do modelo, preserva
`provider.require_parameters=true`, schema estrito pós-evidência e a validação
determinística local. O teste instancia o construtor real sem override de
modelo e exige o default efetivo, o provider e o schema.

Não houve ampliação de conteúdo enviado, família, fonte, efeito ou writer. A
sonda HTTP 200 e as contagens locais permaneceram corretamente classificadas
como evidência relatada, não execução do auditor.

## Alcance autorizado

Fica autorizado:

1. atualizar somente o modelo privado para o slug auditado;
2. gerar e promover novo artefato com canário `off`;
3. executar uma única pergunta base;
4. executar o follow-up somente se a resposta base for promovida.

Qualquer fallback exige retorno imediato para `off`, sem repetição no mesmo
hash. O parecer não autoriza nova funcionalidade, novo dado, ampliação familiar,
efeito financeiro ou escrita.

## Conversa independente

<https://chatgpt.com/c/6a8b820c-d3d8-83e9-b669-2998483b1497>
