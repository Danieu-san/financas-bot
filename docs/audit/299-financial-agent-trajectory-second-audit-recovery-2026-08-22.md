# ARQ-01 — segundo parecer e recovery — candidato

Data: 2026-08-22

## Parecer independente

- hash auditado: `3d4ab01beaecbb5e3767361a45a88fb4a6e7a5f4`;
- acesso confirmado: `8/8` arquivos e diff integral;
- veredito: `NO-GO`;
- M1: falha, porque três fallbacks ainda derivavam `executedPlan` do plano
  tentado quando a tool falhava;
- M2: aprovado, sem resposta, rows ou filtros financeiros crus nos logs;
- M3: invariantes aprovados, mas a proveniência exata do fingerprint não era
  recalculável sem a projeção-fonte versionada.

## Segundo recovery local

`derivePlanFromTool` agora falha fechado antes de qualquer derivação quando
`toolResult.ok !== true`. Testes adversariais exigem plano e checkpoint nulos
para todas as quatro tools read-only alcançáveis.

O baseline sanitizado agora inclui a projeção-fonte de cada caso sem pergunta,
resposta, filtros, IDs de usuário ou valores financeiros. O validador recompõe
dessa projeção as seis contagens materiais, os críticos e o fingerprint. Testes
adulteram separadamente a tool e o SHA-256 e exigem falha.

## Evidência local

- focal hermético: `9/9`;
- baseline regenerado: `265/265`, críticos `15/15`;
- projeção-fonte: `265`, fingerprint recalculável;
- suíte ampla hermética: `1.756/1.766`, zero falha, `10` ignorados;
- cobertura: linhas `91,65%`, branches `74,55%`, funções `91,18%`;
- produção, flags, writers e dados reais: não acessados.

## Estado

`SUPERADO PELO GO TÉCNICO LOCAL NO HASH 446612b51f141da41273e4f65921b82a88a0d0f6`.

O fechamento independente está registrado no arquivo 300. O gate não autoriza
deploy, canário, writer ou retirada de legado.
