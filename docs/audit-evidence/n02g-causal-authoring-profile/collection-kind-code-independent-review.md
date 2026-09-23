# Collection kind — revisão independente da aplicação

Candidato `b13724a2ef91e7f0a43ea287c60e89abda9ea5fd`.
Pai `64b6ad7f25d8b77cf4759d44f4d1f3f887b806a9`.
Conversa limpa, uma única solicitação:
https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab3af2a-0650-83e9-8c8d-a080f603d799

## Parecer recebido e alcance

APTO FOCAL. Sem achados críticos, altos ou médios. Hash, pai único e seis
arquivos alterados confirmados. Runtime metricDirectReads.js fora do diff.
Baixo/probatório: --check usa registros salvos e verifica arquivos/hashes,
não reexecuta suítes. Limite já declarado, não exige alteração causal.
Informativo: negativos sintéticos cobrem versão/unicidade/dispatch, mas não
cada assert isoladamente (role kind, node kind, payload.id, fingerprint).
Auditor não identificou nisso falha impeditiva deste recorte.

Fontes declaradas: página/patch imutáveis do commit, collection-kind-validation.json,
prepare-collection-kind-validation.cjs, authoringIndex.cases.js,
metricDirectReads.cases.js, runtime metricDirectReads.js, proposta JSON/plano,
delta de graphs-v2.json pelo patch, claims, evaluator registry, snapshot schema,
material registry, binding contract, snapshot manifest e três evaluator contracts.

Revisão confirmou estaticamente: autoria por ID+versão e role/identidade;
expected congelado antes dos handles/evaluator; oracle somente na comparação
funcional posterior; retirada de exatamente uma leitura invalida cobertura;
seis casos kernel de domínio correto e doze incorretos em populações 0/2;
composição explícita do corpus pai mais três adições, sem afrouxar pins.

## Confronto local e ratificação

Codex conferiu Git/pai e executou prepare-collection-kind-validation.cjs --check:
PASS. Evidência local: RED 2 FAIL/2 PASS, GREEN 4 PASS, afetados 211 PASS,
ampla 2.380 PASS/0 FAIL/10 SKIP; três arquivos causais ainda nos hashes testados.
Igualdade integral: candidato = pai + três required_reads/collection_name,
demais 73 grafos/todos os outros campos e dez fontes protegidas intactos.
Sonda diagnóstica separada: 73 seleções preservadas, correspondências 45 -> 48.

Auditor não executou checkout/Node/helper/suítes nem certificou TAP/tempos.
Não leu o raw integral de graphs-v2.json por limite de tamanho, nem recomputou
o hash do corpus; usou patch e lógica do helper. A conferência integral e
execução continuam evidência local, não reprodução externa.

Parecer confrontado e ratificado: correção focal collection kind encerrada.
Nenhuma repetição de ampla ou auditoria sem nova mudança causal/evidência.
Não concede GO do N02-G global, aceitação de grafo/host ou produção.
Próximo objetivo: diagnóstico dirigido de uma família dos resíduos existentes,
sem ampliação automática de escopo.
