# Prompts de revisão independente — FinançasBot Next

Use o mesmo commit imutável nas duas revisões. Substitua `<COMMIT_SHA>` pelo
hash publicado e confirme que o revisor realmente leu o arquivo integral.

## Prompt comum para Chat e Claude

```text
MODELO_REVISOR → modelo mais capaz disponível → Alto → revisar adversarialmente
a arquitetura e o roadmap de reconstrução do FinançasBot.

Faça uma revisão independente e adversarial do roadmap do novo FinançasBot.
Não implemente código e não presuma que o roadmap legado deva ser continuado.
Não use como autoridade conclusões de outro modelo.

Repositório: https://github.com/Danieu-san/financas-bot
Commit imutável: <COMMIT_SHA>
Arquivo obrigatório:
docs/plans/workstreams/financasbot-next-roadmap-draft-v1.md

Antes do parecer, confirme o hash e declare que leu integralmente o arquivo.
Se não conseguir lê-lo por inteiro, responda ACESSO INSUFICIENTE e pare.

Contexto decisório:
- o produto atual acumulou cérebros, classificadores, verificadores e fallbacks
  concorrentes;
- queremos um produto novo em paralelo, preservando o legado até cutover;
- a IA deve interpretar perguntas, manter follow-ups e combinar tools de
  leitura livremente dentro de limites operacionais;
- código determinístico continua responsável por identidade, autorização,
  cálculos, verdade financeira e toda escrita;
- salvamento manual e proativo Open Finance deve ser preservado;
- o objetivo é reduzir complexidade emergente e ciclos infinitos de correção.

Avalie especificamente:
1. se reconstruir em paralelo é superior a continuar corrigindo o legado;
2. se a fronteira IA versus código está correta;
3. se o catálogo de tools é pequeno e expressivo o suficiente;
4. se o kernel financeiro/ledger proposto evita semânticas concorrentes;
5. se memória, follow-up e verificador mínimo estão bem delimitados;
6. se writers e fluxo proativo impedem duplicidade e escrita indevida;
7. se as fases, dependências e gates permitem entrega vertical rápida;
8. se a estratégia de migração/cutover protege a operação existente;
9. quais partes do legado devem ou não ser reaproveitadas;
10. riscos de custo, latência, privacidade, vendor lock-in e testabilidade;
11. o que está complexo demais e pode ser removido;
12. quais lacunas impedem começar NEXT-00.

Separe achados em CRITICAL, HIGH, MEDIUM e LOW. Para cada achado, cite a seção,
explique a cadeia causal e proponha a menor correção. Termine com um destes
vereditos: APROVÁVEL; APROVÁVEL APÓS AJUSTES; ou REPROJETAR.

Não dê GO de implementação, deploy ou produção. O parecer é apenas sobre o
roadmap.
```

No Chat, substitua `MODELO_REVISOR` por `Chat`. No Claude, substitua por
`Claude`. O restante deve permanecer idêntico para tornar os pareceres
comparáveis.

