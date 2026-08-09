# Plano - RX historico e evolucao operacional Open Finance

Status: `gate 34 pausado; gate 35 revisor local candidato; gates 36 a 38 ordenados`.

## Objetivo

Concluir o RX privado iniciado em `2025-07-01` e evoluir, em gates separados, o
fluxo proativo familiar a partir do corte operacional de `2026-07-28`, sem
misturar historico, alertas, propostas e escrita financeira.

## Escopo

- segmentador puro sobre snapshot normalizado;
- CLI read-only para vault cifrado copiado;
- lifecycle por conta e cartao;
- inventario externo exato de quatro fontes e nove segmentos;
- saldo bancario reconstruido de forma condicional;
- faturas, limites, parcelas e investimentos em blocos distintos;
- relatorio fora do repositorio e zero escrita financeira durante o RX;
- fluxo numerico de compras e sua promocao operacional controlada;
- tratamento proativo posterior de estornos, entradas e transferencias;
- ativacao de escrita somente em gate final, por classe previamente aprovada.

## Nao escopo

- mutacao de Sheets, ledger, Pluggy ou producao;
- exclusao de dados de teste;
- reconciliacao definitiva sem conferencia humana;
- sintetizar saldo, parcela, fatura, titularidade ou existencia ausente;
- alterar retroativamente o corte operacional;
- habilitar uma classe financeira por efeito automatico de outro gate.

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
32. [concluida com GO tecnico local independente] Substituir a colisao de propostas individuais pelo fluxo
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
33. [concluida com GO tecnico local independente] Provar a compatibilidade do
    fluxo numerico com uma copia consistente do estado vigente, incluindo
    cutoff efetivo por fonte, backlog anterior ao corte, entregas
    `accepted_unconfirmed`, estados individuais preexistentes, restart e
    rollback do artefato. O charter e
    `docs/plans/workstreams/open-finance-numeric-save-release.md`.
34. [pausado por decisao do usuario; promocao OCI concluida; smoke numerico pendente] Promover o fluxo numerico de compras
    na OCI por artefato imutavel e executar smoke com Daniel presente. Manter
    proposta em `prompt`, escrita `off`, aprovacao falsa e `confirm` bloqueado;
    provar lotes independentes nos dois telefones, cutoff, processo unico,
    health e rollback sem ressuscitar backlog. O charter e
    `docs/plans/workstreams/open-finance-numeric-save-oci.md`.
35. [revisor local candidato; suite ampla verde; aguarda hash e auditoria; dados reais bloqueados]
    Concluir o RX historico por revisao humana
    das ambiguidades remanescentes. Ativar de forma controlada a revisao
    numerada, consumir decisoes duraveis, recalcular o RX e separar: resolvido,
    ainda ambiguo por falta de evidencia e inelegivel. Parcela e investimento
    nunca sao saneados por inferencia; o resultado pode permanecer NO_GO
    parcial sem bloquear classes independentes.
    O charter operacional e
    `docs/plans/workstreams/open-finance-historical-rx-gate35.md`. O Gate 34
    foi pausado por decisao do usuario e sera retomado posteriormente. O
    preflight A anterior comprovou que a producao nao continha o orquestrador,
    mas o plano sucessor tornou o revisor estritamente local e eliminou a
    dependencia de health/backfill que gerava a lacuna `MEDIUM`. Daniel
    substituiu a revisao WhatsApp por pagina privada local conduzida com o
    Codex; aplicacao coletiva exige classe explicita, conjunto integral e
    identidade forte.
36. [planejada; depende do gate 35] Acrescentar tratamento proativo de estornos
    e entradas. Estorno exige vinculo forte com a compra quando esse vinculo for
    necessario para a semantica; entrada genuina exige reconciliacao com o
    ledger. Nenhum deles pode absorver transferencia interna, rendimento de
    reserva sem evidencia ou duplicidade. Primeiro prompt/revisao, sem escrita.
37. [planejada; depende do gate 36] Tratar transferencias e reservas
    patrimoniais. Parear pontas somente por identidade forte e escopo de contas;
    aplicacao/resgate de Caixinha nao vira receita ou despesa, rendimento
    continua ganho e transferencia nao pareada permanece alertavel/revisavel,
    nunca classificada por descricao. Primeiro prompt/revisao, sem escrita.
38. [planejada; depende dos GOs das classes anteriores] Ativar escrita
    financeira de modo gradual. Comecar por compra; cada classe adicional entra
    somente depois do proprio GO. Exigir segunda confirmacao, revalidacao,
    idempotencia, recibo, restart, revogacao e rollback para `write=off`, com
    auditoria independente e smoke real separados por classe.

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

33. [concluida com GO tecnico local independente] O segundo recovery publicado
em `ea803c5c29919daa582355046536bd22bf8f88a1` fechou a corrida de temporarios
e recebeu zero achados na reauditoria focal.

34. [promocao OCI concluida; smoke numerico pendente] O hash
`09b6dab6e679ce28202cb87f83d38549f64e6ae8` foi promovido sem rollback;
processo, health, WhatsApp, flags e estado ficaram verdes. Todo acesso SSH
temporario foi removido. A resposta unica a `admin stats` prova o novo runtime,
mas o fechamento funcional ainda exige uma compra real `POSTED/new` produzir o
lote numerado nos dois telefones, com selecao/revisao e zero escrita.

Depois do GO independente do gate 33, seguir estritamente 34 -> 35 -> 36 -> 37
-> 38. Nenhum GO autoriza automaticamente o gate seguinte, uma nova classe ou
escrita em producao.
