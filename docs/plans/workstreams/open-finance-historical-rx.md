# Plano - RX historico segmentado Open Finance

Status: `ligacao por posicao fechada; previa privada NO_GO com dois blockers`.

## Objetivo

Gerar um preview privado e agregado da vida financeira observavel pelo Pluggy a
partir de `2025-07-01`, preservando semantica, origem, tipo de produto e
titularidade, sem misturar esse inicio historico com o corte de alertas de
`2026-07-28`.

## Escopo

- segmentador puro sobre snapshot normalizado;
- CLI read-only para vault cifrado copiado;
- lifecycle por conta e cartao;
- inventario externo exato de quatro fontes e nove segmentos;
- saldo bancario reconstruido de forma condicional;
- faturas, limites, parcelas e investimentos em blocos distintos;
- relatorio fora do repositorio e zero escrita financeira.

## Nao escopo

- mutacao de Sheets, ledger, Pluggy ou producao;
- exclusao de dados de teste;
- salvamento numerico de movimentacoes;
- reconciliacao definitiva sem conferencia humana;
- sintetizar saldo, parcela, fatura, titularidade ou existencia ausente;
- alterar o corte operacional de alertas neste gate.

## Etapas

1. [concluida] Separar inicio historico de corte de alertas.
2. [concluida] Implementar lifecycle por conta.
3. [concluida] Fixar inventario familiar de quatro contas e quatro cartoes.
4. [concluida] Exigir inventario no builder e arquivo externo na CLI, falhando
   fechado em divergencia.
5. [concluida] Executar teste focal, bateria causal e uma suite hermetica final.
6. [concluida] Publicar primeiro candidato e obter NO-GO independente.
7. [concluida] Fixar contrato canonico, validacao pre-vault e identificador do gate.
8. [concluida] Publicar recovery e obter NO-GO probatorio independente.
9. [concluida] Provar JSON invalido, zero snapshot/copia/vault e stderr real.
10. [concluida] Publicar recovery probatorio e obter GO tecnico local independente.
11. [concluida] Executar preflight privado read-only; falha fechada antes do
    relatorio por inventario real maior que o contrato canonico.
12. [concluida] Corrigir o contrato para cinco contas bancarias e quatro cartoes,
    mantendo corrente, poupanca e cartao Itau separados.
13. [concluida] Testar, publicar e reauditar o contrato sucessor.
14. [concluida] Executar previa privada; falha fechada antes do relatorio por
    identidade ambigua de parcela, com copia SQLite inalterada.
15. [concluida] Modelar ambiguidade sem deduplicar nem somar silenciosamente,
    testar, publicar e obter GO tecnico local substantivo.
16. [concluida] Corrigir o estado documental obsoleto e confirmar o alcance
    autorizado em novo hash, sem repetir testes.
17. [concluida] Reexecutar a previa privada apos confirmacao explicita; relatorio
    criado com NO_GO controlado, SQLite inalterado e zero escrita.
18. [concluida] Registrar a declaracao do usuario de que todas as contas
    bancarias existiam no inicio historico; manter somente o cartao Itau como
    inexistente nessa data.
19. [concluida localmente; auditoria pendente] O provedor oferece endpoint de transacoes por posicao, mas o
    cliente nao o coleta e a cobertura Nubank nao esta garantida. Prova RED
    registrada no HEAD de partida `88f0d494286e19bdb9468ce1359c0bee2e1736d5`:
    35 testes focais, 25 aprovados e 10 falhas esperadas. O candidato fechou a
    prova em 36/36 e implementou disponibilidade separada e falha fechada, sem
    usar descricao, data ou valor como vinculo a transacao bancaria.
20. [nucleo local concluido com GO; integracao publica pendente] Em gate
    operacional separado, avisar os dois usuarios sobre movimentos ambiguos e
    oferecer revisao numerada; nunca usar `sim` generico para multiplas opcoes
    nem salvar automaticamente.
21. [concluida] Classificar aplicacao/resgate de reserva como transferencia
    patrimonial, rendimento como ganho, bloquear semantica generica e impedir
    salvamento de parcela ambigua; o primeiro candidato recebeu NO-GO porque o
    runtime ainda publicava o gate anterior; o recovery recebeu GO independente
    com literal independente nos testes.
22. [concluida] Depois de GO independente, reexecutar uma previa privada com o
    lifecycle corrigido: nove segmentos, zero escrita e arquivos inalterados;
    poupanca deixou de bloquear, sem data inventada para o cartao Itau.
23. [concluida] Confirmar em fonte primaria a convencao de direcao: `CREDIT` e
    entrada e `DEBIT` e saida. Manter 22 `RESGATE_APLIC_FINANCEIRA` debitados
    como semanticamente ambiguos e fora da classificacao patrimonial.
24. [NO-GO independente; recovery concluido localmente] Em Sol Alto, coletar `/investments/{id}/transactions` de modo
    opcional, paginado, sanitizado e fail-closed, propagar sua disponibilidade
    pelo contrato/vault/RX e provar ausencia de regressao. A fronteira RED esta
    fechada em 36/36; bateria causal 356/356 e suite ampla final substitutiva
    com 1.481 testes, 1.471 aprovados, zero falhas e 10 skips. Nenhuma chamada
    real, escrita financeira ou producao.
25. [concluida localmente; reauditoria pendente] Rejeitar `totalPages`
    contraditorio e provar 403/404 em pagina posterior sem retencao, 200 vazio,
    limite de posicoes e ausencia/nulidade dos seis campos obrigatorios. Focal
    39/39, bateria Open Finance 359/359 e suite ampla 1.484 testes, 1.474
    aprovados, zero falhas e 10 skips.
