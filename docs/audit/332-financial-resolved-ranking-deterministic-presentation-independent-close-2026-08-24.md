# ARQ-06 — apresentação determinística de ranking resolvido — fechamento independente

## Artefato auditado

- hash imutável: `4dbac7738b76e4160509fb80e0a7b114626bbab4`;
- pai causal: `b0e0c1965d460aee792d8ddfa4402ab150240b72`;
- candidato: `331-financial-resolved-ranking-deterministic-presentation-candidate-2026-08-24.md`;
- parecer independente:
  `https://chatgpt.com/c/6a8b9c5d-0c18-83e9-86a8-2e003fc868db`.

## Veredito

`GO TÉCNICO LOCAL`.

O auditor confirmou leitura integral do manifesto, do reasoner e da suíte
causal, além do diff completo contra o pai. A ramificação só atua em
`operation=rank` com plano resolvido, evidência `financial_query`, `read_only`,
autoridade `server`, cobertura `available|empty`, igualdade estável do plano e
vetor já calculado. Ela preserva o prefixo de dez itens sem ordenar nem
recalcular e retorna antes da reserva e do `fetch`.

O teste instancia a função real, oferece ao mock uma resposta invertida e exige
`fetchCalls === 0`. A resposta final continua passando pelo verificador de
adequação; writers e verificador não foram alterados.

## Achados e alcance

- crítico, alto e médio: zero;
- baixo: as rejeições individuais dos predicados fail-closed não foram todas
  parametrizadas no novo teste, embora permaneçam explícitas no código;
- lacuna indispensável residual: nenhuma para o GO local;
- as contagens locais permanecem evidência relatada, não execução do auditor.

Este GO autoriza artefato imutável com canário inicialmente `off` e exatamente
uma sequência controlada base + follow-up, condicionando o follow-up à promoção
da base e exigindo retorno imediato a `off` ao final ou diante de falha.
