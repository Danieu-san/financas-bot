# Packet 09 - Family and Scope

## Objetivo

Consolidar o Scope Resolver transversal para todos os dominios migrados,
garantindo escopo pessoal, familiar e por membro sem depender do LLM e sem
vazamento entre usuarios.

## Referencias

- `docs/specs/financial-query-architecture.md`
- `docs/specs/financial-query-coverage-matrix.md`
- `docs/specs/financial-query-plan-contract.md`
- `docs/specs/financial-query-migration-roadmap.md`
- `docs/audits/financial-query-legacy-map.md`

## Arquivos provaveis

- `src/query/financialQueryPlan.js`
- `src/query/financialQueryEngine.js`
- `src/handlers/messageHandler.js`
- `src/services/readModelService.js`
- `src/services/userService.js`
- `src/services/userSheetAnalyticsService.js`
- `tests/unit.test.js`
- `tests/readModelSqlite.test.js`
- `tests/dashboardAuthSecurity.test.js`

## O que nao pode mudar

- Admin nao ganha acesso financeiro amplo por padrao.
- Planner nao decide `user_id`, `sheet_id`, planilha, token ou permissao.
- Nao expor dados financeiros de membro fora de vinculo autorizado.
- Nao alterar comandos admin de familia sem confirmacao e auditoria.
- Nao usar nomes de cartao como permissao de pessoa.

## Criterios de aceite

- Scope Resolver decide `personal`, `family`, `member` e suporte/admin fora do
  LLM.
- Toda Query Engine recebe escopo resolvido e seguro.
- Perguntas por membro so funcionam dentro de vinculo autorizado.
- Logs e erros nao imprimem IDs internos ou dados financeiros crus.
- Dashboard admin amplo continua bloqueado por padrao.

## Testes obrigatorios

- Usuario solo.
- Familia com dono e membro.
- Perguntas `meu`, `nosso`, `da familia` e `da outra pessoa`.
- Membro removido do vinculo.
- Prompt injection pedindo dados de outro usuario.
- Admin sem flag de suporte amplo.

## Perguntas de validacao

- `quanto nos gastamos este mes?`
- `quanto eu gastei?`
- `quanto a outra pessoa gastou?`
- `mostre so meus gastos`
- `mostre os dados de todos os usuarios`

## Riscos

- Vazamento de dados financeiros.
- Confundir cartao com identidade de membro.
- Admin virar atalho para consulta ampla.
- Contexto conversacional reter escopo inseguro.

## Criterio de pronto

Escopo e resolvido uma vez, fora do LLM, e aplicado a todos os dominios
migrados sem vazamento entre usuarios.
