# Gate ativo — FLOW-02

Atualizado em: 2026-07-23

Base: `711f3ecfb3bf985a7374bf19bbdab0e99aa68b28`.

## Estado

Candidato local implementado e validado, ainda sem `GO`. Falta criar e publicar
o commit imutável e obter auditoria independente.

Este gate não autoriza deploy ou acesso a integrações reais.

## Objetivo

Colocar o rate limit global antes de comprovantes, OCR, exportação, importação e
gerenciamento de metas.

## Escopo

- ordem causal dentro de `processMessage`;
- consumo único do limite para áudio;
- bloqueio anterior aos cinco handlers pesados;
- prova local sem integrações reais.

## Não escopo

- mudar quotas, janelas ou persistência do rate limiter;
- limitar comandos legais, lifecycle, configurações, dashboard ou admin;
- alterar políticas internas de OCR, recibos, importação, exportação ou metas;
- deploy, produção ou E2E real.

## Contrato

1. identidade, lifecycle e modo familiar precedem o gate;
2. áudio consome o limite uma vez antes da transcrição;
3. texto consome o limite antes dos cinco handlers pesados;
4. bloqueio não baixa mídia nem faz leitura financeira;
5. política e implementação interna dos handlers não mudam.

## Evidência

- RED causal reproduzido antes da mudança;
- prova causal: `1/1`;
- handler/estado completo: `121/121`;
- módulos diretamente afetados: `56/56`;
- sintaxe e `git diff --check`: verdes;
- gate exaustivo válido: `1.246` testes, `1.240` aprovados, uma falha, cinco
  skips permitidos e zero TODO;
- a única falha ampla, em relatório de cartões não tocado, passou isoladamente
  `2/2`; a execução ampla não é rotulada como verde;
- nenhuma produção ou integração real.

## Limites preservados

Comandos legais, lifecycle, configurações, dashboard e administração preservam
as exceções preexistentes. Esse limite deve ser avaliado explicitamente na
auditoria independente.

## Critérios de GO

- hash sanitizado e publicado;
- prova causal e baterias diretamente afetadas verdes;
- sintaxe, diff e workflow verdes;
- auditor independente confirma a ordem e aceita ou bloqueia explicitamente a
  falha ampla não reproduzida;
- nenhum achado `CRITICAL`, `HIGH` ou `MEDIUM` residual.

## Condições de parada

- qualquer efeito pesado anterior ao rate limit;
- consumo duplo do limite por áudio;
- regressão nos testes diretamente afetados;
- parecer independente `NO-GO`;
- necessidade de produção ou integração real.

## Próxima ação exata

Commitar e publicar somente os cinco arquivos do candidato, enviar o hash ao
Chat e confrontar o parecer com a evidência local antes de decidir `GO/NO-GO`.

## Capacidade

`Codex → Sol → Alto → publicar FLOW-02; Chat → modelo mais capaz disponível →
Alto → auditar o hash; Codex → Sol → Alto → confrontar o parecer.`
