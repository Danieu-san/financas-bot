# NEXT-00 — Charter e contratos do FinançasBot Next

Atualizado em: 2026-08-31
Estado: `OPEN — PROVENANCE GRAPH DESIGN V3 HARMONIZED; FINAL FOCAL REAUDIT PENDING; IMPLEMENTATION BLOCKED; ZERO IMPLEMENTAÇÃO FUNCIONAL`
Base: `fc577e5d5e21fdc5402ace1cf662a6ea1bef255f`
Roadmap normativo: `911af93343210ccfe2d7b7fe0b898542044a1fdf`

## Objetivo material

Congelar as fronteiras necessárias para que NEXT-01 possa ser implementado sem
recriar múltiplas verdades, escritores concorrentes, memória implícita ou
efeitos financeiros decididos pela IA.

NEXT-00 produz documentação, contratos verificáveis, fixtures sintéticas e
critérios objetivos. Não produz runtime funcional.

## Escopo

1. Data Authority Contract;
2. Coexistence and Single-Writer Contract;
3. Conversation and Proposal Contract;
4. Model Data Boundary Contract;
5. Integration Capability Manifest;
6. Capability and Cutover Matrix;
7. Tool Budget and Failure Policy;
8. Quality, Stability and Retention Contract;
9. inventário de capacidades do legado e taxonomia de reaproveitamento;
10. Golden Conversation Set v1 sanitizado, versionado e revisado;
11. oracle factual tipado dos 56 turnos, com 76 fatos materializados;
12. rastreabilidade causal dos 67 testes documentais;
13. registro determinístico das métricas e pin integral dos contratos numéricos.

## Não escopo

- implementação de gateway, agente, kernel, ledger, tools ou writers;
- acesso a WhatsApp, Pluggy, Google, OCI, planilha ou dados reais;
- credenciais, secrets, sessões, deploy, flags ou produção;
- alteração do bot legado ou do dashboard em produção;
- migração, cutover, canário ou abertura de NEXT-01;
- decisões pós-MVP não necessárias aos contratos deste gate.

## Invariantes

1. IA interpreta e compõe; identidade, autorização, matemática e efeitos são
   determinísticos.
2. `SourceObservation -> CanonicalFinancialEvent -> Projection` é a única
   direção válida; projeção não reentra como observação.
3. Existe um único writer/notifier/scheduler/cursor por família e capacidade.
4. Confirmação aponta para proposta imutável, vigente e versionada.
5. Nenhum claim quantitativo nasce de aritmética livre do modelo.
6. Regras aprendidas não ampliam autoridade nem dispensam confirmação.
7. Dashboard v2 e WhatsApp consumirão os mesmos claims do kernel.
8. Gasto por categoria permanece o primeiro vertical do produto.
9. Zero, vazio, incompleto e indisponível continuam estados diferentes.
10. Todo artefato deste gate é sanitizado e não contém dado financeiro privado.
11. Pergunta quantitativa só recebe verde com oracle material tipado ou estado
    fail-closed explícito.
12. Todo fato materializado é recomputado da fixture por métrica determinística.
13. ID contratual executável não recebe verde por referência conversacional.
14. Contrato numérico congelado não muda sem romper seu SHA-256 auditado.
15. Duas auditorias com novas exceções da mesma classe interrompem remendos e
    obrigam redesenho declarativo ou teste de propriedade; um terceiro remendo
    é proibido.
16. ID de evidência não prova provenance: conteúdo material, dimensões, arestas,
    conjunto exato e trace de derivação precisam coincidir.
17. Cada átomo de prova possui mutant ortogonal e conjunto exato de violações
    esperado; RED global não prova todas as barreiras.
18. Evaluator executado é content-addressed e usa papéis tipados de operandos;
    coincidência do Golden Set não prova fórmula.
19. Todo campo lido causalmente é material; `non_material` não pode aparecer em
    trace de cálculo ou prova.
20. Mutação enumerada sem witness discriminante falha o gate e nunca vira skip.
21. Artifact hash cobre o closure executável hermético pós-transformação, não
    apenas o entry module.
22. Calculation e proof reads, inclusive estruturais, são observados pelo mesmo
    recorder externo; nenhum evaluator autodeclara trace.
23. Grupos atômicos são proibidos; impossibilidade de isolamento falha o gate.
24. Metric evaluator registry é a única autoridade de hashes e roles; claims e
    traces apenas referenciam ou medem.
25. Loader, sandbox, proxy e recorder pertencem ao `validation_tcb_root`; a
    fronteira externa restante é runtime/CI declarado, não código do projeto
    fora do hash.
26. Recorder externo é a única autoridade causal de ambos os traces; evaluator
    e operator não podem fornecer metadado causal.
27. Freeze manifest referencia o hash do metric evaluator registry sem replicar
    contract hashes, artifact roots ou roles como segunda autoridade.

## Riscos controlados

- contrato abstrato demais para ser testável;
- duas fontes recuperarem autoridade semântica por caminhos diferentes;
- números de estabilidade escolhidos depois de observar resultados;
- Golden Set pequeno, enviesado, sem oracle ou contaminado por dados privados;
- rastreabilidade autorreferencial ou modo causal incorreto;
- matriz de capacidades esconder perda funcional no cutover;
- NEXT-00 virar implementação antecipada.

