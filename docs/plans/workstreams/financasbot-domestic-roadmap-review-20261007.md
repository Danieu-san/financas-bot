# FinançasBot — revisão do roadmap doméstico, original primeiro

Data local: 2026-10-07.
Estado: revisão global autorizada por Daniel; trava operacional autorizada;
proposta de ordem/escopo abaixo EM REVISÃO, não substitui normas ratificadas.

## Objetivo e base

Controlar as finanças da casa de Daniel. Aproveitar o bot anterior em tudo que
funciona e alterar somente o necessário: premissa original reafirmada por Daniel.
A reavaliação do produto acontece agora, não depende de terminar N02-G.
Não construir uma plataforma bancária genérica como objetivo implícito.

### Robustez conversacional é objetivo central, não excesso opcional

Daniel reafirmou que o Next nasceu para corrigir perguntas imprecisas,
perda de contexto em follow-ups e baixa capacidade de compreensão do original.
Uso doméstico limita abrangência do produto; NÃO limita exatidão, compreensão
ou confiabilidade. "Menor delta" significa menor mudança que satisfaça
INTEGRALMENTE a qualidade alvo, não menor arquitetura independentemente do resultado.

Preservar o que funciona é reaproveitar comportamentos demonstrados, não
conservar o teto de qualidade do legado. Paridade com resposta errada, contexto
perdido, heurística frágil ou recusa de pergunta suportada não é aceitação.
A presença de código/testes e um verde histórico não demonstram adequação ao Next.

O roadmap ratificado já prevê IA conversacional única, tools combináveis,
kernel determinístico, claims/evidência e testes separados de conversa,
propriedades e falhas de estado. Esses mecanismos devem ser avaliados pelo papel
causal na qualidade; não descartados por aparência de complexidade. Tampouco
novos controles se justificam só pelo rótulo "robustez": identificar a classe
de falha real, o controle e a prova de que a resolve.

Confronto de qualidade por capacidade, usando primeiro o Golden Set/replays
e regressões existentes, sem criar contagens/gates paralelos:

- Valores exatos para pessoa/família, categoria, conta/cartão, período e base
  temporal; neutralidade e ausência de dupla contagem preservadas.
- Perguntas equivalentes e combinações suportadas de ferramentas produzem
  respostas factual e semanticamente coerentes, não dependentes de frase exata.
- Follow-ups mantêm referentes e filtros pertinentes; mudanças explícitas de
  pessoa/período/categoria e correções substituem somente o contexto devido.
- Troca de assunto, contexto ausente/obsoleto e ambiguidade são tratados
  explicitamente; não inventar fatos nem responder com filtro herdado errado.
- Zero, incompleto e indisponível continuam distintos; recusa segura não
  substitui capacidade de responder perguntas suportadas com dados suficientes.
- Estado, restart/falhas e isolamento não permitem mistura de usuários/fontes;
  nenhuma melhora conversacional amplia autoridade de escrita.

Aceitação mantém os invariantes críticos100% onde o contrato já os exige,
qualidade superior ao legado e limites de custo/latência ratificados. Os casos
acima dirigem o confronto, não alegam que tenham sido executados agora.
Se um componente legado não satisfaz isso, justificar adaptação/substituição;
se um controle do Next é necessário, preservá-lo mesmo que custe mais.
Auditorias/gates incompletos não podem ser dispensados por esta clarificação.

Worktree documental atual: `n02g-month-profile-code-audit-20261004`, branch
`codex/n02g-month-profile-code-20261004`, base
`04eb9545516d100aa45e1ac6d8ebfda444fafbd7`; WIP/índice não integrados.
Raiz original consultada por metadados e recortes de código/testes nesta revisão:
`E:/Users/horus/Documents/FinancasBot/financas-bot`, `main`, HEAD
`e00f6ebcf97e6bfdb2b7791939c22e879917f3f0`, 54 entradas locais no status.
Isso NÃO é comprovação de versão/saúde de produção. Não alterar essa raiz, não
sobrescrever WIP e não assumir que o produto atual ainda é o hash histórico98e3d6a.

## Fontes existentes: não começar do zero

- `financasbot-next-roadmap-ratification-v1.md`: roadmap aprovado em
  `911af93343210ccfe2d7b7fe0b898542044a1fdf`; texto auditado preservado.
