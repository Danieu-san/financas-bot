# NEXT00-02 — Validação cruzada dos contratos 1 a 4

Atualizado em: 2026-08-30
Estado: `GREEN — DOCUMENTAL; ZERO RUNTIME`
Roadmap normativo: `911af93343210ccfe2d7b7fe0b898542044a1fdf`

## Escopo validado

- `docs/contracts/next/data-authority-contract-v0.md`;
- `docs/contracts/next/coexistence-single-writer-contract-v0.md`;
- `docs/contracts/next/conversation-proposal-contract-v0.md`;
- `docs/contracts/next/model-data-boundary-contract-v0.md`.

Esta validação prova coerência documental e testabilidade. Não prova uma
implementação inexistente e não autoriza NEXT-01, fonte real, writer, migração,
canário, deploy ou produção.

## Matriz de obrigações

| Obrigação do roadmap | Contrato e decisão | Estado |
|---|---|---|
| Observation → Event → Projection | Data Authority §§1, 3, 4 e 8 | coberta |
| schema v0, links e identidade | Data Authority §§3–4 | coberta |
| source precedence versionada | Data Authority §5 | coberta |
| evidence/coverage e estados vazios | Data Authority §6 | coberta |
| double-count | Data Authority §7 | coberta |
| anti-realimentação | Data Authority §8 | coberta |
| owner único por família/capability | Single-Writer §§1–2 | coberta |
| lease, fencing e epoch | Single-Writer §§3–5 | coberta |
| shadow estritamente read-only | Single-Writer §6 | coberta |
| scheduler/cursor/notifier | Single-Writer §7 | coberta |
| crash, split-brain e uncertain | Single-Writer §8 | coberta |
| sessão monotônica e durável | Conversation §2 | coberta |
| proposal/hash/observation version/TTL | Conversation §3 | coberta |
| CAS e estados | Conversation §§4 e 7 | coberta |
| “sim” inequivocamente correlacionado | Conversation §6 | coberta |
| mudança material invalida preview | Conversation §8 | coberta |
| campos permitidos/proibidos ao modelo | Model Boundary §§2–5 | coberta |
| scope familiar server-side | Model Boundary §6 | coberta |
| retenção/treinamento/região | Model Boundary §7 | coberta |
| segregação de ambientes | Model Boundary §8 | coberta |
| saída não autoritativa | Model Boundary §9 | coberta |
| troca/falha de provider | Model Boundary §§11–12 | coberta |

## Decisões cruzadas

### Autoridade semântica não é ownership operacional

O ledger Next será a autoridade semântica a partir de NEXT-02. Isso não concede
automaticamente authority `write`, `notify`, `schedule` ou `cursor`. Essas
autoridades migram separadamente por lease/fencing. Logo, a convivência não
cria duas verdades e a adoção semântica não faz cutover operacional implícito.

### Proposta não é lease nem autorização

Uma proposta válida prova somente que um payload foi preparado e apresentado.
No commit, autorização, observações, economic identity e lease são revalidados.
Nem `proposal_id`, nem confirmação textual, nem posse anterior do lease bastam
isoladamente para executar efeito.

### Modelo não participa das chaves de controle

Family/actor/account/card IDs, source policy, economic identity, proposal hash,
idempotency key, lease, epoch e fencing token são server-side. A IA recebe
labels/refs efêmeras e claims minimizados; por isso não consegue ampliar escopo,
escolher fonte ou construir uma confirmação tecnicamente válida.

### Writer não realimenta projeção

Writer confirmado cria observação `committed` ligada a operation/receipt. A
projeção derivada leva `origin_operation_id`. O ingestor reconhece esse origin e
não transforma a linha projetada em segundo evento. Alteração material da
projeção vai para revisão, não vira verdade por ordem de chegada.

### Manual e proativo compartilham identidade econômica

As duas rotas produzem propostas distintas, mas o kernel calcula a mesma
`economic_identity_key` quando representam a mesma ocorrência. CAS,
idempotência e o writer cercado permitem uma única reivindicação.

### Resultado incerto não é retry automático

Timeout depois de possível efeito move a operação para `uncertain`. Proposal,
lease e outbox não repetem o efeito; a reconciliação consulta receipt/destino e
só então finaliza ou falha.

