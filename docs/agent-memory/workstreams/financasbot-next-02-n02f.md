# N02-F — checkpoint documental

Data: 2026-09-09. Estado: EM PREPARAÇÃO; nenhum GO da fatia.
Base: `ee5a0161f0c24a1c9a6a3c95a04e9da1eec4e91d`.
Branch: `codex/financasbot-n02f-provenance-20260909`.
Worktree: `.codex-worktrees/financasbot-n02f-provenance`.
Plano: `../../plans/workstreams/financasbot-next-02-n02f-v1.md`.
Contrato de preparação: `../../contracts/next/provenance-v2/authoring-contract-v1.md`.

CP-02 aprovado em b624b3d, recibo publicado na base. Continuidade autorizada
por Daniel; nenhum uso de produção, dados reais ou slot GitHub antigo.

Preparado: escopo/ordem N02-F e catálogo obrigatório de claim/grafo/canais.
Conferidos no contrato v1: 76 fact_keys únicos, 39 métricas, 27 refs distintas,
quatro unidades e formas de sujeito/período. Catálogo de campos observados das
14 coleções da fixture registrado; três coleções vazias exigem confronto com
contratos, não inferência automática de schema. Nenhum grafo gerado do oracle.

Ainda ausentes: JSON Schemas, registries completos, grafos 76/76 e revisão
independente integral. A política exata de claim_id e a representação
documental de executáveis futuros são decisões pendentes, não regras aprovadas.
Compiler/evaluator permanecem bloqueados até autoria/revisão integral.

Próxima ação: catálogo de campos materiais por kind, incluindo shapes de
coleções vazias a partir dos contratos; depois especificar identidade/binding
e representações declarativas. Reutilizar kernel/agenda/canonicalValue sem
segunda fórmula, sem modificar fonte/pin/fixture v1.

Telemetria: NAO_DISPONIVEL; último Status do coletor indicou running=false e
healthy=false. Não iniciar/reconfigurar coletor nem ampliar coleta nesta fatia.
Validação desta abertura: diff-check e agent-workflow OK. Só quatro documentos
novos/alterados, sem código/fixture/dependência. Commit de progresso, não
candidato integral de auditoria N02-F; nenhuma suíte ampla repetida.

Codex → Astra → Alto → especificar os schemas/registries e bindings causais,
confrontando as lacunas do catálogo com todos os contratos aplicáveis.
