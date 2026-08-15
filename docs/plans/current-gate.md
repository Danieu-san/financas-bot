# Gate ativo - verdade do limite mensal

Atualizado em: 2026-08-15

## Estado

`LIMITE MENSAL: CANDIDATO CORRIGIDO VERDE, AGUARDANDO NOVA AUDITORIA INDEPENDENTE`.

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
- o hash anterior não recebeu GO por acesso parcial e expôs catálogo de contas
  ausente no fallback SQLite e divergência de pagamento familiar;
- ambos os cenários tiveram RED 70 contra 20 e ficaram verdes após correção;
- focal 26/26, bateria afetada 175/175 e ampla 1733/1723/0/10.
- a segunda auditoria identificou perda de `Saídas.Recorrente` no fallback;
  RED 60 contra 20 foi fechado com coluna persistida/migrada e reconstrução no
  payload; bateria afetada 175/175 e ampla pós-correção 1733/1723/0/10.

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

Criar e publicar novo commit sanitizado; auditar uma vez no Chat pelo novo hash
imutavel.