- `financasbot-next-01-topology-reuse-v1.md`: inventário prévio de ativos e
  caracterização82/82 naquele snapshot; adaptação/extração de comportamentos
  e testes, sem importar efeitos/autoridades do legado no Next.
- `financasbot-next-02-kernel-reuse-v1.md`: reaproveitamento do projector,
  neutralidade de transferências/faturas, replay e agendas; rejeita conversão
  de valor inválido em zero e matching heurístico como autoridade.
- `docs/agent-memory/architecture-map.md`: índice para localização, não prova
  de uso atual. Roadmaps familiar mestre/passo a passo são histórico preservado.
- `docs/agent-memory/workstreams/financasbot-n02g-scope-reconciliation-20261007.md`:
  evidência de N02-G e ausência de fechamento global; nenhum percentual confiável.

Esses inventários já feitos serão confrontados por delta com o código original
efetivamente examinado. Não repetir suites verdes apenas para preencher ficha.

### Primeiro confronto consumer-first do original atual

Inspeção estática dirigida: oito arquivos medidos, imports/declarações e
recortes de interfaces, não leitura integral nem execução. Nenhum dos oito
apareceu alterado no `git status` dirigido; os54 WIP externos foram preservados.

| Capacidade | Cadeia existente encontrada | Evidência/testes localizados; próximo confronto |
| --- | --- | --- |
| Consultas de gastos/orçamento | messageHandler → calculationOrchestrator → financialQueryEngine; financialAgentTools também usa o engine | unit/financialAgent/categoryBudget/dataQualityService e paridade; caracterizar contrato público e comportamento antes de recriar engine |
| Compra/competência/parcelas | financialQueryEngine e canonicalLedgerProjector usam canonicalInstallmentSchedule | canonicalInstallmentSchedule/canonicalInstallmentParity/canonicalLedgerProjector; aproveitar causas e separar normalização permissiva de regra financeira correta |
| Dashboard | dashboardServer → dashboardV2SummaryService → financialAgentTools | dashboardV2SummaryService/dashboardApiContracts; preservar UX e identificar delta de verdade compartilhada |
| Importação | messageHandler e documentOcrImportService usam statementImportService | statementImportService/financialStateMachine; mapear preview/confirmação/replay, sem transformar todos formatos em obrigação nova |
| Lembretes/agenda | scheduler existente localizado; consumidores específicos ainda por confrontar | schedulerJobs presente; não afirmar uso ou sucesso de produção por existência |

O arquivo `tests/financialQueryEngine.test.js` não existe nessa raiz, mas a busca
por imports encontrou testes do engine nos arquivos acima: ausência desse nome
NÃO é falta de cobertura. Não executar testes apenas para repetir caracterização
histórica; primeiro comparar conteúdo e fronteira com a evidência existente.

SHA256 dos arquivos originais examinados (snapshot local, não release produtivo):

- canonicalLedgerProjector: `f38ca2cb0862008419b0bae6cf750c99f8c7e93046d15bebf5f708d34fb07d34`
- canonicalInstallmentSchedule: `4a5fe33bb08bc8e958d7d4b1166d226c429a304d021381c2eddb93c4d4cfba6f`
- calculationOrchestrator: `1dfdac7e9e8252e560331a9092b6284ba33a7f8c033f11fa25e0738b5c8d50ea`
- financialQueryEngine: `34cc7774cf0dae80e7b32590f6cdd81b1de66a466115fd8ac4c25cfd2954b9ec`
- dashboardV2SummaryService: `7b738f10f54ae1d1791e3f19f0621656f7dba5b421697e274cf078ac368f77b4`
- statementImportService: `5e77d1defc8884c92ae9373dbe1bd4d028f6e897429012715d841a68517afd07`
- scheduler: `69cd1e7f82ffe6466b42f54797023d5f0c78b84b5a15c68ffff259c45282e73a`
- messageHandler: `1797fa3c3717360fadae7dee89bca75521608ca4dbd14af003f3eeb64464f503`

Esse mapa confirma ativos/consumidores existentes, não aprovação para importá-los
nem afirmação de que todos funcionam corretamente. Por ora, nenhuma capacidade
recebeu decisão definitiva de substituição ou retirada.

