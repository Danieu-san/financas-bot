# Financial Query Security Audit

Atualizado em: 2026-06-05

## Resumo executivo

Esta auditoria aplicou o checklist de seguranca LLM/dados aos artefatos da
Financial Query criados antes da implementacao em capacidade alta.

Resultado documental:

- Nenhum `BLOCKER` documental encontrado apos a correcao incluida nesta etapa.
- A arquitetura, o contrato, o roadmap, os pacotes e a bateria estao alinhados
  na regra central: Gemini nao calcula valores financeiros e nao recebe dados
  crus.
- A principal ambiguidade encontrada foi na bateria de aceite: casos com
  `security/block` e `clarify` precisam ser entendidos como resultados de
  Security Gate ou roteamento pre-plano, nao como operacoes executaveis de
  `FinancialQueryPlan`.
- O risco de admin amplo permanece como excecao temporaria de beta e gate de
  producao, conforme ADR-002. Isso nao bloqueia a documentacao da Query Engine,
  mas bloqueia escala multiusuario real se for reintroduzido ou mantido como
  padrao.

## Escopo auditado

- `docs/specs/financial-query-architecture.md`
- `docs/specs/financial-query-coverage-matrix.md`
- `docs/specs/financial-query-plan-contract.md`
- `docs/specs/financial-query-migration-roadmap.md`
- `docs/specs/implementation-packets/`
- `docs/qa/financial-query-acceptance-battery.md`
- `docs/security/threat-model.md`
- `docs/decisions/ADR-002-admin-financial-data-access.md`
- `docs/runbooks/release-checklist.md`

## Taxonomia de severidade

| Severidade | Regra |
| --- | --- |
| `BLOCKER` | Precisa corrigir antes de implementar codigo. |
| `HIGH` | Corrigir antes de beta real ou antes do dominio afetado. |
| `MEDIUM` | Acompanhar e fechar no pacote correspondente. |
| `LOW` | Melhoria documental ou operacional. |

## Tabela de achados

| ID | Severidade | Area | Evidencia | Recomendacao | Status |
| --- | --- | --- | --- | --- | --- |
| FQSA-001 | MEDIUM | Bateria de aceite | `financial-query-acceptance-battery.md` usa `security/block` e `clarify` em casos adversariais, ambiguos ou de separacao comando/consulta. Esses valores nao constam como operacoes executaveis do plano. | Documentar que `security`, `block` e `clarify` representam resultado pre-plano de Security Gate/roteamento/clarificacao, e nunca chegam a Query Engine como `FinancialQueryPlan.operation`. | CORRIGIDO nesta etapa. |
| FQSA-002 | LOW | Uploads e rate limit | Uploads e DoS ficam fora da Query Engine, mas afetam o mesmo bot financeiro multiusuario. | Manter uploads e rate limit no checklist global mesmo quando o pacote for read-only. | CORRIGIDO nesta etapa. |
| FQSA-003 | HIGH | Admin/dashboard | ADR-002 permite admin all-users apenas como excecao temporaria de beta/teste. Release checklist ja exige bloqueio por padrao. | Nao implementar pacote que trate admin amplo como caminho normal. Antes de beta real, remover ou substituir por suporte consentido/auditado. | ABERTO como gate de produto. |
| FQSA-004 | LOW | Campos proibidos | Contrato e arquitetura listam campos proibidos como `user_id`, `sheet_id`, tokens, prompts internos, `rawRows`, `allUsers` e `admin`. A auditoria nao encontrou esses campos como exemplos permitidos nos novos docs de Query. | Manter scans de docs e testes de normalizacao para evitar regressao. | PASS. |
| FQSA-005 | MEDIUM | Familia/escopo | Matriz, roadmap e pacotes exigem escopo familiar fora do LLM; pacote 09 consolida o Scope Resolver depois dos dominios principais. | Ao implementar pacotes 01-08, nao esperar o pacote 09 para proteger leituras familiares; cada dominio deve chamar resolucao de escopo segura desde o primeiro uso. | ACOMPANHAR por pacote. |
| FQSA-006 | MEDIUM | Gemini/dados sensiveis | Arquitetura e contrato dizem que Gemini retorna plano ou texto final sem calcular; threat model diz enviar contexto sumarizado. | Criar testes que provem que planner LLM nao recebe linhas cruas e que Response Composer nao recalcula valores. | ACOMPANHAR por pacote. |
| FQSA-007 | LOW | Logs | Threat model e checklist exigem logs sanitizados; release checklist ja menciona AdminActionLog e dashboard access log. | Adicionar grep de logs ao checklist de release quando pacotes passarem a registrar lacunas de planner/engine. | ACOMPANHAR. |

## Conferencia por tema do checklist

