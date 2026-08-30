# Prompt focal final — FinançasBot Next draft v2

Substituir `<COMMIT_SHA_V2>` pelo hash publicado. Chat e Claude devem receber o
mesmo texto, mudando apenas o nome da primeira linha.

```text
MODELO_REVISOR → modelo mais capaz disponível → Alto → verificar focalmente o
fechamento dos achados do FinançasBot Next draft v1.

Faça uma reauditoria focal e independente. Não reprojete por preferência e não
implemente código. Verifique se cada achado anterior foi realmente fechado e se
as correções introduziram contradição material.

Repositório: https://github.com/Danieu-san/financas-bot
Commit imutável: <COMMIT_SHA_V2>
Arquivos obrigatórios:
- docs/plans/workstreams/financasbot-next-roadmap-draft-v2.md
- docs/plans/workstreams/financasbot-next-roadmap-review-resolution-v1.md

Confirme o hash e a leitura integral dos dois arquivos. Se não conseguir,
responda ACESSO INSUFICIENTE e pare.

Verifique especialmente:
1. Observation -> CanonicalEvent -> Projection e prevenção de realimentação;
2. decisão de autoridade do ledger;
3. single writer/notifier com lease/fencing;
4. proposal_id, TTL, CAS e versão da observação;
5. claims quantitativos produzidos pelo kernel;
6. política de falha do verificador;
7. whitelist de regras aprendidas;
8. lifecycle Calendar/reminders;
9. NEXT-08 dividido por domínio e matriz beta/cutover/retirement/pós-MVP;
10. manifest de integrações e Model Data Boundary;
11. três baterias independentes;
12. estabilidade/cutover objetivos;
13. tombstone, backup e restore;
14. dashboard v2 e WhatsApp usando a mesma verdade;
15. gasto por categoria preservado como primeiro vertical;
16. concorrência manual versus proativa.

Para cada achado original, marque FECHADO, PARCIAL ou ABERTO e cite a seção.
Liste novos achados somente se forem causalmente introduzidos pelo v2.

Veredito final: APROVÁVEL ou AINDA REQUER AJUSTES.
Não dê GO de implementação, produção ou deploy.
```

