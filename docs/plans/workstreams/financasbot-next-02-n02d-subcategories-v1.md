# NEXT-02 / N02-D — Categoria e subcategoria explícitas

Estado: CANDIDATO IMPLEMENTADO E VALIDADO LOCALMENTE; AUDITORIA PENDENTE.
Parent funcional aprovado: `3bb1f93aeacecab547cc1402c9e04c01f6ddb5a2`.

## Objetivo e origem no roadmap

Fechar categoria/subcategoria da seção 9.2 do roadmap ratificado, reutilizando
kernel, read model e gateway N02-A/B/C. O v1 conserva categoria e subcategoria
separadas (`canonicalLedgerProjector.js`, projeção base e estornos); essa
semântica é reaproveitada, não seu runtime nem inferências por descrição.

## Contrato sintético delimitado

- Opt-in `next02-import-v4`, mantendo schemas/defaults v1/v2/v3.
- Catálogo v4 acrescenta `subcategories` com `{id, category_id}`. Dois níveis
  explícitos, sem árvore arbitrária, heurística ou subcategoria órfã.
- Payload v4 acrescenta `subcategory_id`, ID conhecido ou null (desconhecido).
  Se presente, precisa pertencer à categoria do evento. Eventos neutros não
  recebem subcategoria. A origem entra no hash e na provenance do evento.
- Refund e installment preservam a mesma subcategoria da compra vinculada;
  versões/tombstones continuam sendo resolvidos no snapshot corrente.
- Filtro de categoria soma seus eventos sem duplicação. Filtro de subcategoria
  pode ser usado sozinho; sua categoria é resolvida pelo catálogo confiável.
  Combinação categoria/subcategoria incompatível falha, não retorna empty.
- Subcategoria null continua incluída em totais da categoria/família, mas
  impede conclusão de ausência/zero em consulta específica quando o evento
  pode pertencer à subcategoria pedida no período/estado/escopo consultado.
- Gateway usa labels públicas únicas de subcategoria, nunca IDs internos.
  Claim devolve filtros públicos e preserva as lentes/estados da N02-C.
- O projetor interno puro de agenda N02-B não ganha schema novo; a relação
  de subcategoria é verificada na integração canônica compra/parcela.

## Validação e limites

RED inicial executado: schema v4 ainda não aceito (`read_model_input_invalid`).
Casos negativos implementados e executados: parent de subcategoria inexistente;
categoria/subcategoria incompatíveis; refund/parcela com subcategoria divergente;
null relevante tratado como empty; perda de provenance; mistura entre pessoas,
cartões, lentes ou estados; ID interno na boundary pública.

Testes cobrem somas e relações com valores coincidentes, correções de versão,
catálogo imutável e neutralidade. Regressões N02-A/B/C permanecem obrigatórias. Gate N02-D
vincula IDs à execução e o candidato ao parent/SHA; inventário continua fechado.
Revisão adversarial e afetados antes de uma única suíte ampla final; auditoria
independente obrigatória para encerrar a fatia.

Evidência: gate 57/57 (13 D), afetados 130/130, ampla única 1.986 testes,
1.976 PASS, zero falhas, 10 SKIP previstos, runner valid=true. Detalhes e comandos
em `financasbot-next-02-validation-v1.md`. Reuso permanece nos módulos existentes;
nenhuma substituição de runtime v1 ou otimização especulativa foi implementada.

Não alterar contratos/fixtures congelados para acomodar código. Não implementar
modelo NEXT-03, adapters/writers reais, produção, deploy ou dados privados.
Golden Set integral e motor de provenance continuam pendentes no NEXT-02.
Esta fatia não equivale a GO global do vertical.
