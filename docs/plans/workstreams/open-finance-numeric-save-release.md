# Gate 33 - prontidao de release do fluxo numerico Open Finance

ID: `OF-NUMERIC-SAVE-RELEASE-01`

Estado: `recovery local validado apos NO-GO; aguardando nova auditoria independente`.

Commit de partida efetivo desta execucao:
`25c7c6be8953214aa1e4310403a006efcc9c88bb`.

## Objetivo

Provar, antes de qualquer deploy, que o fluxo numerico encerrado no gate 32 e
compativel com o estado persistido vigente e que somente eventos elegiveis a
partir do corte operacional de `2026-07-28` podem chegar ao novo lote. O gate
deve produzir um candidato de release ensaiado, mas nao altera OCI, flags,
WhatsApp, Pluggy ou planilhas.

## Escopo

- inventariar de forma sanitizada o contrato de flags e cutoffs vigente;
- validar o estado persistido em uma copia consistente, nunca no original;
- provar migracao/reabertura de propostas, revisoes, outbox e estado de
  conversa preexistentes;
- provar que `pending` anterior ao corte nao e reclamado nem vinculado a uma
  conversa;
- provar que `accepted_unconfirmed` permanece terminal e nao volta a ser
  enviado;
- provar que estados individuais anteriores continuam retomaveis e que novos
  lotes usam o fluxo numerico duravel;
- ensaiar instalacao e rollback do artefato imutavel sobre uma copia do estado;
- produzir evidencia sanitizada para auditoria independente por hash.

## Nao escopo

- alterar o corte operacional ou reclassificar eventos antigos;
- limpar ou editar dados reais;
- ampliar propostas para entrada, estorno, transferencia, pagamento de fatura,
  tarifa, investimento ou parcela ainda ambigua;
- ativar `OPEN_FINANCE_WRITE_MODE`, aprovacao de escrita ou `confirm`;
- executar polling Pluggy, enviar WhatsApp, escrever Sheets ou fazer deploy;
- usar AWS como runtime ou rollback.

## Invariantes

1. O RX historico continua iniciado em `2025-07-01`; o corte operacional de
   alertas/propostas continua separado em `2026-07-28`.
2. Conta bancaria, cartao, fatura, limite e investimento permanecem segmentos
   distintos.
3. Somente compra `new`, reconciliada e sem ambiguidade pode gerar proposta.
4. Um destinatario recebe no maximo quatro itens por lote; o fan-out familiar
   nao divide esse limite.
5. Uma proposta isolada aceita `sim`; um lote exige selecao numerica.
6. Cada item segue revisao e confirmacao final individuais; selecionar o lote
   nunca grava.
7. `OPEN_FINANCE_WRITE_MODE=off`, aprovacao falsa, `confirm` bloqueado e
   `financial_writes=0` em toda a prova.
8. Estado real e segredos nao entram em Git, logs, manifesto ou prompt.

## Riscos causais a provar

- o cutoff documentado divergir do cutoff efetivamente aplicado por fonte;
- backlog anterior ao corte reaparecer depois da troca de artefato;
- uma linha `accepted_unconfirmed` ser tratada como respondível ou reenviável;
- estado individual antigo ser perdido ou confundido com lote numerico;
- fila nova ficar inacessivel depois de restart;
- migracao parcial entre bancos SQLite, state store cifrado e codigo novo;
- rollback restaurar codigo sem restaurar o conjunto coerente de estado.

## Etapas

1. Concluido: RED causal para cutoff, backlog terminal, compatibilidade de
   estado e rollback do conjunto persistido.
2. Concluido: preflight e ensaio local minimos para fechar as falhas RED.
3. Concluido no recovery: syntax check, focal `8/8` e bateria causal afetada
   `228/228`.
4. Concluido no recovery: uma unica suite hermetica ampla final, com 1.538
   testes, 1.528 aprovados, zero falhas e 10 skips conhecidos.