| Tema | Resultado documental | Observacao |
| --- | --- | --- |
| Prompt injection e prompt probing | PASS | Arquitetura exige Security Gate antes do planner; bateria adversarial cobre bypass, prompt interno, admin falso e pedido misto. |
| Vazamento de dados internos | PASS | Contrato lista campos proibidos; arquitetura rejeita IDs, tokens, prompts e linhas cruas. |
| Vazamento entre usuarios | PASS com risco aberto | Escopo fora do LLM esta documentado; risco operacional continua alto e precisa de testes por pacote. |
| Dashboard token | PASS com gate aberto | Threat model e release checklist cobrem fragmento, TTL, no-store/no-referrer e logs sanitizados; admin all-users continua gate de produto. |
| Familia | PASS com acompanhamento | Matriz, roadmap e pacote 09 exigem autorizacao fora do LLM; implementacao deve validar remocao de vinculo. |
| Admin | PASS com HIGH aberto | ADR-002 e release checklist bloqueiam admin amplo por padrao; excecao de beta precisa continuar controlada. |
| Logs | PASS com acompanhamento | Regras existem; cada pacote deve provar que lacunas e erros nao gravam conteudo financeiro cru. |
| Uploads/importacao | PASS | Threat model ja limita CSV/OFX, tamanho/linhas e proibe arquivo bruto no LLM; checklist torna isso gate global. |
| Rate limit/DoS | PASS | Threat model e checklist cobrem rate limit, read-model/cache e quota/circuit breaker. |
| Dados sensiveis no Gemini | PASS | Todos os novos specs mantem a regra de dados minimos/sumarizados e nenhum calculo financeiro no Gemini. |

## Inconsistencias entre docs

### `block` e `clarify` na bateria

O contrato define `sum`, `count`, `list`, `detail`, `group`, `rank`, `compare`,
`trend`, `average`, `percentage`, `extreme`, `explain`, `search`, `detect`,
`forecast` e `recommend` como operacoes executaveis de
`FinancialQueryPlan`.

Ja `block` e `clarify` aparecem no contrato como resultados logicos do
planejamento/validacao, nao como operacoes da Query Engine. A bateria agora
explicita essa fronteira: linhas com `Dominio esperado=security` ou `Operacao
esperada=block/clarify` sao resultados esperados antes da execucao de plano.

### Campos proibidos

Campos proibidos aparecem nos docs como exemplos de bloqueio ou listas de
negacao, nao como filtros permitidos. Isso esta coerente com o contrato.

### Escopo familiar

Os docs convergem na mesma regra: o LLM pode reconhecer linguagem como
"familia" ou nome publico de membro, mas o codigo resolve permissao real fora
do LLM.

### Dashboard/admin

ADR-002, threat model e release checklist convergem: admin all-users e excecao
temporaria de beta/teste, nao caminho normal de produto. Pacotes 09 e 10 tambem
repetem que dashboard admin amplo continua bloqueado por padrao.

### Uploads e rate limit

Uploads e rate limit ficam fora da Query Engine, mas a auditoria confirma que
eles precisam permanecer no checklist porque o bot inteiro compartilha o mesmo
canal WhatsApp, logs, quota e recursos.

### Gemini

Nao foi encontrado doc novo sugerindo que Gemini possa calcular totais,
percentuais, rankings, saldos, faturas, orcamento, metas ou dividas. A regra
esta consistente: Gemini pode interpretar linguagem natural ou melhorar texto,
mas os valores finais vem de codigo deterministico.

## Riscos abertos

| Risco | Severidade | Dono recomendado | Quando fechar |
| --- | --- | --- | --- |
| Admin all-users de beta virar habito operacional. | HIGH | Produto/seguranca | Antes de beta real amplo ou qualquer uso multiusuario escalado. |
| Pacotes 01-08 implementarem familia sem esperar o Scope Resolver consolidado. | MEDIUM | Implementador de cada pacote | Em cada pacote, com teste de usuario A/B e membro familiar. |
| Lacunas de fallback registrarem texto financeiro cru. | MEDIUM | Implementador do planner/observabilidade | Antes de ativar logs de lacunas em producao. |
| Planner LLM receber contexto demais para resolver pergunta livre. | MEDIUM | Implementador do planner LLM | Antes de habilitar fallback LLM para dominio migrado. |
| Dashboard e WhatsApp divergirem em base temporal. | MEDIUM | Pacote 10 | Antes de considerar dashboard/resumos migrados. |

## Recomendacoes antes da implementacao em capacidade alta

1. Comecar pelo pacote 01 (`expenses`) e aplicar este checklist antes de tocar
   codigo.
2. Criar testes para Security Gate e validacao de plano usando os casos
   adversariais da bateria.
3. Garantir que `block` e `clarify` nunca cheguem a
   `executeFinancialQuery` como operacao executavel.
4. Em cada pacote, adicionar pelo menos um teste de escopo pessoal e um de
   escopo familiar quando o dominio puder cruzar usuarios.
5. Registrar lacunas como `planner_gap`, `engine_gap`, `scope_gap`,
   `time_basis_gap` ou `response_gap`, sempre sanitizadas.
6. Manter admin/dashboard fora da Query Engine; comandos admin e emissao de
   link continuam sendo Command Engine ou fluxo proprio.
7. Antes de release, rodar o release checklist e revisar ADR-002 se houver
   qualquer alteracao em dashboard/admin/familia.

## Criterio de conclusao da auditoria

Esta etapa documental pode ser considerada concluida porque:

- o checklist obrigatorio foi criado;
- a auditoria aplicou o checklist aos artefatos existentes;
- a inconsistencia pequena sobre `block`/`clarify` foi corrigida na bateria;
- nao ha `BLOCKER` documental restante;
- os riscos abertos ficaram classificados e vinculados aos pacotes futuros.
