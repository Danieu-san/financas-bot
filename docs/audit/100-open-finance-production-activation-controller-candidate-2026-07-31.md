# PROD-ACT-01 — controlador transacional candidato

Data: 2026-07-31

## Objetivo

Preparar a ativação reversível da proposta proativa e da escrita confirmada do
Open Finance familiar sem alterar as flags de produção durante a construção do
gate.

## Implementação

`scripts/release/openFinanceActivationRelease.js` oferece:

- `plan`, estritamente somente leitura e com saída limitada a seis flags;
- estágios `prompt`, `confirm`, `write-off` e `off`;
- pré-requisitos canary e presença dos quatro stores antes de `prompt/confirm`;
- `confirm` bloqueado sem três confirmações CLI explícitas;
- inventário de um único PM2 e igualdade com o hash completo esperado;
- health completo antes da mutação;
- backup privado e durável do `.env`;
- escrita atômica do `.env`, restart limitado e health completo;
- restauração exata do `.env`, novo restart e health obrigatório na falha;
- recibo sanitizado, sem segredo ou conteúdo completo do `.env`.

O controlador não muda código, artefato, script ativo, aliases, stores,
lançamentos ou AWS.

## Prova causal

`tests/openFinanceActivationRelease.test.js` exige:

1. `prompt` sem escrita, `confirm` com escrita e `write-off` sem escrita;
2. falha fechada se faltar canary, store ou estágio válido;
3. atualização somente das flags e recusa de duplicatas no `.env`;
4. janela limitada a 12..60;
5. nenhuma consulta, backup ou mutação sem confirmações ao vivo;
6. aplicação de `prompt` com `jlist → restart → save`;
7. falha de health com restauração byte a byte e
   `restart → restart → save`;
8. mismatch do commit antes de backup ou restart;
9. ausência de segredo no recibo;
10. health inicial verde antes de qualquer backup ou alteração;
11. `confirm` aplicado somente com as três confirmações ao vivo;
12. backup já existente e privado antes do primeiro restart.

## Evidência executada pelo Codex

- focal final do controlador: `10/10`;
- bateria afetada anterior ao último reforço exclusivamente probatório:
  `92/92`;
- sintaxe e `git diff --check`: verdes.

As duas provas adicionadas depois da bateria afetada não mudam código de
produto: apenas tornam explícitos o health prévio e a aplicação completa de
`confirm`. As suítes não causais não foram repetidas.

## Estado de produção durante o gate

- código ativo:
  `8f89aec906439dba0024318bddee8d255747b54f`;
- alerta, reconciliação e preview: `canary`;
- proposta: `off`;
- escrita: `off`;
- aprovação: ausente/falsa;
- nenhuma alteração remota deste candidato foi executada.

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Mesmo com GO local, a etapa `confirm` permanece bloqueada até Daniel estar
presente para operar o WhatsApp e conferir o único lançamento real.