## Confronto de confiabilidade: resultado da inspeção dirigida

Leitura estática adicional em 2026-10-07; nenhuma suíte ou conversa executada.
O objetivo não é escolher entre robustez e simplicidade, mas retirar trabalho
sem relação demonstrável com o produto e manter controles que corrigem falhas.

| Classe de falha / necessidade | Original: ativo reaproveitável | Next: controle necessário | Evidência e lacuna real |
| --- | --- | --- | --- |
| Valor errado ou dupla contagem | Projector, engine, parcelas, neutralidade e testes de paridade já inventariados | Kernel determinístico, centavos íntegros, vínculos explícitos e total verificável | canonicalValue recusa coerção; observationKernel valida amount_minor seguro; expenseReadModel acumula BigInt e recusa overflow. Manter controles. Existência não fecha G07/G08/G11/G14 |
| Zero falso ou dados insuficientes | Dashboard distingue available/fallback/partial/unavailable; preservar semântica e UX | Cobertura/evidência ligadas ao claim; vazio, zero e indisponibilidade distintos | readConsumption exige cobertura do período e separa empty/zero/value. Necessário à precisão doméstica, não generalidade bancária |
| Compreensão dependente de frase conhecida | Perguntas/regressões e classificação local como base de comportamentos | IA conversacional, plano tipado, tools combináveis e verificação factual | conversationGateway recebe planInput, não texto. Replay observado injeta planos; não demonstra compreensão natural |
| Follow-up com filtro/referente errado | Contexto por remetente com TTL de5min e casos existentes; conservar comportamentos úteis | Contexto registrado válido, referente, mudança explícita de dimensões e ambiguidade tratada | Original deriva planos por regras de frase. Next faz merge e CAS. Falta provar os8 cenários do Golden Set em texto e sequência, incluindo limpar filtro incompatível |
| Contexto obsoleto, conflito ou restart | Separação do contexto analítico do fluxo de escrita e testes correspondentes | Sessão durável/versionada, validade temporal e identidade servidor | memorySessionStore é esqueleto em Map com CAS, sem TTL/persistência. Não é nova arquitetura: sessão durável já consta no contrato de conversa |
| Mistura de pessoa/família ou resposta sem lastro | Guardas de escopo e testes de isolamento | trustedContext, claims tipados, confronto de escopo/metric/período | Gateway verifica identidade e claim antes de salvar contexto. Preservar; esses testes não demonstram integração em canal real |
| Regressão em importação/interface/lembretes | Preview, duplicidade exata/possível no importador; dashboard via queryTool; contas/agenda/resumos no scheduler | Adaptadores da operação usada, confirmação e reconciliação para escrita | Ativos existem. Scheduler inclui OAuth/admin: não copiar inteiro. Preview não prova commit idempotente; confrontar consumidor antes de mudar |

### Limites dos testes encontrados — não confundir os níveis

- A bateria original avalia classificação/plano local e usa
  createSyntheticPreviousContext nos FUP. Não executa conversa completa com
  resultados financeiros entre turnos. normalizeActualTimeBasis devolve context
  quando o caso o espera e existe plano; isso isolado não comprova a base
  temporal concreta herdada.
- O replay NEXT-01 observado verifica ferramenta/claim/contexto/CAS com planos
  estruturados. É útil para essa fronteira, não mede compreensão do texto nem
  composição multi-tool pela IA.
- O validador Golden verifica corpus, rastreabilidade, dimensões e fatos
  materializados independentes.48casos/56turnos não significam48 conversas
  executadas. NEXT-02 registra23queries+5recusas em7propriedades, não28
  conversas naturais.
- A qualidade ratificada exige100% das assertions factuais e nenhuma conversa
  com erro material. Não reduzir a meta nem preencher essa lacuna com mais
  verdes de mecanismos que medem outra fronteira.

