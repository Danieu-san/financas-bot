# ARQ-06 — apresentação determinística de ranking resolvido — candidato

## Escopo

Este recovery fecha exclusivamente a variabilidade da segunda decisão do
raciocinador quando o servidor já resolveu um plano financeiro de `rank` e já
obteve evidência read-only autoritativa. Não altera classificação, escopo
familiar, seleção de fonte, cálculo, ordenação da fonte, verificador, writers ou
política de promoção.

## Evidência de produção que originou o recovery

O artefato `b0e0c1965d460aee792d8ddfa4402ab150240b72` foi promovido com o
canário desligado. Depois, uma única janela autorizada ativou somente os dois
membros familiares, domínio `expenses` e fonte `personal_sheet`, sem restart.
PID, SQLite e WhatsApp permaneceram saudáveis.

A pergunta-base `Quais foram os maiores gastos da família neste mês?` produziu
`candidate_answer`, uma leitura e evidência disponível, mas o verificador
classificou a resposta como inadequada por `wrong_result_order`. O usuário
recebeu o fallback vigente; o follow-up não foi enviado. O `.env` exato foi
restaurado, o runtime confirmou `mode=off` com allowlists vazias e o PID não
mudou. Não houve escrita financeira.

O mesmo ranking havia sido promovido em uma tentativa anterior sem mudança
causal no compositor ou no verificador. Portanto, a falha é compatível com
variabilidade da apresentação produzida pelo modelo, não com mudança da verdade
financeira nem com defeito do escopo familiar.

## Recovery

`financialIterativeReasoner` agora encerra deterministicamente apenas um plano
resolvido com `operation=rank` quando encontra no histórico uma evidência que:

- declara capacidade `financial_query`, modo `read_only` e autoridade `server`;
- possui cobertura explícita `available` ou `empty`;
- contém o mesmo plano completo, comparado de forma estável;
- contém um vetor de resultados já calculado pela fonte autorizada.

A resposta preserva o prefixo de até dez itens exatamente na ordem recebida e
formata somente rótulo, valor já presente e contagem já presente. Nenhum valor é
recalculado. Nesse caso não existe segunda chamada ao OpenRouter. Evidência de
outro plano, cobertura não comprovada ou autoridade diferente continua pelo
fluxo anterior e permanece sujeita ao verificador fail-closed.

A IA continua responsável pela interpretação onde ainda há decisão semântica;
a verdade financeira e a ordenação de um ranking já resolvido deixam de depender
de a IA obedecer uma instrução de apresentação.

## Provas locais

- RED focal: o mock do modelo devolveu o ranking invertido e a decisão final
  também ficou invertida antes do recovery;
- GREEN focal: o mesmo mock não foi chamado e a decisão preservou exatamente a
  ordem e os valores da evidência server-side;
- bateria causal `financialIterativeCanary`: `25/25`;
- testes públicos de base/follow-up e plano por categoria: `2/2`;
- suíte hermética ampla única: `1.832/1.822/0/10`, válida, zero falhas;
- cobertura ampla: linhas `91,78%`, branches `74,85%`, funções `91,23%`;
- `node --check` e `git diff --check`: verdes.

## Critério de auditoria e promoção

O candidato somente pode receber GO técnico local se a auditoria independente
confirmar que a apresentação determinística não aceita evidência não
autoritativa, não troca plano, não recalcula valores, não afrouxa o verificador
e realmente evita a segunda chamada de modelo.

Mesmo com GO, a produção deve receber artefato imutável com canário inicialmente
`off`. Autoriza-se depois exatamente uma sequência base + follow-up: enviar o
follow-up somente se a base for promovida, e restaurar `off` imediatamente ao
fim ou diante de qualquer falha.
