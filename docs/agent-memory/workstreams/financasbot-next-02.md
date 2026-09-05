# Workstream — FinançasBot Next / NEXT-02

Atualizado em: 2026-09-05
Status: `OPEN — N02-A APROVÁVEL; N02-B LOCAL VERDE; AUDITORIA PENDENTE`

## Checkpoint N02-B em desenvolvimento

### Estado atual consolidado

N02-B está limitado à agenda interna derivada de observações v2, sem consulta
pública billing_period. Gate precommit 31/31; bateria afetada 104/104.
Suíte ampla única concluída: 1.960 testes, 1.950 PASS, 0 FAIL, 10 SKIP
previstos, 0 TODO, runner valid=true, exit_status=0 (sessão 59624 encerrada).
Próxima ação: workflow/diff finais, commit com parent
`4a6396000d15d98969b8291d6c162e5aafcd04b9`, gate vinculado ao novo SHA e
publicação para auditoria independente. Não repetir suíte verde sem mudança
causal. Não enviar pelo navegador; usar somente o bot/canal autorizado.

### Histórico local de desenvolvimento (não é estado pendente vigente)

Estado vigente: escopo estabilizado como agenda observada interna (sem lente
pública por competência); gate precommit 31/31 e bateria afetada 104/104 PASS.
Próxima ação: executar uma única suíte hermética ampla, consolidar evidências
e preparar commit/auditoria. Os parágrafos de evolução abaixo são históricos
do desenvolvimento, não falhas ainda presentes no inventário ou na integração.
Suíte ampla N02-B iniciada nesta retomada por `npm test`, sessão de execução
local `59624`. Aguardar/coletar essa execução; não iniciar outra enquanto o
resultado estiver pendente. Nenhum resultado amplo N02-B observado ainda.

Primeira unidade local em `src/next/kernel/installmentSchedule.js`: projetor
interno puro com vínculo explícito, soma BigInt, parcelas observadas sem
inferência, estado confirmado/projetado preservado e saída imutável.
Teste novo: `tests/next02InstallmentSchedule.test.js`. RED inicial por módulo
ausente. Revisão adversarial encontrou agenda parcial que consumia todo o
valor, tornando impossíveis as parcelas positivas restantes; RED comportamental
confirmado e corrigido por soma observada + mínimo das faltantes <= compra.
Syntax check e 7/7 testes focais PASS; com referência v1, 14/14 PASS, zero skips.
Teste de accessor confirma rejeição sem executar getter.
Limite de recursos desta policy sintética: 2..999 parcelas; não é limite
financeiro geral. Agenda completa significa índices/soma completos, não
consumo confirmado nem coverage de consulta.

Ainda não pronto: revisão adversarial, integração com observações/provenance,
contrato de coverage por lente e estornos, integração ao gate/inventário e
testes afetados. O inventário N02-A permanece em 14 fontes; a nova fonte ainda
não foi admitida pelo gate, portanto não alegar gate verde nesta worktree.
Não executada suíte ampla, não criado commit, não solicitada auditoria.
Integração local iniciada por policy explícita `next02-import-v2`: campos novos
entram na observação assinada e em field_provenance; parcelas apontam à compra
atual pelo registro de origem e link installment_of. Policy v1 permanece default
e rejeita entrada v2 sem opt-in. Não existe integração pública billing_period.
Última bateria: 28/29 PASS; única falha é NEXT02:GATE rejeitando corretamente
a fonte nova ainda fora do inventário. Os 9 testes N02-B passaram.
Proveniência de aliases corrigida após RED: index/total resolvem para
installment_index/installment_total e purchase_ref para a aresta installment_of;
as referências agora fixam versões dos eventos. Testes de tombstone preservam
histórico e invalidam a agenda atual. N02-B focal: 10/10 PASS, sem skips.
Gate integrado por `--slice N02-B`: precommit PASS, 15 fontes exatas e 31/31
IDs vindos de eventos estruturados (20 regressões N02-A + 11 N02-B). Default
N02-A mantém 14 fontes e rejeita a extensão, em vez de absorvê-la silenciosamente.
O parent final esperado de N02-B é `4a6396000d15d98969b8291d6c162e5aafcd04b9`.
Próxima ação: revisão adversarial do delta completo e bateria afetada; definir
se esta unidade de agenda/observações forma candidato incremental antes da
lente pública, mantendo coverage/estornos fora da alegação. Não executar suíte
ampla enquanto esse escopo ainda não estiver estabilizado. Não
alegar N02-A byte-idêntico: seu comportamento default foi preservado, mas o
módulo compartilhado foi alterado e exige nova auditoria no candidato final.

## Git e isolamento

- Branch ativa: `codex/financasbot-next-02-n02a-v2`.
- Worktree ativa: `.codex-worktrees/financasbot-next-02-n02a-v2`.
- Base: `29791be6ba3f80fc8033bd6cb715484e7275a3c5`.
- A raiz principal possui alterações alheias preservadas.

## Decisão e evidência

