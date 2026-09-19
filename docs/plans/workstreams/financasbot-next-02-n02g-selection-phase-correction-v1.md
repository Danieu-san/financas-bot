# N02G-SB-001 — seleção observada por fase

Estado: correção autorizada, candidata em validação; sem GO N02-G.
Base: `be520f4f0cf64812c80f0f4b9b8eefb2a5445189`.
Autorização: Daniel respondeu `sim` em 2026-09-18 à proposta de seleção apenas
em proof quando derivation consome operandos previamente vinculados.

## Objetivo e decisão

Fechar o HIGH do parecer focal do candidato
`856bc07272ac630c077492f1c1abb8ca1701e252` sem fabricar observação nem alterar
o esperado a partir do trace. A escolha por fase passa a depender da forma de
entrada, não de fact_key ou nome de métrica. A regra normativa completa está
em graph-binding-contract-v1.md §4; o validador a confere independentemente
das listas autoradas de required_selections.

Inventário: seis grafos têm selected_set prebound por roles node e nenhum
node_set candidato correspondente: S-16#1#1, M-04#1#1, M-04#1#2, M-05#1#2,
M-05#1#3 e M-05#1#4. Neles somente derivation.required_selections e
derivation.selected_nodes passam a vazios. As 76 fases proof, predicates,
selections, sets, nodes, edges, claims e reads ficam intactos. Os demais 70
grafos não mudam. Um resultado de seleção vazio em outro grafo continua
exigindo a execução de seleção; não equivale a ausência de operação.

## Escopo fechado

Contrato de binding e referências normativas correlatas; seis registros de
graphs-v2; graphStructure e testes afetados; este plano e checkpoint.
Não alterar evaluator, fórmula, oracle, fixture, snapshot, registry, schema,
recorder, proxy, compiler de acesso, proofAcceptance, dependência ou produção.
O comparador de seleção existente já rejeita eventos de seleção não ligados;
os novos testes comprovam isso sem criar filtro de eventos.

## Invariantes e verificação

- Proof continua exigindo toda seleção autorada e cobertura de cada candidato.
- Derivation com node_set candidato continua exigindo seleção e cobertura dos
  excluídos; não admite apagar a obrigação só para passar no gate.
- Prebound conserva reads/nodes dos operandos consumidos e a prova da escolha.
- Nenhuma segunda autoridade de roles: o claim referencia os roles do registry;
  esta regra usa somente os bindings já admitidos, sem redefini-los.
- Mais de um role candidato ou ausência de binding suficiente falha fechado.
- A fase do recorder é autoridade de execução; proof não satisfaz derivation.
- A aceitação integral e os recibos de parents continuam pendentes no N02-G.

REDs observados antes da correção: STRUCTURE-007 rejeitou a autoria prebound
corrigida (trace_selected_nodes); STRUCTURE-008 não rejeitou a remoção de reads
de candidato excluído em derivation. Após a correção, os oito testes
estruturais passaram. Onze testes focais passaram, incluindo as 21 execuções
direct metric, quatro candidatos de source_coverage em proof, evento extra em
derivation e distinção entre nenhuma seleção e seleção com resultado vazio.
Esses números são execução local, não parecer independente.

Bateria N02-G integrada posterior: 265/265 PASS, zero FAIL/SKIP/TODO,
63,80 segundos. Syntax checks, diff check e agent-workflow OK. A extração
compacta em docs/audit-evidence/n02g-selection-phase contém seis registros
(12.930 bytes), fixa o parent e mede os documentos; seu verifier confronta
integralmente os 76 grafos com a base, admitindo exclusivamente os dois campos
derivacionais dos seis registros. Positivo e sete adulterações negativas PASS.
Inclui controles para alteração de proof, nó, inventário, duplicata, read/nodes,
retorno da seleção derivacional e mudança de claim. Isso prova preservação,
não GO arquitetural. Hash de subobjeto é JSON.stringify do valor parseado,
distinto do hash integral dos bytes do documento.

## Próximos gates

Revisão adversarial local e bateria N02-G afetada; uma única suíte ampla final
para o candidato estável; commit sanitizado e auditoria focal imutável. Não
repetir a auditoria dos 76 grafos inteiros: fornecer seis registros compactos
com hashes e verifier da preservação do restante para evitar esgotar contexto.
Não declarar fechado antes do retorno independente. NEXT-03/deploy/produção e
dados reais continuam bloqueados. Checkpoint registra execução ampla pendente
ou iniciada para continuidade sem repetir suíte.

## Resultado da primeira suíte ampla e separação causal

A primeira suíte ampla terminou estruturalmente válida, mas não verde:
2.258 testes, 1.756 PASS, 492 FAIL e 10 SKIP. Na retomada em outro Windows, os
logs temporários integrais não estavam disponíveis e a suíte não foi repetida.
Uma amostra dos grupos registrados reproduziu falhas de read model/agente por
ausência do binding nativo `better_sqlite3.node` na instalação local.