Fontes: original src/handlers/messageHandler.js (sanitização/armazenamento/
derivação do contexto e rota pergunta), tests/unit.test.js e
scripts/runFinancialQueryAcceptanceBattery.js; Next
src/next/conversation/conversationGateway.js,
src/next/session/memorySessionStore.js,
src/next/kernel/{canonicalValue,observationKernel,expenseReadModel}.js,
tests/next/conversationReplayRed.cases.js,
tests/fixtures/financasbot-next/golden-conversation-set-v1.json,
scripts/agent/validateFinancasBotNextGoldenSet.mjs;
contratos quality-stability-retention-contract-v0.md,
conversation-proposal-contract-v0.md e reconciliação NEXT-02 existente.

Achado a caracterizar, NÃO bug runtime confirmado: a whitelist de contexto
analítico original não inclui timeBasis, mas a derivação posterior consulta
previousParams.timeBasis. Não corrigir por suposição nem portar silenciosamente;
confrontar cadeia/contrato na etapa autorizada. Similarmente, F03 exige troca
conta→cartão sem filtro incompatível herdado; o merge do esqueleto não prova
essa semântica. São classes de aceitação existentes, não autorização para novos
helpers ou IDs normativos.

### Reconciliação N02-G com o produto doméstico

Fonte normativa lida: financasbot-next-02-n02g-v1.md, §§2/8; censo preservado
financasbot-n02g-scope-reconciliation-20261007.md. A distinção é importante:
o charter exige39evaluators/76grafos históricos, mas declara que isso NÃO abre
tools/adapters de domínios futuros. Portanto,39evaluators não são39 novas
funcionalidades bancárias. O excesso comprovado até aqui é a condução por
microfatias sem fechamento de classe; não há base para chamar toda proveniência
de desperdício nem cortar todos os testes do corpus.

| Fronteira | Necessidade doméstica protegida | Evidência / pendência censada | Tratamento proposto, sem waiver |
| --- | --- | --- | --- |
| G07: compiler/IR/obrigações | A consulta mede os dados/filtros/base temporal que declara, não uma seleção diferente |76 baselines históricos positivos; aceitação integral no candidato/autoridade vigente não demonstrada | Reutilizar compiler/corpus. Confrontar vínculo entre fonte, programa e claim uma vez por candidato completo; não recriar compiler ou somar verdes locais |
| G08: execução medida | Fórmula, fonte e observação efetivamente usadas correspondem à evidência entregue |39entradas declaradas; raiz selected-day qualificada só naquele perfil, não39/39globais | Preservar medição/isolamento necessários. Avaliar exaustividade do corpus como decisão de escopo separada da necessidade do controle; não promover registry a prova |
| G11: capacidade de detectar erro e domínio | Dados/filtros/tempo errados não passam como resultado correto; ausência de alternativa não gera prova fictícia | Histórico:731sem alternativa,201sem discriminante,945recusas estruturais,151sem referência e4timeout/cofalhas. Não são saldo atualizado | Tratar classes, não perseguir cada ID com perfil novo. Exigir referência independente onde necessário; compatibilizar singleton/perfis com path-domain/v2 por decisão explícita, nunca reduzir IDs ou fabricar witness |
| G14: claim/derivados/pais | Comparações entre pessoas/períodos, saldo após contas e ranking não usam resultados sem lastro | Parents/derivados globais pendentes; selected-day mantém validated_parent=false. metricParents lê valores/hash/versão mas declara não certificar parent | Preservar cadeia de resultado validado para toda operação entregue. Não adiar parents indiscriminadamente: consumo_difference, income_minus_open_bills e ranking_winner sustentam perguntas domésticas |

Dentro do censo, date/timezone sustenta períodos corretos; igualdade e parents
podem sustentar vínculos materiais de resultados compostos. Nada disso pode
ser descartado só porque tem nome técnico. O custo/necessidade da estratégia
exaustiva de prova deve ser avaliado separadamente da garantia de resultado.
Não existe classificação suficiente por consumidor de cada uma das2032
pendências históricas; esta tabela NÃO a inventa nem soma outras matrizes.

Decisão recomendada para a revisão: congelar novas extensões de autoridade e
microperfis; resolver primeiro a incompatibilidade de saída ordinary/singleton/
perfis como UMA classe. Só há dois caminhos honestos para mudar a dependência
da entrega doméstica: manter o contrato global e cumprir seu fechamento, ou
ratificar formalmente um contrato de entrega delimitada com garantia equivalente
para as operações suportadas e registrar o global como pendente. O segundo
não é aprovação de subconjunto por conveniência, não autoriza resposta financeira
agora e não pode ser implementado sem proposta normativa/auditoria correspondentes.
Esta revisão ainda não escolheu nem ratificou esse contrato substituto.