NEXT-01 aprovado no candidato `9b0cfd848d08b85ed94016b65f07820ca89dbbfb`;
parecer em `results/FIN-NEXT01-AST-REAUDIT-20260903.md`, incluído na base.
Daniel autorizou a passagem de fase em 2026-09-03. Não reenviar o mesmo
candidato aprovado para uma auditoria duplicada.

## Objetivo, limites e próxima ação

Charter: `docs/plans/workstreams/financasbot-next-02.md`.
Vertical sintético read-only de gastos por categoria/pessoa/instrumento/período.
Reutilização e escopo da fatia: `docs/plans/workstreams/financasbot-next-02-kernel-reuse-v1.md`.
Evidências: `docs/plans/workstreams/financasbot-next-02-validation-v1.md`.
N02-A: observações/versionamento e consumo transaction_date com gateway
read-only; 20/20 propriedades focais, 86/86 na bateria afetada.
Suíte ampla única: 1.949 testes, 1.939 PASS, 0 FAIL, 10 SKIP previstos,
0 TODO, runner valid=true. Workflow OK.
Próxima ação: mapear a fatia incremental seguinte de parcelas e lentes temporais
contra contratos, Golden Set e comportamento v1, registrando escopo e REDs antes
de qualquer patch funcional. Não declarar fechamento do NEXT-02 nem repetir
auditoria do hash N02-A aprovado.
Parcelas, outras bases temporais, Golden Set completo e motor de provenance
continuam pendentes. O ledger do v1 não foi importado nem alterado.
Telemetria opcional: coletor configurado, mas parado/não saudável na consulta
inicial; métricas desta tarefa indisponíveis, não zero.

## Publicação e tentativa de auditoria

### Estado vigente após retorno em 2026-09-05

Parecer independente: **APROVÁVEL para N02-A** no SHA
`4a6396000d15d98969b8291d6c162e5aafcd04b9`, parent único
`5d4339f46a9ec412d6c86894853435c7238dbcf1`.
Fonte no canal de orquestração: `results/FIN-NEXT02-N02A-CORRECTED-REAUDIT-20260905.md`;
recebimento publicado em `be77a942e36970010e2a7548f63dd21cb45e7548`.
O confronto local confirmou os pontos de implementação e os testes TOOL,
DA-03 e DA-04 citados pelo auditor: tradução pública somente no adapter,
coverage completa após fim integral e cartão liquidado com field_provenance.
Nenhuma suíte verde foi repetida nesta reconciliação. Os números abaixo são
evidência anterior do candidato, não execução independente pelo auditor.
Aprovação focal não encerra NEXT-02 e não abre NEXT-03.

### Histórico anterior ao parecer corrigido

Candidato imutável: `af83a4e0cd79de5e582ce2bd030eb0328da32d52`.
Parent: `5d4339f46a9ec412d6c86894853435c7238dbcf1`.
Gate final vinculado a esses hashes: PASS. Push e hash remoto confirmados.

Em 2026-09-03, uma tentativa pelo bot local terminou com timeout de 90 segundos
aguardando login/abertura da conversa. Em 2026-09-05, após Daniel restabelecer
a sessão e autorizar a retomada, o bot confirmou o envio do prompt completo à
conversa configurada. Auditoria em andamento; nenhum parecer recebido ainda.
Não repetir automaticamente, não usar envio direto pelo navegador e não refazer
implementação ou suíte enquanto o retorno estiver pendente. Este registro
posterior não altera o commit objeto da auditoria.

O retorno auditável chegou em 2026-09-05 com NO-GO focal: a boundary pública
expunha/aceitava IDs internos, coverage completa podia terminar depois de
`as_of`, e pagamento de fatura perdia `settles_card_id`. O delta corretivo
traduz labels públicas somente no adapter, usa handles de evidência locais à
resposta, exige fim integral do intervalo para coverage completa e preserva o
cartão liquidado com proveniência de campo. Gateway NEXT-01, runtime v1,
adapters reais, writers e produção não foram alterados.

Evidência após a correção: gate 20/20; bateria afetada 86/86; suíte ampla única
1.949 testes, 1.939 PASS, 0 FAIL, 10 SKIP previstos, runner valid=true. Novo
hash ainda precisa ser publicado e reauditado; esses verdes não são GO.

Em 2026-09-05, Daniel autorizou a continuidade autônoma em esforço Alto após o
retorno da auditoria, inclusive correções, validações proporcionais, commits e
pushes necessários dentro do NEXT-02, sem novas pausas para troca de capacidade.
Um acompanhamento silencioso desta conversa deve permanecer inerte enquanto o
parecer não chegar e retomar o workstream quando houver retorno auditável. Essa
autorização não inclui NEXT-03, deploy, produção, dados reais, writers ou
adapters reais e não remove a auditoria independente obrigatória de cada novo
hash material.
NEXT-03, adapters reais, writers, deploy e produção continuam fora do escopo.
Capacidade recomendada para a implementação entre módulos: Codex / Sol / Alto.