Os arquivos causais dessa amostra são idênticos ao HEAD-base e não importam o
motor N02-G. O bloqueio está classificado como ambiente/dependência local, sem
evidência de regressão N02G-SB-001. Antes de qualquer nova suíte ampla,
restaurar apenas o binding local, sem mudar manifests, e executar os testes
afetados. Uma nova suíte ampla final somente se torna elegível após essa
correção causal e a bateria afetada verde.

## Evidência posterior no Node contratual — 2026-09-18

SQLite realinhado localmente; Node 22.17.0 e dados ICU/tz/CLDR/Unicode conferem
com executionProfile. Runner com reporter TAP explícito (RED seguido de
12/12 PASS focais). Ampla posterior: 2.258 testes, 2.233 PASS, 15 FAIL,
10 SKIP esperados, valid=true, exit_status=1, 495.466 ms. Continua vermelha.

Seis failures são inventários antigos não ampliados; quatro envolvem fixtures
Open Finance expiradas pelo relógio real. Cinco N02-G foram isolados em teste
causal: 0/5 PASS com ambiente hermético tanto com quanto sem cobertura; 5/5
PASS com cobertura após preload diagnóstico que retira NODE_OPTIONS visível
depois da instalação do tripwire. O runner injeta essa variável, enquanto o
adaptador de timezone a rejeita. Não atribuir a falha à ordem de testes.

O diagnóstico não modifica o contrato de timezone nem a proteção do runner.
Próxima ação é reconciliar essa fronteira com RED causal, preservando proteção
de descendentes e recusa de overrides não confiáveis. Inventários e Open
Finance são pendências distintas, fora do delta normativo de seleção. Nenhuma
nova ampla antes de correção causal com testes afetados verdes; auditoria
independente e commit sanitizado continuam pendentes. Detalhes e limitações
registrados no checkpoint do workstream.

## Integração de validação autorizada — 2026-09-19

Daniel autorizou corrigir a integração runner/timezone. Escopo complementar:
runner, tripwire, gerador puro de opções Node compartilhado, fixture de
subprocessos e testes do runner. O preload consome somente a representação
exata de suas opções, após instalar as proteções e capturá-las para filhos.
Opções adicionais permanecem visíveis; adapter/profile de produto intactos.
REDS e casos de propagação/recusa estão detalhados no checkpoint.

Runner 15/15 PASS; bateria causal sob o ambiente real do harness e cobertura:
284/284 PASS, sendo 265 N02-G, 15 runner e quatro inventário. Zero skips,
failures ou TODO. Syntax e revisão local concluídos. Uma ampla final é agora
elegível pela mudança causal do preload e necessária para conferir o impacto
nos demais testes; comparar com as dez pendências conhecidas sem mascará-las.
Ao iniciar, parar acompanhamento. Commit sanitizado e auditoria independente
continuam pendentes; estes resultados não concedem GO global.

## Correção das pendências de regressão autorizada — 2026-09-19

Ampla pós-harness: 2.261 testes, 2.241 PASS, 10 FAIL, 10 SKIP esperados,
valid=true, exit_status=1. Daniel autorizou prosseguir nas seis falhas de
inventário e quatro temporais com `trocado. prossiga`.

Escopo complementar: `financasBotNext02ValidationPolicy.js`, seus seis
consumidores de teste, `tests/next02DevelopmentInventory.test.js` e testes
financialStateMachine/openFinanceIncomeSaveProposal/openFinanceProactiveIncomeRefund.
Não se alteram pins de código revisado, serviços financeiros ou retenção.
Os relógios são fixos por teste. O inventário de desenvolvimento valida os
15 paths revisados e os 29 pendentes sem admitir os últimos: emite sempre
releaseEligible=false. O validador estrito de release permanece na API antiga
e continua rejeitando o candidato N02-G ainda incompleto.

RED da API ausente observado; quatro novos controles PASS após implementação.
Dez casos originais 10/10 PASS. Bateria causal sob cobertura e proteção de rede:
267/267 PASS nos onze entrypoints afetados, zero falhas/skips/TODO. Preservada
a evidência anterior N02-G 265/265, sem repetir sem mudança causal nesse motor.
Uma ampla final agora é elegível; pausar acompanhamento ao iniciar. Commit e
auditoria independente continuam pendentes. O verde de desenvolvimento jamais
substitui a revisão de admissão dos módulos pendentes ou o gate executável.

## Ampla verde e revisão focal pendente — 2026-09-19

Ampla final: 2.265 testes, 2.255 PASS, zero FAIL/cancelados/TODO, 10 SKIP
esperados, valid=true, exit=0. Cobertura global 92,25%/77,74%/92,48%
(linhas/branches/funções), 361.254 ms. Revisão local não exigiu mudança
posterior de código/testes; reutilizar a evidência verde.

Pacote compacto em `docs/audit-evidence/n02g-selection-phase/`: auditoria
dirigida, resultado local, manifesto dos blobs, patch auxiliar e verificador
de preservação. O pedido de auditoria abrange também o suporte de validação
acrescido com autorização de Daniel. Estado: candidato aguardando auditoria;
nenhum GO integral, deploy ou admissão dos módulos em desenvolvimento.
