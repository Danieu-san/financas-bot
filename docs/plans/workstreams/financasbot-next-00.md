# NEXT-00 — Charter e contratos do FinançasBot Next

Atualizado em: 2026-08-30
Estado: `OPEN — NEXT00-04 COMPLETE; NEXT00-05 READY; ZERO IMPLEMENTAÇÃO FUNCIONAL`
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
10. Golden Conversation Set v1 sanitizado, versionado e revisado.

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

## Riscos controlados

- contrato abstrato demais para ser testável;
- duas fontes recuperarem autoridade semântica por caminhos diferentes;
- números de estabilidade escolhidos depois de observar resultados;
- Golden Set pequeno, enviesado ou contaminado por dados privados;
- matriz de capacidades esconder perda funcional no cutover;
- NEXT-00 virar implementação antecipada.

Cada risco bloqueia GO enquanto não houver contrato, teste documental ou
evidência rastreável que o contenha.

## Entregas e etapas

### NEXT00-01 — Inventário e taxonomia — `COMPLETE`

- enumerar capacidades usadas e contratos aproveitáveis do legado;
- classificar `PORT_AS_IS`, `PORT_BEHIND_NEW_CONTRACT`, `REWRITE`,
  `REPLACE_WITH_TOOL` ou `DO_NOT_PORT`;
- registrar dependências e evidências, sem inferir uso por mera existência.

### NEXT00-02 — Autoridade, coexistência e conversa — `COMPLETE`

- contratos 1 a 4;
- schemas mínimos, estados e máquinas de transição;
- testes negativos e invariantes correspondentes.

Artefatos congelados:

- `docs/contracts/next/data-authority-contract-v0.md`;
- `docs/contracts/next/coexistence-single-writer-contract-v0.md`;
- `docs/contracts/next/conversation-proposal-contract-v0.md`;
- `docs/contracts/next/model-data-boundary-contract-v0.md`;
- `financasbot-next-00-contracts-1-4-validation-v1.md`.

### NEXT00-03 — Integrações, capacidades, orçamento e retenção — `COMPLETE`

- contratos 5 a 8;
- matriz beta/cutover/retirement/pós-MVP preenchida;
- limiares numéricos versionados, sem `TBD`.

Artefatos congelados:

- `docs/contracts/next/integration-capability-manifest-v0.md`;
- `docs/contracts/next/capability-cutover-matrix-v0.md`;
- `docs/contracts/next/tool-budget-failure-policy-v0.md`;
- `docs/contracts/next/quality-stability-retention-contract-v0.md`;
- `financasbot-next-00-contracts-5-8-validation-v1.md`.

### NEXT00-04 — Golden Set v1 — `COMPLETE`

- 48 conversas sanitizadas: 16 simples, 16 multi-tool, 8 follow-ups e 8 negativas;
- 14 dimensões críticas com ao menos três casos cada;
- fixture financeira sintética e relógio fixo;
- rastreabilidade completa aos 67 testes documentais dos contratos 1 a 8;
- validação focal versionada em
  `financasbot-next-00-golden-set-v1-validation.md`.

### NEXT00-05 — Coerência e auditoria

- validar referências, cobertura, ausência de contradições e não escopo;
- executar o validador do workflow;
- publicar commit sanitizado e obter auditoria independente por hash;
- decisão humana antes de qualquer NEXT-01.

## Validação proporcional

- inspeção adversarial local antes de cada contrato;
- lint/validação estrutural focal dos artefatos alterados;
- testes documentais de invariantes, matrizes e schemas;
- uma única validação ampla do workflow no candidato estável;
- uma auditoria independente final por hash imutável.

## Critérios de GO

1. os oito contratos estão versionados, coerentes e revisados;
2. Golden Set v1 cumpre integralmente volume e cobertura mínimos;
3. matriz de capacidades está preenchida e não oculta perda funcional;
4. duração, percentuais, latência, custo, RTO e rollback possuem valores
   numéricos; nenhum campo relevante permanece `TBD`;
5. inventário e taxonomia citam evidência e não portam por inércia;
6. zero código funcional, fonte real, writer, credencial, produção ou legado
   foi acessado ou alterado;
7. validação local e auditoria independente não possuem lacuna indispensável;
8. Daniel decide explicitamente se autoriza abrir NEXT-01.

## Critérios de NO-GO e condições de parada

Parar diante de:

- contradição entre contratos ou com o roadmap ratificado;
- necessidade de dado privado ou acesso real para concluir documentação;
- tentativa de antecipar implementação, integração ou migração;
- limiar escolhido depois do teste que deveria julgá-lo;
- fixture não sanitizada ou identidade financeira real;
- escopo não resolvido, evidência insuficiente ou NO-GO independente.

## Próxima ação exata

Abrir somente `NEXT00-05`: revisar coerência e não escopo, executar uma única
validação ampla do workflow, publicar commit sanitizado e obter auditoria
independente por hash. NEXT-01 continua fechado até GO documental e decisão
explícita de Daniel.
