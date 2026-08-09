# Gate 35 — plano operacional privado

Atualizado em: 2026-08-09

## Objetivo

Executar uma unica revisao humana local das ambiguidades do RX historico,
visualizada em pagina temporaria privada e conduzida nesta conversa por
referencias opacas. Consumir somente decisoes duraveis completas e recalcular o
RX em copia privada, sem escrita financeira e sem misturar a janela historica
com o cutoff de alertas.

Este documento planeja a operacao. Ele nao a autoriza.

## Restricao vigente

Daniel pausou o Gate 34 para retomada posterior. Seu smoke numerico permanece
pendente; a pausa nao equivale a GO funcional e nao altera por si so o estado
de producao. A revisao do Gate 35 passa a ser estritamente local: nao ativa o
runtime WhatsApp, nao exige restart e nao depende de backfill ou health remoto.

`HOLD ANTES DE DADOS REAIS ATE GO INDEPENDENTE DO REVISOR LOCAL`.

## Fase A — preflight local sem abrir dados privados

1. Confirmar raiz, branch, HEAD e arvore limpa.
2. Fixar o hash de produto auditado e o hash documental do plano.
3. Confirmar que a worktree local esta no produto auditado que contem todos os
   nucleos do Gate 35; producao nao precisa executar o revisor local.
4. Inventariar somente existencia, modo e permissao dos caminhos privados
   necessarios; nao imprimir conteudo, IDs, valores, descricoes ou segredos.
5. Confirmar espaco para copia, diretorios `0700` e arquivos `0600`.
6. Confirmar `OPEN_FINANCE_WRITE_MODE=off`, aprovacao falsa e `confirm`
   bloqueado por evidencia sanitizada.

Saida: `PREFLIGHT_READY` ou `NO_GO`, sempre com `financial_writes=0`.

### Execucao de 2026-08-09

Resultado: `PREFLIGHT_READY`, `financial_writes=0`. Produto, plano, nucleos,
conjunto privado, espaco e ACL exclusiva foram confirmados sem abrir conteudo.
Fase B permanece dependente de autorizacao especifica para abrir somente a
copia privada read-only. Evidencia:
`docs/audit/184-open-finance-historical-rx-gate35-local-phase-a-preflight-ready-2026-08-09.md`.

## Fase B — preparar o candidato privado read-only

Somente depois de autorizacao especifica para abrir a copia privada:

1. obter hashes do conjunto SQLite e rejeitar journal pendente;
2. criar snapshot consistente em diretorio temporario privado;
3. abrir somente o snapshot em modo read-only;
4. reconstruir o RX com `history_start_date=2025-07-01` e inventario canonico;
5. preparar o estado cifrado pelo orquestrador Gate 35;
6. usar `review_channel=local_private`, exatamente um revisor local e preparar
   o store SQLite cifrado fora do Git em modo `0600`;
7. fechar/remover a copia temporaria e exigir hashes da origem inalterados;
8. publicar apenas contagens, blockers sanitizados e `financial_writes=0`.

Saida: `REVIEW_CANDIDATE_READY` ou `NO_GO`. Nenhuma mensagem e enviada.

## Fase C — revisao local controlada

Precondicoes adicionais:

- candidato local com GO independente;
- diretorio privado `0700`, store `0600` e segredo fora do Git;
- exatamente um revisor local autorizado;
- conjunto integral de referencias opacas conferido antes de cada decisao;
- escrita financeira desligada.

Sequencia:

1. gerar uma pagina HTML temporaria, autocontida, sem scripts ou rede, em modo
   `0600` e fora do repositorio;
2. abrir a pagina localmente para Daniel visualizar os detalhes necessarios;
3. conduzir nesta conversa somente referencias opacas, regra de equivalencia,
   quantidade integral e codigo de resolucao;
4. aceitar `aplicar a todas` apenas quando o conjunto pendente coincidir
   exatamente com o conjunto previamente exibido;
5. para investimento, equivalencia exige mesma fonte, segmento, tipo de
   operacao do provedor e direcao; descricao, data e valor nao participam;
6. para parcela, equivalencia exige a mesma serie; `distinct_rows` e
   `discard_all` podem ser coletivos, mas `keep_only` permanece individual;
7. persistir cada decisao em transacao SQLite, estado AES-256-GCM e MAC de
   revisao, sobrevivendo a restart sem replay de envelope anterior;
8. regenerar a pagina apos cada decisao e remover a versao temporaria anterior;
9. parar quando todas as decisoes estiverem duraveis ou quando expirar.

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

Em qualquer falha local:

1. nao reaplicar a decisao automaticamente;
2. exigir rollback integral da transacao SQLite;
3. reabrir o store e validar MAC, revisao e contagens;
4. remover pagina e arquivos temporarios;
5. preservar producao, Gate 34 e fontes privadas de origem;
6. confirmar `financial_writes=0`.

## Evidencias permitidas

- hashes, contagens, modos de arquivo e estados sanitizados;
- estado `resolved`/`partial_no_go` e nomes publicos de blockers;
- contagens de decisoes e cobertura por fonte/segmento;
- canal `local_private`, grupos, quantidades e zero escrita.

Nunca registrar no Git ou no Chat IDs bancarios, descricoes, valores, datas de
transacao, telefones completos, segredos, paths privados completos ou o estado
cifrado.

## Gates de parada

- candidato local sem GO independente;
- hash de origem divergente ou journal pendente;
- inventario diferente de quatro fontes, cinco contas e quatro cartoes;
- conta/cartao/poupanca/investimento misturados;
- revisao parcial, expirada, adulterada ou ligada a outro RX;
- conjunto esperado divergente, referencia duplicada ou resolucao coletiva nao
  portavel;
- qualquer escrita financeira, pagina dentro do Git ou recurso externo no HTML;
- auditoria independente do plano emitir NO-GO.

## Proximo estado

O revisor local e seu recovery receberam GO tecnico independente no hash
`b8d1004f2ee216f95a7f71047f568221159573f6`. Fica autorizada tecnicamente a
nova Fase A local, que nao abre dados privados. As fases B, C e D conservam suas
fronteiras operacionais e autorizacoes separadas. Nenhum GO antecipa producao,
WhatsApp ou o Gate 38 de escrita historica.
