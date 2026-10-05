# N02-G — recibo do parecer focal de singleton de claimPath

Recebido de Daniel por mensagem em2026-10-04. Revisão documental externa,
não execução de código e não aprovação de implementação.

Resultado: `UNSATISFIED_MUTATION_WITNESS` confirmado para
`M-01#1#1 / binding_1` sob norma/corpus imutáveis atuais.
Candidato `9f232674602e3b528cfd07e61b65537c01a9e784`, parent único
`f892a35fce88fe21d474bd7ed408fe2697052ce7`; 1 commit,exatamente3 paths
adicionados,387 adições/0 deleções. Git local confirma identidade e paths.

Paths declarados integralmente lidos pelo auditor:

- `docs/plans/workstreams/financasbot-next-02-n02g-path-semantic-feasibility-decision-v1.md`;
- `docs/audit-evidence/n02g-causal-authoring-profile/path-semantic-singleton-witness.json`;
- `docs/audit-evidence/n02g-causal-authoring-profile/verify-path-semantic-singleton-witness.cjs`.

Auditor declarou também leitura integral de graphs-v2 pelo blob Git,claims-v2,
predicateTypes e confronto de claim-contract.schema,provenance-graph.schema,
operator-registry-v2 e operatorTypes. Capacidade efetiva declarada:
**GPT-5.6 Sol/raciocínio Alto**, sem confirmação de seletor6.1 e sem troca automática.
A capacidade declarada não transforma revisão documental em aprovação runtime.

Reconstrução estática externa:17 claimPaths resolvíveis; somente `period`
possui forma `period`,periodKind `month`. `period.kind` é scalar(enum),
`period.value` scalar(month). As28 localizações de chaves publicadas pelo
verifier incluem11 caminhos internos de operand_bindings não resolvíveis
como claimPath. O auditor não tratou a lista vazia declarada pelo verifier
como prova; confrontou a gramática,resolução e unificação nominal.
Codex confrontou identidade,period_eq,locator original e regra claimField
no witness imutável; não reivindica executar independentemente os17 paths.

Consequência: mantendo ramo claim,period_eq,claim/oracle e adendo v2,não há
locator alternativo distinto nominalmente compatível. O ID continua esperado
e UNSATISFIED. Não é retirada,supersessão,N/A,SKIP ou crédito por compiler RED.

Nenhuma solução foi aprovada. Falta proposta explícita e ratificada que escolha
corpus/modelo versionado com segundo locator authored nominal de período,ou
construção contrafactual isolada de path com autoridades e controles definidos.
Exceções source-state/A-B não se estendem por analogia.

Escopo limitado: não generaliza para outros730/2032 casos,não valida contagens
relatadas,WIP,código,G11/N02-G/NEXT-02,NEXT-03,deploy,produção ou dados reais.
Ampla histórica permanece RED2413 PASS/3 FAIL/10 SKIP; sem novas suítes neste recibo.
Nunca reenviar a auditoria desse hash. Próximo passo é decisão normativa nova,
sem implementação até ratificação; checkpoint registra capacidade necessária.
