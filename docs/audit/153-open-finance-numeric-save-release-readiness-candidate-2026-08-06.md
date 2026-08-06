# OF-NUMERIC-SAVE-RELEASE-01 - candidato de prontidao

Data: 2026-08-06

## Objetivo auditavel

Provar localmente, antes de qualquer deploy, que o fluxo numerico encerrado no
gate 32 e compativel com o conjunto persistido e que somente eventos elegiveis
a partir do corte operacional de `2026-07-28` podem chegar ao lote. O candidato
parte de `25c7c6be8953214aa1e4310403a006efcc9c88bb` e nao acessa producao.

## Contrato implementado

- valida exatamente os quatro aliases e exige ativacao individual no corte ou
  depois dele;
- exige alerta, preview e reconciliacao em `canary`, proposta em `prompt`,
  escrita `off` e aprovacao falsa;
- cria um bundle v3 com staging, baseline, outbox, preview, journal de
  revogacao, ancora terminal e state store cifrado, incluindo replay
  autenticado quando presente;
- rejeita arquivo temporario, checksum divergente, arquivo inesperado, replay
  adulterado ou duplicado, caminho de origem que escape fisicamente da copia e
  work root que retorne fisicamente a ela por junction/symlink;
- restaura somente em area isolada, quarentena pendencias anteriores ao corte,
  mantem `accepted_unconfirmed` terminal e recupera leases expirados;
- exige que toda pendencia elegivel seja reclamavel pelas fontes configuradas,
  sem transporte externo;
- reabre estados individuais antigos e lotes numericos novos pela entrada
  publica correspondente;
- restaura um bundle limpo de rollback e exige o mesmo fingerprint integral do
  estado original;
- todas as saidas sao agregadas e sanitizadas, com `financial_writes=0`.

## Arquivos do candidato

- `src/openFinance/openFinanceNumericSaveReleaseGate.js`;
- `scripts/runOpenFinanceNumericSaveReleaseGate.js`;
- `tests/openFinanceNumericSaveReleaseGate.test.js`;
- `tests/financialStateMachine.test.js`;
- `package.json`;
- `docs/plans/workstreams/open-finance-numeric-save-release.md`;
- `docs/agent-memory/workstreams/open-finance-historical-rx.md`;
- `docs/agent-memory/workstreams/index.md`;
- este manifesto.

## Prova causal e evidencia local

- o primeiro RED falhou pela ausencia do modulo de release;
- as provas seguintes expuseram a ausencia da ancora terminal no bundle e a
  modelagem incorreta do fan-out familiar;
- a revisao adversarial acrescentou contencao fisica de caminhos, rejeicao de
  referencias duplicadas, replay duplicado, pendencias inelegiveis e limpeza
  de bundle parcial;
- teste focal do gate: `6/6`;
- compatibilidade pela entrada publica do handler: verde;
- bateria causal Open Finance/lifecycle/state store: `226/226`;
- syntax checks dos dois modulos novos: verdes;
- `git diff --check`: verde;
- suite hermetica ampla final: 1.536 testes, 1.526 aprovados, zero falhas e 10
  skips conhecidos;
- cobertura final: linhas 90,80%, branches 73,37% e funcoes 90,52%;
- nenhuma chamada Pluggy/Sheets/WhatsApp real, flag, escrita financeira,
  deploy, OCI ou producao.

As contagens sao evidencia local relatada e nao foram executadas pelo auditor
independente.

## Perguntas para auditoria independente

1. O preflight falha fechado para cutoff ou flags divergentes sem expor dados?
2. O bundle e o restore cobrem o conjunto persistido necessario sem tocar o
   original e rejeitam adulteracao ou escape de caminho?
3. Backlog anterior ao corte e `accepted_unconfirmed` permanecem incapazes de
   reaparecer como proposta enviavel depois de restart?
4. Estados individuais legados e lotes numericos novos retomam sem mistura?
5. O rollback comprova equivalencia integral e permanece sem efeito externo?
6. Existe lacuna causal indispensavel antes de declarar `GO TECNICO LOCAL`?

## Estado maximo

`Candidato local aguardando auditoria independente por hash imutavel`.
Este documento nao autoriza flag, deploy, smoke, OCI ou producao.
