# RX-HIST-AMBIGUITY-RECONCILE-01 - candidato de reconciliacao read-only

Data: 2026-08-05

Commit anterior: `0969e312a0cfff1c3ea1fe072ca701f49bf34bcb`

## Objetivo

Consumir somente as decisoes duraveis e completas da revisao familiar, refazer
o RX historico sem os dois blockers resolvidos e preservar zero autorizacao de
salvamento e `financial_writes=0`.

## Implementacao

- o plano de resolucao reconstrui os itens privados a partir do mesmo RX e dos
  mesmos dados fonte, recalcula o `review_ref` e recusa snapshot parcial,
  adulterado, de outro escopo ou de outro conjunto de candidatos;
- cada item de parcela inclui no proprio `item_ref` os `candidate_ref` HMAC dos
  IDs do provedor; descricao, data e valor nunca substituem identidade;
- `keep_only` exclui apenas as identidades recusadas, `discard_all` exclui todas
  e `distinct_rows` cria series distintas sem autorizar salvamento;
- investimento negativo oferece somente aplicacao ou nao investimento;
  investimento positivo oferece somente resgate, rendimento ou nao
  investimento; direcao incompatível falha fechada tambem no builder;
- o reconciliador executa novamente o builder real do RX com o plano validado,
  exige que toda referencia seja consumida exatamente uma vez e publica apenas
  contagens sanitizadas da resolucao;
- proposta numerica, modo `prompt`, deploy, Pluggy real, planilha e producao
  permanecem fora do alcance.

## Evidencia causal

- RED inicial: o teste focal falhou porque o reconciliador ainda nao existia;
- bateria final de review, store/restart, runtime WhatsApp e reconciliador:
  31/31;
- replay do mesmo snapshot produz relatorio identico apos reabertura real do
  SQLite;
- conflito familiar e selecao obsoleta permanecem cobertos pelo store real;
- todas as escolhas de parcela e investimento sao exercitadas, inclusive
  troca de ID do provedor, snapshot parcial, escolha adulterada e direcao
  incompatível;
- suite hermetica ampla final substitutiva: 1.519 testes, 1.509 aprovados,
  zero falhas e 10 skips conhecidos;
- cobertura final: linhas 90,78%, branches 73,36%, funcoes 90,43%;
- contrato de ambiente, syntax checks e `git diff --check` verdes.

## Alcance

Este candidato apenas transforma decisoes familiares completas em um novo RX
read-only elegivel para a etapa seguinte. Series resolvidas continuam com
`save_eligibility=not_authorized_by_read_only_rx`; nada e salvo, nenhuma flag e
ativada e nenhuma acao remota e autorizada. O estado maximo antes da auditoria
independente e `candidato aguardando auditoria`.