26. [concluida com GO tecnico local independente] Fechar o NO-GO probatorio do
    hash `260ff76986fc98682317c1570a3dc760e870045f` com tripwire que exige zero
    requests ao historico quando o limite de posicoes e excedido. Mudanca
    somente em teste; focal 39/39 e suite ampla anterior preservada.
27. [concluida] Fazer uma unica leitura
    Pluggy live sanitizada para verificar cobertura do historico por posicao nas
    fontes Nubank, sem preview privado, escrita ou producao. A cobertura
    relevante foi observada; contagens e detalhes ficaram fora do Git.
28. [concluida] Gerar nova previa privada
    cifrada e read-only com o historico por posicao, sem pareamento heuristico,
    para reavaliar somente `investment_history_unlinked`. O blocker foi
    fechado; lifecycle obsoleto foi corrigido no mesmo cofre e restaram somente
    ambiguidade de parcela e semantica de investimento.
29. [concluida com GO tecnico local independente] Implementar o nucleo cifrado
    e reiniciavel da revisao numerada, com catalogo bidirecional, pagina e
    selecao por ator, decisao familiar unica, protecao contra replay isolado do
    envelope e `financial_writes=0`.
30. [concluida com GO tecnico local independente] Integrar o nucleo
    ao handler e a entrega publicos do WhatsApp. O primeiro hash falhou por
    timestamp, ordem, TTL, ID de transporte, retry e escopo da outbox. O
    primeiro recovery fechou esses achados, mas a reauditoria exigiu barreira
    explicita entre runtime e backfill. O segundo recovery coordena o evento
    `ready`, bloqueia backfill se `prompt` nao estiver pronto e preserva o modo
    `off`; bateria causal 174/174 e ampla final 1.510 testes, 1.500 aprovados,
    zero falhas e 10 skips. O hash auditado foi
    `a5ea2dd977621c8c6f24a041db74a7b89eb2b1c7`.
31. [concluida com GO tecnico local independente] Consumir as decisoes duraveis da revisao no reconciliador
    read-only, recalcular blockers/elegibilidade sem inferir identidade e provar
    replay, restart, conflito familiar e `financial_writes=0`. Nao criar ainda
    proposta de salvamento nem ativar `prompt`.
32. [NO-GO independente; recovery duravel concluido localmente] Substituir a colisao de propostas individuais pelo fluxo
    numerico de salvamento. Cada destinatario recebe um unico lote de ate quatro
    transacoes elegiveis; o fan-out do mesmo lote para Daniel e Thais nao reduz
    esse limite. Um lote aceita `salvar 1`, `salvar 1 e 3` e `salvar todas`; `sim`
    permanece valido somente quando existe uma proposta. A selecao cria apenas
    uma fila duravel de conferencias e cada item continua passando, isoladamente,
    pela revisao guiada e pela confirmacao final. O primeiro conjuge que selecionar
    um item o reserva. Reinicio, concorrencia familiar e falha de transporte devem
    permanecer fail-closed, com `financial_writes=0`. O gate nao pode incluir o RX
    historico anterior ao corte operacional de `2026-07-28`, ambiguidades ainda
    nao resolvidas, ativacao de flags, deploy ou producao.

## Criterios de GO

- `history_start_date=2025-07-01` sem campo de cutoff de alertas no RX;
- exatamente quatro fontes, cinco contas bancarias e quatro cartoes;
- exatamente dois segmentos Daniel e sete segmentos no escopo Thais;
- conta Itau Thais disponivel no inicio e cartao Itau Thais nao aplicavel;
- poupanca Itau separada e existente no inicio por declaracao do usuario;
- cartao Itau separado, inexistente no inicio e incluido somente quando
  observado/disponivel;
- subtipos canonicos falham fechado mesmo quando as contagens coincidem;
- inventario ausente ou nao canonico falha no builder;
- arquivo com forma, fonte, quantidade ou titular divergente e mapa incompleto
  falham na CLI antes de snapshot, copia ou abertura do vault;
- conta, cartao, fatura e limite permanecem semanticamente separados;
- investimentos permanecem fora do inventario de contas e cartoes;
- movimentos de investimento usam somente `operation_type` do provedor,
  declaram cobertura parcial e nunca inferem por descricao;
- aplicacoes e resgates rotulados continuam nos movimentos brutos de saldo,
  mas nao viram receita ou despesa; rendimento permanece ganho;
- semantica generica ou direcao incompatível bloqueia reconciliacao;
- parcela ambigua permanece inelegivel a salvamento ate resolver identidade;
- posicao sem historico ligado impede `ready_for_reconciliation`;
- `financial_writes=0` em todos os caminhos;
- testes, workflow e auditoria independente verdes.

## Condicoes de parada

- qualquer mistura entre conta e cartao ou entre os escopos Daniel e Thais;
- uso de `2026-07-28` como inicio do historico;
- fonte incompleta tratada como completa;
- qualquer escrita financeira, chamada real ou exposicao de dado privado;
- NO-GO independente.

## Proxima acao

32. [em reauditoria] Publicar o recovery da fila duravel, auditar o novo hash e
fechar somente o gate tecnico local se todas as severidades e a lacuna
indispensavel ficarem zeradas. O gate sucessor, qualquer ativacao de `prompt`,
deploy ou producao permanecem fora deste fechamento.
