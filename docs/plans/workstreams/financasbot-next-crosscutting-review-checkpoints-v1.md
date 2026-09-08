# FinançasBot Next — checkpoints transversais obrigatórios de revisão v1

Data: 2026-09-07
Status: `APROVADO PELO USUÁRIO — SUPLEMENTO OPERACIONAL AO ROADMAP RATIFICADO`

## Autoridade e relação com o roadmap

Este documento não altera nem reescreve o roadmap normativo ratificado em
`911af93343210ccfe2d7b7fe0b898542044a1fdf`. Ele acrescenta checkpoints
operacionais obrigatórios entre as fases já ratificadas, por decisão explícita
de Daniel em 2026-09-07.

O objetivo é impedir que revisões importantes dependam de memória de conversa,
lembrança do Chat ou escolha ad hoc do Codex. Quando um checkpoint estiver
vencido, ele substitui a próxima fatia de desenvolvimento até ser concluído ou
formalmente replanejado por Daniel.

## Regra de despacho Chat ↔ Codex

1. Quando o watcher devolver `CHAT_READY` após uma auditoria/recibo, o Chat deve
   primeiro consumir o recibo mecanicamente e retornar o canal a `CHAT_WORKING`.
2. Antes de selecionar ou despachar a próxima tarefa de produto, Chat e Codex
   devem confrontar este arquivo com a fase/estado atual.
3. Se o predicado de algum checkpoint estiver satisfeito e o checkpoint ainda
   não estiver resolvido, a próxima tarefa deve ser o checkpoint, não uma nova
   fatia de implementação.
4. Nenhum checkpoint pode ser considerado resolvido apenas por contagem de
   testes ou autoridade de modelo. Findings são avaliados por cadeia causal.
5. Resultado e decisão do checkpoint devem ficar versionados no GitHub antes
   de seguir.
6. O Chat não monitora o repositório em background por conta própria; esta regra
   é aplicada quando o watcher/tarefa chega à conversa ou quando Daniel pede
   continuidade. O GitHub permanece a fonte de verdade.

## CP-01 — revisão retrospectiva de herança do NEXT-01

**Vencimento:** imediato, após o recebimento/aprovação focal de N02-E e antes de
qualquer nova implementação material de NEXT-02.

**Objetivo:** usar Astra/Alto para revisar a fundação herdada do NEXT-01, não
apenas seu último delta: Tool Gateway, Model Data Boundary, SessionState/CAS,
catálogo/policy read-only, budget/failure policy, replay hermético/tripwire,
observabilidade sanitizada, ledger vazio, claims e validators/gates.

**Critério causal:** qualquer finding histórico só bloqueia se a rota ainda for
herdada pelo descendant atual. Classificar como `herdado_material`,
`historico_ja_eliminado` ou `manutencao_nao_finding`.

**Restrições:** primeira passada é somente leitura; não corrigir produto durante
a descoberta; não reauditar N02-A/B/C/D/E.

**Saída mínima:** relatório versionado com SHA histórico de referência, paths,
cadeia causal, severidade e estado no código atual.

## CP-02 — inventário de fechamento global do NEXT-02

**Vencimento:** após CP-01 resolvido e antes de declarar GO global de NEXT-02 ou
abrir NEXT-03. Deve anteceder a seleção da próxima fatia se ainda houver dúvida
sobre o que falta para fechar NEXT-02.

**Objetivo:** listar exaustivamente os critérios ainda abertos de GO do vertical,
incluindo provenance integral aplicável, Golden Set/invariantes críticos ainda
pendentes e qualquer obrigação herdada dos contratos.

**Saída:** separar `obrigatorio_para_NEXT02`, `pertence_NEXT03`,
`pertence_NEXT04_ou_depois` e `golden_v1_historico_nao_forcar_equivalencia`.
A próxima fatia deve ser derivada desse inventário, não de memória.

## CP-03 — revisão de produto da planilha e Dashboard

**Vencimento:** depois do GO global de NEXT-02 e antes da primeira implementação
de adapter real/shadow do NEXT-04 que leia ou projete Sheets/Dashboard.

**Objetivo:** revisar a planilha e o Dashboard reais como produto e como
projeções do ledger Next, com atenção a `Faturas`, `Lançamentos Cartão`,
`Parcelamentos`, `Cartões`, `Contas Financeiras` e Dashboard.

