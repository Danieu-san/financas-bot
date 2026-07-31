# Open Finance — candidato de ativação da política familiar

Data: 2026-07-31

## Incidente observado

Com `OPEN_FINANCE_SAVE_PROPOSAL_MODE=prompt`, escrita `off` e Daniel presente,
os quatro Items foram atualizados no Meu Pluggy e o ciclo de startup encontrou
cinco observações novas. O resultado sanitizado foi `cycle=GO`, uma entrega
aceita sem id confirmado e `writes=0`.

O relatório público do outbox identificou a nova referência apenas para a
titular da fonte. A leitura sanitizada da política privada explicou o resultado:
as quatro fontes ainda estavam em modo individual, com
`family_aggregation_allowed=false` e somente o titular em
`authorized_viewers`. Portanto o smoke não comprovou o fan-out já autorizado
para Daniel e Thaís.

## Escopo do candidato

O controlador `scripts/release/openFinanceFamilyPolicyRelease.js`:

1. valida JSON, política uniforme e contrato fail-closed do produto;
2. exige alerta, reconciliação e preview em `canary`, proposta em `prompt`,
   escrita `off` e aprovação `false`;
3. exige processo PM2 único, online, no commit imutável esperado e health
   completo antes de mutar;
4. preserva aliases, titulares, destinatários principais, principais de
   confirmação e campos adicionais;
5. altera somente `authorized_viewers` para `daniel` e `thais` e
   `family_aggregation_allowed` para `true`;
6. cria backup privado exato e durável antes da substituição atômica;
7. reinicia com `--update-env`, aguarda health completo e persiste o PM2;
8. restaura o conteúdo exato e reinicia no estado seguro se substituição,
   durabilidade ou health falhar;
9. não lê nem altera lançamentos financeiros e sempre relata
   `financial_write_enabled=false`.

As primitivas de backup, troca atômica, health e comando já usadas pelo
controlador de ativação foram apenas exportadas; sua implementação não mudou.

## Evidência local

Comando:

```text
node --test tests/openFinanceFamilyPolicyRelease.test.js tests/openFinanceActivationRelease.test.js tests/openFinanceFamilyAlerts.test.js tests/openFinanceCanaryRuntime.test.js
```

Resultado: 33 testes, 33 aprovados, zero falhas.

Cobertura causal:

- transformação restrita ao casal e preservação de campos alheios;
- recusa de JSON, política vazia ou política mista;
- exigência de prompt-only e confirmação operacional;
- backup exato, substituição atômica, restart e health;
- rollback exato após falha de readiness ou de sincronização pós-rename;
- fan-out do produto para os dois cônjuges;
- primeira posse exclusiva da revisão por qualquer cônjuge;
- zero escrita em todo o estágio.

`git diff --check`: verde.

## Limites e estado

Este candidato não altera o conteúdo privado da política, não autoriza escrita
e ainda não foi executado em produção. A referência nova observada antes desta
correção permanece owner-only e não deve ser reprocessada artificialmente.

Estado máximo antes da auditoria independente: `CANDIDATO LOCAL; NO-GO PARA
APLICAÇÃO`.

Se a auditoria independente emitir GO técnico local, o próximo estado
autorizado é publicar o artefato imutável, executar primeiro `plan`, aplicar a
política com Daniel presente e realizar o smoke com uma próxima movimentação
real nova. A etapa `confirm` continua bloqueada.
