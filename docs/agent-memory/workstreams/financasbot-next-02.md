# Workstream — FinançasBot Next / NEXT-02

Atualizado em: 2026-09-05
Status: `OPEN — N02-A CORRIGIDO; LOCAL VERDE; REAUDITORIA PENDENTE`

## Git e isolamento

- Branch: `codex/financasbot-next-02`.
- Worktree: `.codex-worktrees/financasbot-next-02`.
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
Próxima ação: publicar o novo candidato corretivo e obter reauditoria pelo
bot/canal de retorno existente. Não declarar
fechamento do NEXT-02 nem repetir auditoria automática do mesmo hash.
Parcelas, outras bases temporais, Golden Set completo e motor de provenance
continuam pendentes. O ledger do v1 não foi importado nem alterado.
Telemetria opcional: coletor configurado, mas parado/não saudável na consulta
inicial; métricas desta tarefa indisponíveis, não zero.

## Publicação e tentativa de auditoria

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

Candidato corretivo imutável publicado em
`4a6396000d15d98969b8291d6c162e5aafcd04b9`, parent direto
`5d4339f46a9ec412d6c86894853435c7238dbcf1`, branch
`codex/financasbot-next-02-n02a-v2`. Gate final vinculado aos dois hashes:
PASS; SHA remoto confirmado. A única tentativa automática de reauditoria foi
enviada e confirmada pelo bot em 2026-09-05. Aguardar o retorno auditável sem
reenviar o mesmo hash; o acompanhamento automático já aponta para esse
candidato.

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