### Reconciliação fechada das autoridades e causas históricas

Confronto adicional em2026-10-07: propostas v2/mensal/selected-day e recibos de
ratificação foram lidos nos recortes pertinentes; propostas conservam cabeçalhos
históricos NÃO RATIFICADA, mas os recibos registram sua ratificação. Não usar o
cabeçalho congelado isoladamente como estado vigente.

| Autoridade | O que admite como prova | O que NÃO resolve |
| --- | --- | --- |
| path-domain/v2, f892a35fce88fe21d474bd7ed408fe2697052ce7 | Path semântico por predicado, primeira alternativa discriminante existente/compatível, admissão e D/P com rejeições exatas; admissão por site em ledgers distintos | Ausência de alternativa continua UNSAT. Admissão não substitui execução semântica. Não permite reclassificar731 linhas automaticamente |
| claim-month-path-completion/v1,04eb9545516d100aa45e1ac6d8ebfda444fafbd7 | Classe estreita period_eq/claim.period/month; view P auxiliar, transporte nominativo do binding alvo, conformance integral, core/fringe e quarentena | Não cobre date/range/as_of/through/statement_due, seleção, outros operadores ou namespaces. APTO focal M-01 não prova todos os membros elegíveis |
| selected-event-day-path/v1,f1a8cd4629b245009b9dd8fbb8dce83da77ba3d4 | Date civil específica, seleção singleton, material_ref direto, compiler normal inteiro, core estrito e exatamente4fringe sem consumidor selected_set | Não cobre105recusas selection_binding_selected,19não discriminantes, mensal, timezone, parents ou derivados. Invocação própria qualificada não é ledger consolidado |

O relatório histórico foi relido por extração mecânica somente leitura, SHA
3187e36259bc11fcd2c9063a6a4ba25987f1e1acca18a81a96aee87834b007d0:
2419rows/2419IDs únicos/387matches locais/2032pendentes, todos os targets
resolvidos no grafo daquele snapshot. Nenhuma execução, migração ou novo crédito.

Comparação de fontes com esta worktree: graphs-v2.json tem bytes idênticos,
SHA e9c852034d8cc887e1d8645a61d9597176409f72a28eaf0de4c95f17c0c8358d.
claims-v2.json tem hashes raw distintos (histórico4ce77cc84af714ecdf0fe41190b6698dfd98194ce5357dbce5defb4da35b6298;
atual4810612761ea7f232e4445c0d192ae53ebf0761f0ba8752da758efb826b30494),
mas JSON canônico integral equivalente e zero facts alterados. Essa comparação
é de conteúdo, não equivale a identidade raw/TCB/autoridade executável.

Agrupamento EXATO dos2032pendentes por causa registrada e operador authored:

| Causa histórica | Operadores e quantidades | Total |
| --- | --- | ---: |
| no_typed_closed_world_alternative | eq491;period_eq78;set_eq55;edge_pair_complete51;none_match23;date_in_period11;state_is8;field_eq6;civil_offset_matches3;same_month3;inclusive_day_count_matches2 |731 |
| selection_binding_candidate | not_eq539;eq98 |637 |
| selection_binding_selected | eq151;state_is105 |256 |
| no_discriminating_candidate_in_supported_reference_domain | eq165;state_is16;field_eq15;abs_eq5 |201 |
| independent_reference_domain_pending | date_in_period125;eq14;day_of_month_matches6;civil_date_matches2;month_bounds_match2;civil_offset_matches2 |151 |
| claim_requirements_subject | eq47 |47 |
| operator_types_shape | none_match5 |5 |
| collateral_or_missing_rejection | eq3 |3 |
| host_timeout | not_eq1 |1 |

São29grupos causa×operador, não29novos requisitos/autoridades. Nenhuma causa
foi atualizada pelos focais posteriores. Em especial, o diagnóstico date125
posterior tem sua própria divisão19/106/105/1 e não deve ser somado ou aplicado
retroativamente a esta tabela.