**Obrigatório:** inventariar quais campos são entrada, projeção, resumo ou
fórmula; mapear ambiguidades contra `transaction_date`, `billing_period`,
`due_date`, compra, parcela, fatura, pagamento de fatura, confirmed/projected,
coverage e provenance.

**Saída:** proposta de planilha v2 e migração reversível, classificando cada
mudança como `visual`, `adapter/projection` ou `contrato/kernel`.

**Restrições:** não alterar a planilha real nem código na primeira passada; se o
artefato real necessário não estiver disponível, registrar `INPUT_REQUIRED` em
vez de inferir seu conteúdo.

## CP-04 — auditoria de riqueza de dados Pluggy

**Vencimento:** no início do NEXT-04, antes de modificar o adapter Pluggy do Next
ou assumir que os campos atuais representam tudo o que a fonte oferece.

**Objetivo:** confrontar quatro camadas: o que o Meu Pluggy mostra ao usuário;
o que os endpoints read-only autorizados realmente retornam; o que o contrato
normaliza; e o que classificadores/reconciliação usam ou descartam.

**Matriz mínima:** `informacao | visivel_site | presente_api | normalizada |
utilizada | descartada | valor_para_next`.

Investigar especialmente provider category, merchant/name/description,
status pending/posted, parcelas, bill/billing forecast, payer/payee/transfer,
pagamento de cartão, investimentos, taxas/juros e dados de conta/cartão.

**Privacidade:** screenshot/payload financeiro bruto não deve ser commitado. Só
persistir evidência sanitizada. Não chamar `Update Item`, writer ou operação
financeira.

## CP-05 — design de enriquecimento externo de estabelecimento

**Vencimento:** somente após CP-04, se restarem lacunas reais de identificação de
merchant/categoria, e antes de qualquer implementação que pesquise a web ou
serviço externo para enriquecer transações.

**Objetivo:** definir uma policy privacy-minimized: apenas nome de estabelecimento
sanitizado pode sair; nunca valor, conta, usuário ou contexto bancário. Fonte
externa é evidência auxiliar, nunca autoridade financeira.

**Saída:** provenance, TTL/cache, conflito entre Pluggy/regra local/pesquisa,
níveis de confiança e comportamento fail-closed.

## CP-06 — decisão explícita sobre auto-save e salvamento proativo

**Vencimento:** antes de qualquer writer financeiro do NEXT-06 que possa ser
acionado por reconciliação automática e obrigatoriamente antes do NEXT-07
proativo.

**Regra padrão:** confiança alta de IA, categoria do Pluggy ou pesquisa externa
não autorizam escrita automática por si só.

**Antes de considerar dispensa de preview individual:** exigir autorização
explícita de Daniel e contrato determinístico com transação confirmada, regra
previamente autorizada, ausência de duplicidade/ambiguidade, idempotência,
receipt/reconcile/undo e limites de escopo. Classificação/metadado reversível é
separado de autorização de writer.

## CP-07 — supersessão/aposentadoria do Golden Set v1

**Vencimento:** avaliação por domínio durante NEXT-08/NEXT-09; decisão final de
aposentadoria histórica somente no NEXT-10.

**Regra:** não editar nem apagar os quatro artefatos Golden v1 congelados para
fazer o Next passar. Cada domínio pode ser marcado como `SUPERSEDED` apenas após
traceability demonstrar cobertura do replacement e o cutover daquela capacidade
estar verde ou explicitamente aceito por Daniel.

O conjunto v1 deve permanecer preservado como evidência histórica mesmo após a
substituição funcional integral.

## Ordem vigente em 2026-09-08

CP-01 resolvido após correção e reauditoria APROVÁVEL de
`f0792fbf7d3fdf88d0ac6fc744da89c8cf83b4e6`, parent
`5239c342b5705e64d3fb6412048382d665bcb6a4`. Recibo e limites:
`docs/agent-memory/workstreams/results/FIN-CP01-CORRECTIONS-AUDIT-20260908.md`.
Próximo checkpoint obrigatório: **CP-02**. Inventariar obrigações abertas
antes de selecionar nova implementação ou declarar GO global NEXT-02.

## Histórico da ordem em 2026-09-07

N02-E foi aprovado focalmente. Portanto o próximo checkpoint obrigatório é
**CP-01**. Nenhuma nova fatia material de NEXT-02 deve começar antes de sua
conclusão/reconciliação causal.