5. Em andamento: publicar commit sanitizado e obter auditoria independente por
   hash imutavel.
6. Pendente: encerrar somente o GO tecnico local e preparar um gate operacional
   separado.

## Evidencia local do candidato

- as quatro fontes exigem configuracao explicita com ativacao no corte
  `2026-07-28` ou posterior;
- `OPEN_FINANCE_WRITE_MODE=off`, aprovacao falsa, proposta `prompt` e modos
  canary obrigatorios falham fechado quando divergentes;
- o pacote v3 inclui staging, baseline, outbox, preview, journal, ancora
  terminal e state store cifrado, com checksums e rejeicao de arquivos
  inesperados;
- a restauracao em copia quarentena pendencias anteriores ao corte, mantem
  `accepted_unconfirmed` terminal, recupera leases expirados e prova que toda
  pendencia elegivel e reclamavel sem transporte;
- estado individual legado e lote numerico novo reabrem pela entrada publica
  correta;
- o rollback restaura o fingerprint integral do conjunto persistido;
- focal `8/8`, bateria causal `228/228`, syntax checks e
  `git diff --check` verdes;
- suite hermetica final do recovery: 1.538 total, 1.528 aprovados, zero falhas,
  10 skips; cobertura de linhas 90,81%, branches 73,36% e funcoes 90,52%;
- o runner rejeita tambem work root fisicamente contido na copia por
  junction/symlink, mesmo quando o caminho aparente esta fora dela;
- nenhuma chamada Pluggy/Sheets/WhatsApp real, flag, deploy ou producao.

As contagens sao evidencia local e nao substituem a auditoria independente.

## NO-GO independente e recovery

O hash `a27ac8160cf797a04d4e798929bfae2ae427a6ff` recebeu `NO-GO`:
o campo `rollback_match` comparava duas restauracoes limpas e nao revertia a
arvore efetivamente alterada. O parecer tambem exigiu prova pos-rollback do
backlog, quiescencia da copia, tripwire de efeitos e vinculacao imutavel da
politica validada.

O recovery agora apaga e restaura o mesmo diretorio instalado, injeta e remove
um arquivo extra, compara o fingerprint recursivo integral e reabre o outbox
restaurado. Nessa arvore, nenhum item anterior ao corte pode ser reclamado,
`accepted_unconfirmed` continua terminal e qualquer pendencia estranha produz
`NO_GO`. A origem e fingerprintada antes/depois, a CLI exige confirmacao de
copia quiescente, a politica e congelada no preflight e o teste instala
tripwires para `fetch`, HTTP, HTTPS e sockets.

## Criterios de GO

- o preflight falha fechado se qualquer fonte nao comprovar cutoff efetivo em
  `2026-07-28` ou posterior;
- nenhuma linha criada antes do cutoff e reclamada, vinculada ou enviada;
- `accepted_unconfirmed` e terminal depois de restart e troca de artefato;
- estado individual anterior e lote numerico novo retomam pela entrada publica
  correta, sem sobreposicao;
- instalacao ensaiada preserva o conjunto coerente e rollback restaura seu
  checksum integral;
- todas as provas terminam com zero transporte real e
  `financial_writes=0`;
- suite proporcional verde e auditoria independente sem lacuna indispensavel.

## Condicoes de NO-GO/parada

- cutoff ausente, divergente ou inferido;
- necessidade de alterar estado real para tornar o candidato compativel;
- qualquer reenvio de entrega ambigua ou proposta anterior ao corte;
- perda, mistura ou desbloqueio indevido de estado apos restart/rollback;
- chamada real, escrita financeira, segredo em evidencia ou mudanca remota;
- NO-GO independente.

## Proximo estado autorizado

Somente depois do GO tecnico local deste gate pode ser aberto um gate
operacional de deploy OCI por artefato imutavel. Esse gate posterior deve
redescobrir host, usuario, chave, diretorio e processo, preservar estado,
manter escrita `off` e definir smoke real com Daniel presente.