Screen autoral dos78period_eq sem alternativa:41month,13date,13range,5as_of,
3statement_due,3through. Apenas os41month passam as verificações estáticas de
forma nominal da proposta mensal e ausência de referência authored ao target
fora de predicates/obligations. Não foram provados domínio singleton completo,
closure executável, parents, baseline admitido, TCB ou conformance; portanto
isso NÃO é elegibilidade/ticket/PASS nem autorização para executar41witnesses.
Os outros37 nem pertencem à forma month ratificada. O código existente
executeClaimMonthProfileScope é parametrizável, mas recusa parent_claim sem
parents fornecidos e publica freeze local/global_g11=false. Não reconstruí-lo
nem chamar sua parametrização de aprovação para uma classe inteira.

### Resultado da decisão técnica neste bloco

Não há fundamento para prometer encerramento do contrato global apenas
reexecutando lotes ou estendendo mensal/selected-day. Esses perfis têm limites
que excluem classes dominantes. O problema exige uma decisão única de modelo
de garantia/qualificação, não outro caso especial.

O controle financeiro normal que recusa autoria incoerente está funcionando
como barreira naqueles negativos; isso NÃO o converte em witness D/P. Deve-se
decidir explicitamente se a garantia final continuará a exigir uma qualificação
contrafactual que ultrapassa essa barreira, ou se a prova será composicional:
proteção estática do domínio admitido e prova semântica das alternativas que
realmente podem atravessá-lo. A segunda abordagem ainda NÃO está especificada,
ratificada ou comprovada equivalente; não aplicá-la nem chamar recusa de PASS.
Ela é a alternativa a avaliar para interromper a multiplicação de microperfis,
preservando compiler, cálculo, isolamento, trace, resultado e parents.

Escopo da próxima decisão: regra geral para ausência de alternativa e recusa
estrutural, autoridades/ledger separados, equivalência de garantias e efeito
na dependência NEXT-02→NEXT-03. Não alterar schema/corpus/claim financeiro para
criar dados artificiais que tornem o teste possível. Não escolher alternativa
por outcome, mudar expected ou requalificar histórico. Qualidade conversacional
e factual100% permanece requisito, não moeda de troca por prazo.

Isto é preparação factual da decisão, NÃO alteração normativa. Formular uma
nova regra de saída é decisão normativa material ainda aberta; exige capacidade
específica antes da redação do contrato e revisão independente antes de ativar.

2026-10-08: Daniel confirmou seleção Ultra para este bloco, acima de Sol/Extra
Alto recomendado; nenhuma troca automática. Proposta única redigida em
financasbot-next-02-n02g-compositional-path-qualification-proposal-v1.md:
path-qualification/v3 distingue witness semântico, prova estática de domínio e
equivalência necessária, com bloqueio na ausência de prova. Ela explicita a
mudança de método em relação a v2, não alega equivalência já demonstrada e não
concede crédito semântico às duas últimas classes. Preserva controles por site,
G07/G08/G14 e demais famílias G11; exige migração integral e revisão independente.
Estado: PROPOSTA NÃO RATIFICADA; nenhum runtime/suíte/ledger alterado.

## Condição de entrada obrigatória de cada etapa

Uma ficha curta no plano da própria etapa, não um gate/auditoria separado:

| Campo | Evidência exigida |
| --- | --- |
| Necessidade | Problema doméstico e exemplo de resultado útil, sem dados privados |
| Original | Raiz/commit e WIP relevante; módulo, consumidor, contrato e testes reais |
| Já funciona? | Evidência existente e limites; não confundir arquivo presente, teste histórico e funcionamento atual |
| Qualidade alvo | Exatidão e contexto/follow-ups do Next; regressões do original que o reuso não pode preservar |
| Decisão | Manter como está; reutilizar permitido; adaptar; substituir com causa; ou adiar |
| Delta | O que falta, por que é necessário e alternativa mais simples considerada |
| Saída | Critério finito, risco, validação proporcional e condição de parada |

