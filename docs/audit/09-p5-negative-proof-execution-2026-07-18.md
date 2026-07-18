# P5 - confirmação da execução da prova negativa Google

Data: 2026-07-18
Escopo: execução local, isolada e sem rede, produção, Google, WhatsApp,
credenciais ou dados reais.

## Proveniência

O Chat revisou os arquivos públicos no commit imutável
`04199b94544ffe61b2eac6458fe8e75196b8ab00`, confirmou o hash completo e
classificou o manifesto e o harness como suficientes. As duas respostas
manuais recebidas convergiram em uma única condição residual: comprovar que os
três subtestes do harness passam no código revisado.

Antes da execução, a identidade dos artefatos foi conferida:

- `git diff --exit-code 04199b94544ffe61b2eac6458fe8e75196b8ab00 -- <manifesto> <harness>`: saída zero;
- blob do manifesto no commit e na tree executada:
  `2d49c83c4c7cec2a6e95abf471be5083527c7b72`;
- blob do harness no commit e na tree executada:
  `c48acad6a515e6313ac25640b4a58b3c6388899d`;
- SHA-256 do manifesto:
  `947E7299BE729A17C2BEE95007D2A79867859C391DFECEF070B352A823A81902`;
- SHA-256 do harness:
  `2B18F5929FF5DCDA75AC55BC59B5071A539E5E7427437B36D7DB366F4DA0C931`.

A execução ocorreu no HEAD
`ec391e8687e5f0e9f9df1b9ce33c878d903409d9`; os dois artefatos acima não
mudaram desde o hash revisado pelo Chat.

## Execução exclusiva

```text
node --check tests/auditGoogleNegativeProof.test.js
node --test tests/auditGoogleNegativeProof.test.js
```

Resultado:

- sintaxe: aprovada;
- testes contabilizados pelo runner: `4`;
- aprovados: `4`;
- falhas, cancelamentos, ignorados e pendentes: `0`;
- três subtestes internos: `3/3`.

Os três subtestes confirmaram:

1. mapa estático sobre 146 arquivos de `src`, com zero writers de revogação
   OAuth individual, um writer de revogação da membership familiar e zero
   caminhos Google/OAuth de recovery;
2. state com identidade alterada rejeitado pela rota real com HTTP `400`,
   snapshots inalterados e todos os onze tripwires posteriores zerados;
3. usuário não admin rejeitado após resolução real do remetente e dispatcher
   administrativo real, somente auditoria `denied`, snapshots inalterados e
   zero escrita de lifecycle, OAuth, membership, Drive, planilha ou auditoria
   administrativa de sucesso.

O diretório sintético criado pelo harness foi validado pelo caminho absoluto,
raiz temporária e prefixo `financas-google-negative-`, removido após o término
do Node e recontado. Resíduo final: `0`.

## Veredito

A condição residual apontada nas duas revisões independentes foi satisfeita.
A caracterização da prova negativa recebe `GO` e o P5 pode ser encerrado
tecnicamente. A conformidade geral permanece `NO-GO`, como já declarado no
critério do manifesto. O próximo estado permitido é somente a consolidação
final da reauditoria; este fechamento não autoriza correção, deploy, produção
ou uso de serviços reais.
