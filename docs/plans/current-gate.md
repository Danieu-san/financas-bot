# Gate ativo - verdade do limite mensal

Atualizado em: 2026-08-15

## Estado

`DASHBOARD V2 E CHECK 09:05 ENCERRADOS; LIMITE MENSAL EM DIAGNOSTICO`.

## Objetivo

Confirmar se o limite mensal usa a fonte, o periodo e somente as categorias
aprovadas; corrigir qualquer divergencia encontrada.

## Escopo

- localizar configuracao, calculo e mensagens do limite mensal;
- identificar categorias incluidas e excluidas e sua origem;
- confrontar codigo, testes e configuracao financeira vigente;
- corrigir com prova causal se houver erro.

## Não escopo

- gravar o RX historico na planilha;
- alterar classificacoes financeiras sem evidencia;
- reabrir dashboard, check das 09:05 ou Gate 43 sem regressao.

## Invariantes

1. Ausencia de alocacao ou fonte nao vira zero.
2. Categorias excluidas nao consomem o limite.
3. Periodo mensal e ciclo orcamentario nao sao misturados silenciosamente.
4. Nenhuma correcao entra em producao sem teste e auditoria independente.

## Evidência

- check das 09:05 desativado pela flag existente, sem alterar outros crons;
- dashboard v2 e Gate 43 permanecem em `GO DE PRODUCAO`.

## Critérios de GO

1. Fonte, periodo, categorias e formula estao identificados.
2. Casos de inclusao, exclusao e ausencia tem testes causais.
3. Valores observados nao misturam fontes nem inferem zeros.
4. Correcao material, se necessaria, recebe auditoria independente.

## Condições de parada

- configuracao financeira vigente nao puder ser determinada;
- regra de negocio depender de escolha nova de Daniel;
- diagnostico exigir escrita na planilha ou dados nao autorizados.

## Proxima acao

Mapear codigo, testes e configuracoes que definem limite mensal e categorias.