Não iniciar implementação sem a ficha. Não copiar monólito, efeitos ou
heurísticas inseguros só para aumentar percentual de reuso. Não reescrever tudo
porque uma parte falha ou um contrato proíbe import direto: avaliar manutenção
no original, extração ou adaptação permitida. Mudar isolamento/autoridade só por
decisão explícita, com contratos confrontados. Evidência em código inalterado
pode ser reutilizada quando versão, entrada, fronteira e autoridade são compatíveis.

## Proposta de revisão global: destino, não reinício

| Bloco | Partir do existente | Decisão proposta para a revisão |
| --- | --- | --- |
| Inventário doméstico | Inventários NEXT-01/02 e consumidores do original | Selecionar necessidades atuais da casa e gaps reais antes de qualquer reconstrução |
| Uso cotidiano | Lançamentos/edição, gastos/orçamento, faturas/parcelas, contas/lembretes e dashboard existentes | Manter o que atende; priorizar defeitos e lacunas comprovados pelo inventário |
| Analítica Next (NEXT-02/03, incluindo N02-G) | Projector/engines/verifiers/testes originais e candidatos já produzidos | Precisão e follow-ups robustos são centrais; avaliar desenho pelo vínculo causal com essas garantias, recortar apenas abrangência não necessária por decisão explícita, sem declarar gate antigo concluído |
| Fontes e interface (NEXT-04/05) | Sheets/Calendar/WhatsApp/dashboard/importadores existentes | Reutilizar onde permitido; adapter ou migração somente por necessidade concreta e paridade |
| Escritas/proatividade (NEXT-06/07) | Fluxos de confirmação/idempotência/reconciliação existentes | Conservar garantias e operações usadas; não reconstruir todos os writers por calendário |
| Outros domínios/cutover/retirada (NEXT-08/09/10) | Matriz de capacidades e evidência de consumo/rollback | Por capacidade necessária; generalidade futura adiada como proposta, nunca remover legado sem paridade e autorização |

Tabela é direção de revisão, NÃO classificação concluída de capacidades reais.
Nenhuma capacidade foi removida, nenhum gate requalificado e nenhum contrato
financeiro enfraquecido. Os critérios ratificados atuais continuam valendo onde
se alega seu cumprimento. Alterar escopo exige changelog, decisão humana e
revisão independente quando material; não editar retroativamente artefatos aprovados.

### Sequência proposta e fronteiras finitas

1. **Reconciliação de saída N02-G, antes de retomar implementação.** Usar o
   censo já existente para ligar G07/G08/G11/G14 a cálculos, evidência e
   consumidores domésticos. Para cada pendência: necessária antes da conversa,
   necessária antes da integração real, ou abrangência a propor fora da entrega.
   O último grupo exige decisão normativa explícita; não é PASS nem retirada
   automática. Saída: uma tabela única e decisão de escopo, sem outro helper.
2. **Conversa read-only integrada, quando o pré-requisito ratificado permitir.**
   Reutilizar o gateway, CAS, claims, kernel, perguntas e Golden Set. Completar
   somente entendimento do texto/composição de tools e sessão no recorte
   aprovado. Saída: conversas de texto com fatos/referentes/filtros corretos,
   troca de assunto/TTL/restart/conflito, além das propriedades já exigidas.
   Não abrir NEXT-03 antes de resolver formalmente sua trava atual.
3. **Fontes e canais domésticos existentes.** Confrontar Sheets/Calendar,
   WhatsApp e dashboard antes de adaptar; preservar telas e fluxos úteis.
   Saída: mesma verdade verificável nas consultas suportadas, cobertura
   explícita, isolamento e recuperação; nenhuma escrita autorizada por leitura.
4. **Escritas realmente usadas.** Partir dos fluxos originais de lançamento,
   edição/importação e confirmação; priorização depende de uso confirmado.
   Saída: preview/confirm/commit/reconciliação e não duplicação sob o contrato
   aprovado. Não refazer todos os writers nem todos os formatos por calendário.
5. **Cutover por capacidade, com rollback.** Somente após qualidade/paridade
   suficientes. Manter original até a substituição comprovada; demais domínios,
   Open Finance ou proatividade nova entram por decisão de benefício, não como
   condição implícita de terminar o controle financeiro doméstico.

Esta ordem é proposta, não migração executada. O inventário começa cada bloco,
mas termina em decisão/delta/saída; não vira um projeto permanente de inventário.
Não reduzir qualidade para acelerar nem generalizar toda a plataforma para
resolver uma falha local. Custo permanente inclui adapters, estados, controles,
auditorias e manutenção, não só linhas de código.

