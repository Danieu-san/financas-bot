# NEXT-00 — Validação final local e pacote de auditoria

Data: 2026-08-30
Estado: `CANDIDATO LOCAL — AGUARDANDO AUDITORIA INDEPENDENTE`
Roadmap normativo: `911af93343210ccfe2d7b7fe0b898542044a1fdf`
Base do workstream: `fc577e5d5e21fdc5402ace1cf662a6ea1bef255f`

## Alcance

Esta validação fecha somente o candidato documental de `NEXT-00`. Ela não
autoriza `NEXT-01`, implementação, integração real, model call, writer, deploy,
produção, migração, canário ou acesso a dados privados.

## Artefatos auditáveis

1. charter e ratificação do roadmap;
2. inventário e taxonomia do legado;
3. oito contratos em `docs/contracts/next/`;
4. duas validações cruzadas dos contratos;
5. fixture financeira e Golden Conversation Set v1;
6. validação focal do Golden Set;
7. validadores documentais locais;
8. checkpoint exclusivo do workstream.

Os caminhos exatos constam no checkpoint
`docs/agent-memory/workstreams/financasbot-next-00.md`.

## Revisão adversarial local

### Autoridade e realimentação

- ledger Next permanece a única autoridade semântica;
- Pluggy, Sheets e importações são observações, não autoridades concorrentes;
- projeção carrega origem e não reentra como observação;
- dashboard v2 e WhatsApp usam os mesmos claims do kernel.

### Concorrência e efeitos

- writer, notifier, scheduler e cursor possuem ownership por
  `{environment, family_id, capability}`;
- lease, fencing e epoch são obrigatórios;
- shadow é read-only;
- proposta é imutável, versionada, expira e confirma por CAS;
- concorrência, retry, crash e efeitos uncertain permanecem provas executáveis
  de fases posteriores, não falsos verdes conversacionais.

### IA e privacidade

- IA interpreta, escolhe tools e explica claims;
- identidade, escopo, source, matemática e efeitos não são autoridade do
  modelo;
- falha factual, de scope ou coverage é fail-closed;
- provider e adapter nascem sem authority e sem write habilitado;
- nenhum segredo, token, chave ou dado financeiro real integra fixtures ou
  documentos do candidato.

### Preservação funcional

- inventário contém 30 capacidades, 15 ativos reaproveitáveis e 12 itens
  `DO_NOT_PORT`;
- matriz contém 32 slices correspondentes a 30 capacidades de origem;
- tiers são 13 beta, 11 cutover, 6 retirement e 2 pós-MVP;
- dashboard v2, gasto por categoria, família, Calendar, lembretes, writers,
  Open Finance, regras aprendidas, projeções e integrações futuras permanecem
  visíveis nos gates apropriados.

## Validação focal reproduzível

```powershell
node scripts/agent/validateFinancasBotNext00.mjs
```

Resultado local:

```text
NEXT-00 DOCUMENTAL: PASS
required_files=20
inventory=30 capabilities,15 assets,12 do_not_port
manifests=9,write_enabled_nonempty=0
capability_slices=32,source_capabilities=30,tiers={"1":13,"2":11,"3":6,"4":2}
contract_tests=67/67
changed_paths=22,runtime_paths=0
NEXT00-04 GOLDEN SET: PASS
cases=48
classes={"simple":16,"multi_tool":16,"follow_up":8,"negative":8}
dimensions={"person_family":14,"account_card":18,"category":18,"period":26,"time_basis":17,"transfer":3,"invoice_payment":3,"refund":3,"projection":6,"zero":3,"empty":3,"incomplete":4,"unavailable":4,"source_coverage":14}
contract_traceability=67/67
fixture_ids=48
```

O validador extrai os IDs contratuais das fontes versionadas, diferencia prova
conversacional de prova executável deferida, proíbe caminhos de runtime no diff
e falha se qualquer manifest habilitar escrita.

## Validação ampla do workflow

Comando executado uma única vez sobre o candidato staged:

```powershell
node scripts/agent/validateAgentWorkflow.js
```

Resultado:

```text
agent-workflow: OK
git: codex/financasbot-next-00 64afb093b384dd5444a8a5bfff2dca8cafc7ac90 (4 entrada(s) no status)
contexto inicial dirigido: 33213 bytes (~8304 tokens, estimativa grosseira)
```

Nenhuma mudança causal de contrato, fixture ou validação ocorreu depois dessa
execução; as alterações subsequentes registram somente o próprio resultado.

## Achados da revisão local

O primeiro passe RED do validador revelou falsos positivos do próprio teste:
menções proibitivas a `TBD`, o termo português “todo”, o schema de
`write_enabled`, separador `1.000` e dois arquivos legítimos de abertura do
workstream. As regras foram corrigidas; nenhum contrato precisou ser afrouxado.

Nenhuma contradição material foi encontrada entre autoridade, single-writer,
proposta/CAS, Model Data Boundary, matriz, Tool Budget, retenção e Golden Set.

## Limites da evidência

- não existe runtime Next nesta fatia;
- não foram executados providers, adapters, banco, WhatsApp, Google, Pluggy ou
  OCI;
- nenhuma propriedade de produção, latência real, custo real, RPO/RTO ou
  exactly-once foi declarada verde;
- essas propriedades continuam bloqueadas pelos gates executáveis do roadmap.

## Parecer local

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

O executor não concede GO ao próprio trabalho. O auditor deve confirmar o hash
imutável, ler integralmente os caminhos indicados, verificar os critérios de GO
e emitir `APROVÁVEL`, `APROVÁVEL APÓS AJUSTES` ou `NO-GO`, com achados por
severidade. Mesmo um parecer aprovável não abre `NEXT-01` sem decisão explícita
de Daniel.
