# NEXT-00 — Validação final local e pacote de reauditoria

Data: 2026-08-30
Estado: `CANDIDATO LOCAL COMPLETO — REAUDITORIA PENDENTE`
Roadmap normativo: `911af93343210ccfe2d7b7fe0b898542044a1fdf`
Base do workstream: `fc577e5d5e21fdc5402ace1cf662a6ea1bef255f`
Candidato auditado anterior: `9935e497e4a688686f21f5bd351eba04449bd40e`

## Alcance

Esta validação trata somente o candidato documental de `NEXT-00`. Ela não
autoriza `NEXT-01`, implementação, model call, writer, integração real, deploy,
produção, migração, canário ou acesso a dados privados.

## Confronto dos pareceres independentes

O Claude emitiu `APROVÁVEL`: confirmou por leitura direta a arquitetura, as
contagens atuais, a ausência de runtime e a coerência do corpus. O Chat emitiu
`APROVÁVEL APÓS AJUSTES` e encontrou dois riscos causais que a inspeção local
reproduziu:

1. perguntas quantitativas sem valor factual congelado podiam ficar verdes por
   possuir apenas marcadores semânticos;
2. a rastreabilidade `67/67` provava presença/unicidade de IDs, mas aceitava
   modos de evidência incompatíveis com propriedades de runtime.

Os findings foram aceitos porque atacam falso verde futuro. Eles não exigiram
reprojeto da arquitetura nem alteração funcional.

## Correções causais

- oracle tipado novo cobre os 56 turnos e materializa valores, unidades,
  entidade, período, time basis, coverage, evidence state e evidência;
- sentinelas quantitativas são recalculadas diretamente da fixture;
- `16/16/8/8`, os 48 IDs e as 14 dimensões são constantes independentes;
- os 67 IDs são extraídos dos oito contratos primários;
- `DA/SW/CP/MB` ganharam catálogos normativos próprios;
- policy `causal-trace-v2` impede que requisito executável seja marcado como
  prova conversacional/documental;
- limiares numéricos são verificados por campo/linha exata, não por presença
  solta de dígitos;
- sanitização ganhou detectores gerais e allowlist positiva de identidades
  sintéticas;
- estados da fixture foram alinhados a `confirmed/projected` e
  `presented/expired/superseded`;
- categoria, merchant rule, reminders, calendário e saldo inicial usados pelos
  casos passaram a existir explicitamente na fixture.

## Validação focal reproduzível

```powershell
node scripts/agent/validateFinancasBotNext00.mjs
```

Resultado local antes da validação ampla final:

```text
NEXT-00 DOCUMENTAL: PASS
required_files=26
inventory=30 capabilities,15 assets,12 do_not_port
manifests=9,write_enabled_nonempty=0
capability_slices=32,source_capabilities=30,tiers={"1":13,"2":11,"3":6,"4":2}
contract_tests=67/67,source=primary_contracts
changed_paths=23,runtime_paths=0
NEXT00-04 GOLDEN SET: PASS
cases=48,turns=56
classes={"simple":16,"multi_tool":16,"follow_up":8,"negative":8}
dimensions={"person_family":14,"account_card":18,"category":18,"period":26,"time_basis":17,"transfer":3,"invoice_payment":3,"refund":3,"projection":6,"zero":3,"empty":3,"incomplete":4,"unavailable":4,"source_coverage":14}
oracles=56,dispositions={"materialized":44,"insufficient":6,"unavailable":2,"refused":1,"blocked":3}
contract_traceability=67/67,source=primary_contracts,policy=causal-trace-v2
fixture_ids=50
```

## Ensaio de mutação do validador

`node scripts/agent/testValidateFinancasBotNextGoldenSet.mjs` executou um
baseline verde e sete mutações negativas. Oracle quantitativo incorreto, modo
causal falso, redução autorreferencial de dimensão/classe, email privado,
estado legado e evidence ref desconhecida produziram RED: `7/7`.

## Validação ampla

A execução ampla anterior foi descartada por mudança causal. Sobre o novo
candidato staged e estável, o comando foi executado uma única vez:

```text
agent-workflow: OK
git: codex/financasbot-next-00 9935e497e4a688686f21f5bd351eba04449bd40e (15 entrada(s) no status)
contexto inicial dirigido: 33213 bytes (~8304 tokens, estimativa grosseira)
```

Após essa execução, somente este resultado e o estado do checkpoint/charter
foram registrados; contratos, fixtures e validadores causais não mudaram. A
suíte ampla não foi repetida.

## Limites da evidência

- não existe runtime Next nesta fatia;
- providers, adapters, banco, WhatsApp, Google, Pluggy e OCI não foram usados;
- lease, concorrência, exactly-once, latência, custo, retenção, RPO/RTO e
  paridade runtime continuam não verdes e deferidos às fases correspondentes;
- o executor não concede GO ao próprio trabalho.

## Estado

`CANDIDATO LOCAL COMPLETO; AGUARDANDO NOVO SHA E REAUDITORIA`.

Mesmo um futuro parecer aprovável não abre NEXT-01 sem decisão explícita de
Daniel.
