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

Preparados também: schema fechado de claim de autoria, schema de metric
evaluator registry com estágios authoring/execution e proposta de identidade/
binding interno e público. Vinte checks estruturais em memória passaram;
não provam unicidade global, hash real, invocação, egress ou runtime.
Ainda ausentes: schema de grafo, registries completos, grafos 76/76 e revisão
independente integral. Políticas novas são propostas, não regras aprovadas.
Compiler/evaluator permanecem bloqueados até autoria/revisão integral.

Paths adicionais enumerados para a próxima edição documental:
- `docs/contracts/next/provenance-v2/type-and-identity-contract-v2.md`;
- `docs/contracts/next/provenance-v2/claim-contract.schema.json`;
- `docs/contracts/next/provenance-v2/metric-evaluator-registry.schema.json`.
São rascunhos sujeitos à revisão integral N02-F, não execução de registry.

Próxima ação: material field registry por kind, incluindo coleção e shapes de
membros das três coleções vazias a partir dos contratos; depois operator
registry tipado e schema de grafo, antes da autoria 76/76. Completar a proposta
de hash de derived_claim sem reordenar roles/pais. Reutilizar kernel/agenda/
canonicalValue sem segunda fórmula, sem modificar fonte/pin/fixture v1.

Telemetria: NAO_DISPONIVEL; último Status do coletor indicou running=false e
healthy=false. Não iniciar/reconfigurar coletor nem ampliar coleta nesta fatia.
Validação anterior da abertura: diff-check e agent-workflow OK. Nesta edição,
20/20 checks locais dos dois schemas, diff-check e agent-workflow OK.
Apenas documentos/JSON Schema, sem código/fixture/
dependência. Commit de progresso, não candidato integral de auditoria N02-F;
nenhuma suíte ampla repetida.

Codex → Astra → Alto → especificar os schemas/registries e bindings causais,
confrontando as lacunas do catálogo com todos os contratos aplicáveis.
