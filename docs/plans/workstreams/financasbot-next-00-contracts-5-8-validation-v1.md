# NEXT00-03 — Validação cruzada dos contratos 5 a 8

Atualizado em: 2026-08-30
Estado: `GREEN — DOCUMENTAL; ZERO RUNTIME`
Roadmap normativo: `911af93343210ccfe2d7b7fe0b898542044a1fdf`

## Escopo validado

- `docs/contracts/next/integration-capability-manifest-v0.md`;
- `docs/contracts/next/capability-cutover-matrix-v0.md`;
- `docs/contracts/next/tool-budget-failure-policy-v0.md`;
- `docs/contracts/next/quality-stability-retention-contract-v0.md`;
- contratos 1 a 4 congelados no NEXT00-02.

Esta é validação documental. Não autoriza integração, model call, dado real,
writer, canário, cutover, deploy, produção ou NEXT-01.

## Matriz de obrigações

| Obrigação do roadmap | Decisão congelada | Estado |
|---|---|---|
| manifest read/write/data/scopes/secrets/egress/webhook | schema v0 + registry INT-01..09 | coberta |
| rate limit, timeout e payload | números por adapter | coberta |
| source/projection/effect/rollback | campos e gates por adapter | coberta |
| integração nasce read-only/sem authority | `write_enabled: []` em todos os registros | coberta |
| testes negativos de scope | IM-01..12 | coberta |
| 30 capacidades classificadas | CAP-01..30, com 24/25 decompostas | coberta |
| beta/cutover/retirement/post-MVP | classes 1..4 preenchidas | coberta |
| capacidade usada não desaparece | exceção só com aceite/prazo de Daniel | coberta |
| budget 6/12, repeat 2, timeout 30 | BudgetEnvelope v0 | coberta |
| falha fechada/sem fallback | taxonomia e ações | coberta |
| recomposição somente de forma | 1, mesmas claims, zero tool nova | coberta |
| métricas/limiares objetivos | qualidade, efeito, latência e custo | coberta |
| janelas beta/cutover | 7/14 dias + volumes mínimos | coberta |
| RPO/RTO/rollback | números e procedimento | coberta |
| delete/tombstone/backup/restore | lifecycle e retenções numéricas | coberta |

## Cobertura da Capability Matrix

As 30 capacidades do inventário aparecem na matriz. CAP-24 e CAP-25 foram
decompostas sem perda:

- `CAP-24A`: comprovantes sem OCR, classe 3;
- `CAP-24B`: OCR/PDF/imagem, classe 4 conforme fora de escopo inicial;
- `CAP-25A`: backup/restore, classe 1 por segurança operacional;
- `CAP-25B`: exportação, classe 3.

Distribuição de slices:

- classe 1: 13 slices;
- classe 2: 11 slices;
- classe 3: 6 slices;
- classe 4: 2 slices.

Isso não significa 32 capacidades; são 32 slices que cobrem 30 IDs de origem.

## Decisões cruzadas

### Beta read-only é deliberado

O primeiro beta prova agente, kernel, família, dashboard, backup e rollback sem
precisar abrir writer. O legado permanece owner das escritas. Isso reduz risco
sem ocultar perda: as 11 slices classe 2 continuam bloqueando o cutover do
WhatsApp principal.

### Preservação não infla o primeiro MVP

Calendar, reminders, writes, edição/undo, Open Finance, áudio e scheduler são
classe 2 porque já são necessárias ao uso principal pretendido. Regras
aprendidas, projeções, saúde, import/export e comprovantes permanecem obrigatórias
antes de aposentar o legado. Somente OCR/imagem e adapters ainda não definidos
ficam pós-MVP.

### Manifest não concede authority

`write_declared_but_disabled` documenta efeitos futuros, mas todos os nove
registros possuem `write_enabled: []`. Promoção exige source policy, lease,
idempotência, receipt, reconcile e gate por capability. Portanto, detalhar um
endpoint não antecipa integração.

### Retries cabem no budget