Para evitar novo scope creep: antes da implementação do bloco, fixar entregas,
critérios já ratificados e exclusões. Achado só amplia esse bloco se bloquear um
critério ou se a inclusão for aprovada explicitamente. Registrar a recomendação
adiada sem convertê-la em pré-requisito retroativo. Ao fechar a classe de falha,
encerrar o bloco; não buscar melhorias indefinidamente.

## Avaliação de melhorias surgidas

Registrar no backlog da própria revisão: problema, frequência/impacto, evidência
e confiança, solução simples alternativa, custo de desenvolvimento/manutenção,
risco e benefício verificável. Sem nota numérica artificial ou fila infinita.

- Corrigir no bloco atual: defeito que invalida resultado/critério ou ameaça
  dados, privacidade ou operação; vínculo causal explícito.
- Controle necessário à precisão, ao contexto/follow-up ou a outra garantia
  ratificada é requisito de confiabilidade, não melhoria opcional a ser adiada
  somente por custo. Comprovar necessidade, não multiplicar controles por inércia.
- Incluir em bloco planejado: benefício doméstico demonstrável supera custo e
  complexidade; entrada/saída delimitadas e inclusão aprovada.
- Experimento limitado: benefício ainda incerto; hipótese/custo/limite/condição
  de abandono explícitos, sem produção por autorização implícita.
- Adiar ou não incluir: generalidade futura, elegância técnica sem problema,
  duplicação ou custo permanente desproporcional. Não é defeito oculto no GO.

Qualquer achado que acrescente contrato, subsistema, dependência de fase ou
custo/prazo relevante suspende só a expansão e exige reconciliação de escopo.
Recomendação de auditor não vira requisito automaticamente. Defeito material
confirmado é tratado; recomendação de melhoria recebe decisão de produto.

## Qualidade e preservação

Invariantes: cálculo correto, proveniência suficiente ao risco, privacidade,
confirmação para escrita, não duplicação, backup/recuperação e rollback quando
aplicável. Escopo menor não permite chamar falha/UNSAT de PASS.
Escada existente: revisão adversarial, RED/focal e afetados durante mudança;
uma ampla do candidato estável e auditoria independente do recorte material.
Documentação operacional não abre suite ampla/auditoria recursiva própria.
Nenhum serviço/rede/dado financeiro real, deploy, reset, integração ou remoção
é autorizado por esta revisão. Subagentes desligados.

## Próxima ação e saída desta revisão

Confronto consumer-first, mapa de confiabilidade, fronteiras G07/G08/G11/G14 e
reconciliação ordinary/singleton/perfis concluídos neste bloco estático. Próxima
ação única: formular UMA proposta normativa geral de qualificação composicional
como alternativa à multiplicação de microperfis, confrontar suas lacunas e a
equivalência das garantias, e levá-la à ratificação/auditoria antes de aplicar.
Não criar outro perfil, alterar normas vigentes ou avançar NEXT-03 agora.
Proposta documental única redigida no arquivo acima após confirmação humana
de Ultra. Próximo passo: publicar candidato documental sanitizado e obter UMA
auditoria normativa independente antes de decidir sua ratificação/aplicação.
Não auditar helpers nem executar matriz/ampla nesta etapa documental. Capacidade
mínima recomendada para decisão/contraprovas normativas: Sol/Extra Alto; Ultra
foi escolha humana explícita neste bloco. Implementação de interfaces já
ratificadas não herda esse nível por padrão.

Não há ETA global defensável enquanto o escopo de saída continuar em revisão.
Após ratificação, estimar por blocos fechados e trabalho restante, separando
implementação, validação e espera de auditoria; revisar estimativa por mudança
causal, não por cada heartbeat. Tempos históricos de suítes são tempos de
espera, não previsão de conclusão do produto.

Saída da revisão: esse mapa e a nova ordem aprovados, tratamento explícito do
N02-G incompleto, invariantes preservadas e primeira etapa com ficha completa.
Capacidade: Codex / GPT-6.1 Sol / Alto para confronto transversal dirigido.