Cada risco bloqueia GO enquanto não houver contrato, teste documental ou
evidência rastreável que o contenha.

## Entregas e etapas

### NEXT00-01 — Inventário e taxonomia — `COMPLETE`

- 30 capacidades, 15 ativos e 12 itens `DO_NOT_PORT` classificados com
  evidência, sem portar por mera existência.

### NEXT00-02 — Autoridade, coexistência e conversa — `COMPLETE`

- contratos 1 a 4, schemas, estados, transições e catálogos normativos
  `DA/SW/CP/MB`.

### NEXT00-03 — Integrações, capacidades, orçamento e retenção — `COMPLETE`

- contratos 5 a 8, nove manifests sem write, matriz `32/30`, tiers
  `13/11/6/2` e limiares numéricos.

### NEXT00-04 — Golden Set v1 — `COMPLETE; CORRECTED AFTER AUDIT`

- 48 conversas: 16 simples, 16 multi-tool, 8 follow-ups e 8 negativas;
- 56 turnos com oracle factual tipado, 76 fatos e 39 avaliadores causais;
- 14 dimensões críticas com ao menos três casos;
- fixture financeira sintética, relógio fixo e vocabulário canônico;
- rastreabilidade `67/67` a partir dos contratos primários, com policy causal.

### NEXT00-05 — Coerência e auditoria — `ARCHITECTURE REDESIGN DRAFT; IMPLEMENTATION BLOCKED`

- `6aa658d...` recebeu Claude `APROVÁVEL` e Chat `APROVÁVEL APÓS AJUSTES`;
- três HIGH e os MEDIUM causais do Chat foram reproduzidos e corrigidos;
- `0beb543...` recebeu Chat `APROVÁVEL APÓS AJUSTES`; causalidade
  dimensional/provenance e a bateria adversarial foram endurecidas;
- o bloco imperativo por métrica foi removido e substituído por contrato de
  fatos declarativo;
- propriedades `608/608` de dimensão, `76/76` de valor, `1/1` de relação e
  `11/11` mutações estruturais permaneceram verdes, mas não cobrem drift do
  conteúdo/arestas atrás do mesmo ID;
- `bd53f70...` recebeu Chat `NO-GO`; o estado foi rebaixado;
- o desenho do grafo declarativo de provenance está em revisão e nenhum motor
  será implementado antes de sua ratificação;
- `9b20c0f...` recebeu `APROVÁVEL APÓS AJUSTES`; os três HIGH e o MEDIUM foram
  incorporados como invariantes genéricos no desenho v2;
- o novo desenho exige provas ortogonais, evaluator content-addressed, leitura
  material e witness fail-closed;
- `2a115dc...` recebeu `APROVÁVEL APÓS AJUSTES`; closure transitivo,
  `proof_trace`, grupos atômicos e autoridade canônica foram corrigidos no
  desenho v3 sem criar subsistema novo;
- `6906256...` recebeu `APROVÁVEL APÓS AJUSTES`; contradições residuais sobre
  trace, bootstrap e freeze foram harmonizadas textualmente;
- `62b17b2...` recebeu `APROVÁVEL APÓS AJUSTES`; as três formulações
  residuais foram confirmadas e harmonizadas sem mudar a arquitetura: metric
  evaluator produz resultado funcional, registry é a única autoridade de roles,
  loader mede e somente recorder materializa trace;
- decisão humana continua obrigatória antes de NEXT-01.

## Validação proporcional

- inspeção adversarial local do desenho antes de código;
- auditoria arquitetural independente por hash imutável;
- somente após ratificação: RED/focal gerado de nós, campos, arestas e trace;
- uma única validação ampla do workflow no candidato implementado e estável;
- uma reauditoria independente final por novo hash imutável.

## Critérios de GO

1. os oito contratos estão versionados, coerentes e revisados;
2. Golden Set cumpre volume, cobertura e oracle factual de 56/56 turnos;
3. rastreabilidade contém 67/67 IDs dos contratos primários, sem falso verde de
   requisito executável;
4. matriz está preenchida e não oculta perda funcional;
5. limiares explícitos são verificados e os dois contratos numéricos completos permanecem pinados por SHA-256, sem marcador não resolvido;
6. inventário e taxonomia citam evidência e não portam por inércia;
7. zero código funcional, fonte real, writer, credencial, produção ou legado foi
   acessado ou alterado;
8. validação local e auditoria independente não possuem lacuna indispensável;
9. Daniel decide explicitamente se autoriza abrir NEXT-01.

## Critérios de NO-GO e condições de parada

Parar diante de contradição entre contratos, oracle ausente/ambíguo, requisito
executável classificado como verde documental, necessidade de dado privado,
escopo funcional antecipado, fixture não sanitizada, limiar pós-hoc, NO-GO
independente ou terceira correção da mesma classe por exemplos especiais.

## Próxima ação exata

Publicar a harmonização documental do desenho v3 em hash imutável e reauditar
somente a exclusividade de trace, roles e escrita do recorder, sem implementar
compiler, evaluator, fixture ou validador. NEXT-01 continua fechado até parecer
sem lacuna indispensável e decisão explícita de Daniel.