`max_attempts` de manifest é teto, não multiplicador do timeout. Todas as
tentativas de uma trajetória cabem nos 30 segundos do Tool Budget; a terceira
execução do mesmo tool+args é bloqueada. Commit tem uma única tentativa e passa
a `uncertain` quando o resultado é ambíguo.

### Custo não cria fallback

O teto de US$0.05 encerra novas model calls no turno. Ele não autoriza provider
mais barato não aprovado. Custo desconhecido invalida a conversa como evidência
de beta/cutover.

### Janelas exigem tempo e volume

Sete ou quatorze dias sem volume não concedem GO. Beta precisa de 200 conversas
e 500 claims; cutover precisa de 500 conversas, 1.000 claims e 100 efeitos. A
capability effectful exige 10 canários reais autorizados e 20 casos controlados.

### Retenção preserva integridade sem guardar conteúdo indefinidamente

Enquanto a conta está ativa, eventos/receipts sustentam o histórico do usuário.
Pedido de exclusão bloqueia acesso e purga conteúdo em até 30 dias; tombstone
sem conteúdo permanece 90 dias para impedir replay/restore. Backups expiram em
35 dias e restore reaplica tombstones antes de leitura.

### ADR-002 permanece obrigatório

Família e admin são scopes diferentes. Dashboard same-origin continua sem
seletor financeiro arbitrário; manifest, matrix e Quality Contract não criam
exceção de admin all-users.

## Coerência numérica

| Limite | Fonte | Verificação cruzada |
|---|---|---|
| 6 soft / 12 hard calls | Tool Budget | roadmap §4.7 preservado |
| 2 same fingerprint | Tool Budget | manifests têm `max_attempts <=2` |
| 30 s trajetória | Tool Budget | manifests não podem multiplicar prazo |
| proposal TTL 10 min, max 30 | contrato 3 + Quality | valores idênticos |
| model retention <=30 dias | contrato 4 + manifest + Quality | valores idênticos |
| lease 60 s / renew 20 s / cutoff 40 s | Quality + contrato 2 | epoch/fencing preservados |
| beta 7 dias | Quality | volume mínimo impede espera vazia |
| effect/cutover 14 dias | Quality | dois rollback drills obrigatórios |
| RPO autoridade <=5 min | Quality | backup incremental exigido |
| capability rollback <=15 min | Quality | procedimento cercado |
| WhatsApp rollback <=30 min | Quality | sem copiar sessão ativa |
| backup 35 dias | Quality | restore semanal e tombstone registry |

## Catálogo de testes documentais

| Prefixo | Quantidade | Tema |
|---|---:|---|
| IM | 12 | integration scope/egress/webhook/revocation |
| CM | 8 | capability/cutover/retirement |
| TB | 12 | tool budget/failure/retry/recomposition |
| QS | 14 | quality/window/latency/cost/rollback/retention |
| **Total** | **46** | casos negativos e de gate |

O Golden Set de NEXT00-04 referencia os casos conversacionais aplicáveis. Fault
injection executável pertence às fases de implementação, não a NEXT-00.

## Varredura de não escopo

- zero segredo ou valor de credencial;
- zero sessão, telefone, user/account/card ID ou dado financeiro real;
- zero chamada externa;
- zero `write_enabled` ativo;
- zero alteração no legado/runtime;
- zero provider concreto autorizado;
- zero marcador de pendência em limiar obrigatório.

Origins simbólicos (`*_registry`, `*_exact_path`) são referências a allowlists
que só ganham valores por ambiente no gate do adapter. Como todos os adapters
estão desativados, não representam limiar ou permissão pendente deste gate.

## Resultado

Os contratos 5 a 8 cobrem manifestos, 30 capacidades, budgets, falhas, métricas,
janelas, custo, latência, RPO/RTO, rollback, retenção e restore com valores
versionados. Não foi identificada contradição material com os contratos 1 a 4.

Resultado local: `GO DOCUMENTAL PARA NEXT00-04`. O GO global de NEXT-00
permanece fechado até o Golden Set, coerência final, auditoria independente e
decisão explícita de Daniel.