## Máquinas de estado compatíveis

| Entidade | Estado antes do efeito | Fronteira de efeito | Estado conclusivo |
|---|---|---|---|
| Proposal | `presented -> confirmed` por CAS | `committing` | `reconciled` |
| Fenced operation | `prepared -> claimed` | `executing` | `reconciled` |
| Lease | `active`, epoch vigente | validação antes do adapter | continua `active` ou é transferido |
| Observation/Event | observation append-only | writer gera receipt | event version/projection |
| Model call | envelope minimizado | nenhuma permissão de efeito | texto/schema não confiável |

`committed` sem reconciliação não é conclusão; `uncertain` bloqueia repetição
cega nas máquinas de Proposal e Fenced Operation.

## Catálogo de testes documentais

| ID | Caso negativo | Resultado obrigatório |
|---|---|---|
| DA-01 | replay da mesma source version | um evento |
| DA-02 | projeção Next reaparece no source | rejeitar reingestão |
| DA-03 | coverage parcial com soma 0 | `incomplete`, não zero |
| DA-04 | compra + pagamento de fatura | consumo contado uma vez |
| DA-05 | transferência interna em duas pontas | neutra no agregado familiar |
| DA-06 | totais iguais, identidades distintas | não fundir |
| SW-01 | dois runtimes adquirem o mesmo owner | um lease ativo |
| SW-02 | stale epoch tenta escrever | falhar antes do efeito |
| SW-03 | timeout após provável commit | `uncertain`, reconciliar |
| SW-04 | shadow tenta avançar cursor | bloquear |
| SW-05 | rollback | emitir epoch novo |
| CP-01 | “sim” com duas propostas | exigir identificador |
| CP-02 | preview não entregue | confirmação inválida |
| CP-03 | observação material muda | supersede e novo preview |
| CP-04 | dupla confirmação concorrente | um CAS vence |
| CP-05 | restart após efeito sem receipt | reconciliar sem duplicar |
| MB-01 | token/ID/path aninhado | bloquear model call |
| MB-02 | ID hash estável | bloquear correlação |
| MB-03 | modelo tenta escolher scope/source | rejeitar saída |
| MB-04 | provider não registrado | falhar fechado |
| MB-05 | prompt injection em descrição | tratar como dado |

Os testes executáveis serão implementados somente nas fases autorizadas do
roadmap. O Golden Set de NEXT00-04 referencia estes IDs sem conter dados reais.

## Pontos deliberadamente reservados ao NEXT00-03

Não são lacunas destes quatro contratos:

- duração/renovação de lease e RTO numérico;
- catálogo definitivo de capability e tiers de cutover;
- registro concreto de providers/adapters autorizados;
- limites de tool calls, repetição, latência e custo;
- retenção local de ledger/backups e janela de estabilidade.

O NEXT00-03 precisa fixá-los numericamente, sem `TBD`, antes de qualquer teste
que os julgue. Os fundamentos já estão congelados aqui: fail-closed, owner único,
scope server-side, retenção de provider máxima de 30 dias e proposal TTL padrão
de 10 minutos/máximo de 30.

## Inspeção de reaproveitamento

Ativos legados examinados confirmam utilidade restrita de:

- operation key, payload sanitizado e estados `pending/committed/uncertain`;
- rollout fail-closed e shadow sem efeito;
- escopo confiável e remoção de IDs dos resultados ao modelo;
- proposal store durável, expiry, receipt e reconciliação;
- fingerprints e agenda de parcelas.

Nenhum runtime foi classificado `PORT_AS_IS`. O contrato prevalece sobre o
comportamento atual; divergência exige rewrite ou adapter atrás da nova
fronteira.

## Resultado

Os quatro contratos cobrem as obrigações de NEXT00-02, possuem schemas mínimos,
estados, transições, testes negativos e decisões cruzadas consistentes. Não foi
identificada contradição material entre autoridade do ledger, leases,
proposal/CAS ou fronteira do modelo.

Resultado local: `GO DOCUMENTAL PARA NEXT00-03`, sujeito ao checkpoint e à
validação do workflow. O GO global de NEXT-00 permanece fechado até NEXT00-05 e
auditoria independente final por hash imutável.
