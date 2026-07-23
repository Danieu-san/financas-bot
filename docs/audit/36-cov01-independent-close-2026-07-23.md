# Fechamento independente — COV-01

Data: 2026-07-23

Base: `130d86306ef54d57a3345acb52e83e02f0f20c47`.

Candidato final: `c96d801f6f5c683634dbc8b3a2997eb576a9e3f5`.

## Veredito

`GO TÉCNICO LOCAL`.

O Chat confirmou a cadeia linear de três commits, os oito arquivos do delta e
não encontrou achado `CRITICAL`, `HIGH`, `MEDIUM` ou `LOW` dentro do modelo de
ameaça aprovado. O parecer foi estático e não reproduziu os testes.

Este GO não autoriza deploy, produção, Google, WhatsApp ou Pluggy reais.

## Modelo de ameaça

- bot familiar privado, usado por duas pessoas que compartilham os dados;
- código e testes versionados são confiáveis;
- o gate evita omissões silenciosas e efeitos externos acidentais;
- não promete sandbox de sistema operacional nem resistência a código
  deliberadamente hostil, addons nativos ou APIs internas do Node.

## Desenho encerrado

- `npm test` delega ao runner local exaustivo por `test:release`;
- o runner descobre todos os `tests/*.test.js` e exclui somente o controlador
  WhatsApp E2E real;
- 18 entradas Open Finance agregadas usam um manifesto compartilhado e
  validado, sem deduplicação textual por regex;
- o inventário reconhece a descoberta dinâmica;
- o ambiente filho usa allowlist, valores fictícios e flags live desligadas;
- `NODE_OPTIONS` protegido é capturado uma vez e reinjetado nos descendentes;
- shell, executáveis não-Node e `fork.execPath` alternativo são rejeitados;
- skips possuem allowlist exata e qualquer `TODO` invalida o gate;
- o relatório expõe `network_guard_scope` limitado.

## Evidência executada

- contrato adversarial do runner: `11/11`;
- fluxos multiprocesso OAuth/snapshot: `56/56`;
- agregador Open Finance: `103/103`;
- `npm test`: `1.241` testes, `1.236` aprovados, zero falhas, cinco skips
  permitidos e zero TODO;
- `114` arquivos descobertos, `96` entradas diretas e `18` agregadas;
- sintaxe e `git diff --check`: verdes;
- nenhuma integração real, produção ou E2E real foi acessado.

## Próximo gate

`OPS-01`: sincronizar o contrato de ambiente do runtime com o artefato de
configuração, sem ler segredos ou acessar produção.
