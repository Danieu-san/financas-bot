# Gate 35 — plano operacional privado

Atualizado em: 2026-08-09

## Objetivo

Executar uma unica revisao humana familiar das ambiguidades do RX historico,
consumir somente decisoes duraveis completas e recalcular o RX em copia privada,
sem escrita financeira e sem misturar a janela historica com o cutoff de
alertas.

Este documento planeja a operacao. Ele nao a autoriza.

## Restricao vigente

Daniel pausou o Gate 34 para retomada posterior. Seu smoke numerico permanece
pendente; a pausa nao equivale a GO funcional e nao altera por si so o estado
de producao. A ativacao do runtime historico continua exigindo configuracao e
restart do processo WhatsApp principal. Portanto:

`FASE A AUTORIZADA; HOLD ANTES DAS FASES B, C E D`.

Nao e permitido iniciar um segundo processo WhatsApp, criar sessao paralela ou
alterar o polling para contornar essa fronteira.

## Fase A — preflight local sem abrir dados privados

1. Confirmar raiz, branch, HEAD e arvore limpa.
2. Fixar o hash de produto auditado e o hash documental do plano.
3. Confirmar que o codigo em producao contem os nucleos auditados, sem deploy.
4. Inventariar somente existencia, modo e permissao dos caminhos privados
   necessarios; nao imprimir conteudo, IDs, valores, descricoes ou segredos.
5. Confirmar espaco para copia, diretorios `0700` e arquivos `0600`.
6. Confirmar `OPEN_FINANCE_WRITE_MODE=off`, aprovacao falsa e `confirm`
   bloqueado por evidencia sanitizada.

Saida: `PREFLIGHT_READY` ou `NO_GO`, sempre com `financial_writes=0`.

## Fase B — preparar o candidato privado read-only

Somente depois de autorizacao especifica para abrir a copia privada:

1. obter hashes do conjunto SQLite e rejeitar journal pendente;
2. criar snapshot consistente em diretorio temporario privado;
3. abrir somente o snapshot em modo read-only;
4. reconstruir o RX com `history_start_date=2025-07-01` e inventario canonico;
5. preparar o estado cifrado pelo orquestrador Gate 35;
6. gravar o estado cifrado fora do Git com criacao exclusiva e modo `0600`;
7. fechar/remover a copia temporaria e exigir hashes da origem inalterados;
8. publicar apenas contagens, blockers sanitizados e `financial_writes=0`.

Saida: `REVIEW_CANDIDATE_READY` ou `NO_GO`. Nenhuma mensagem e enviada.

## Fase C — ativacao familiar controlada

Precondicoes adicionais:

- Gate 34 em fronteira segura ou autorizacao explicita para interromper sua
  janela;
- Daniel com acesso aos dois telefones;
- backup privado verificado do `.env`, store da revisao e outbox;
- exatamente um processo PM2 e uma sessao WhatsApp;
- plano de rollback ensaiado sem dados reais.

Sequencia:

1. configurar `OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_MODE=prompt`, dois
   atores exatos e caminhos privados absolutos;
2. manter todas as flags de escrita desligadas;
3. executar um unico restart controlado;
4. exigir health, SQLite e WhatsApp `ready/healthy` antes do backfill;
5. entregar uma unica revisao cifrada a cada ator, com dedupe e at-most-once;
6. em erro ambiguo de transporte, nao reenviar automaticamente ao mesmo ator;
7. aceitar somente escolhas numericas explicitas; `sim` nunca resolve item;
8. parar quando todas as decisoes estiverem duraveis ou quando expirar.

Nenhuma selecao cria lancamento ou proposta de escrita.

## Fase D — recalculo privado

Somente com snapshot `reviewed`, `pending_count=0` e `financial_writes=0`:

1. repetir snapshot consistente da mesma origem privada;
2. verificar identidade HMAC/RX antes de aplicar decisoes;
3. recalcular pelo orquestrador auditado;
4. gravar o relatorio privado fora do Git por troca atomica;
5. classificar o resultado em `resolved` ou `partial_no_go`;
6. preservar blockers sem evidencia e itens inelegiveis;
7. comparar hashes da origem antes/depois e exigir zero mutacao.

O relatorio deve medir a cobertura integral da janela historica por fonte e
segmento, mas nao autoriza importacao na planilha. O cutoff `2026-07-28` serve
somente aos alertas e nao entra no RX.

## Rollback

Em qualquer falha antes, durante ou depois do restart:

1. restaurar o `.env` byte a byte;
2. voltar o modo historico para `off`;
3. restaurar somente stores do Gate 35 a partir do backup correspondente;
4. executar no maximo um restart de recuperacao;
5. exigir processo unico, health e WhatsApp verdes;
6. preservar o estado do Gate 34 e nao alterar seus stores;
7. remover temporarios e confirmar `financial_writes=0`.

## Evidencias permitidas

- hashes, contagens, modos de arquivo e estados sanitizados;
- estado `resolved`/`partial_no_go` e nomes publicos de blockers;
- contagens de decisoes e cobertura por fonte/segmento;
- health, processo unico, flags e zero escrita.

Nunca registrar no Git ou no Chat IDs bancarios, descricoes, valores, datas de
transacao, telefones completos, segredos, paths privados completos ou o estado
cifrado.

## Gates de parada

- Gate 34 ter sido retomado e exigir preservacao da janela no momento da
  ativacao;
- barreira de health pre-backfill ainda nao corresponder a ordem real do
  bootstrap no momento de autorizar a Fase C;
- hash de origem divergente ou journal pendente;
- inventario diferente de quatro fontes, cinco contas e quatro cartoes;
- conta/cartao/poupanca/investimento misturados;
- revisao parcial, expirada, adulterada ou ligada a outro RX;
- qualquer escrita financeira, segundo processo WhatsApp ou sessao paralela;
- health ou WhatsApp nao verde depois de restart;
- auditoria independente do plano emitir NO-GO.

## Proximo estado

O parecer independente do hash
`9ec123834b2e85d0b966c8834eb020c5eef3ef8b` autorizou somente a Fase A. As
fases B, C e D exigem autorizacoes operacionais separadas em suas fronteiras;
a Fase C tambem exige fechar a discrepancia de health pre-backfill. Nenhum GO
deste plano antecipa o Gate 38 de escrita historica.
