# Gate 41 - importacao historica idempotente para a planilha

Atualizado em: 2026-08-14

## Estado

`PLANEJADOR COM GO TECNICO LOCAL; COBERTURA COMPLETA; PLANO PRIVADO EM REVISAO;
SEM WRITER HISTORICO`.

## Objetivo

Transformar o RX historico saneado em um plano de importacao revisavel,
confrontando primeiro a planilha pessoal comprovada, sem duplicar linhas
existentes e sem misturar conta, cartao, transferencia, estorno ou reserva.

## Escopo

- consumir snapshots privados de Pluggy, RX e planilha somente por argumentos;
- exigir leitura da planilha pessoal consolidada e escopada por usuario;
- usar data, valor, direcao, conta/cartao, identidade e descricao para detectar
  correspondencia ou duplicata;
- vincular cartoes por `card_id` e contas por Conta Financeira;
- evidenciar mes de cobranca por conta, `bill_id` e vencimento da fatura;
- inferir categoria apenas de regra explicita, padrao univoco da planilha ou
  regra deterministica estabelecida;
- preservar parcelas distintas e seu mes de cobranca;
- excluir principal de Caixinha de receita/despesa;
- produzir relatorio privado com pendencias de revisao;
- preparar posteriormente writer idempotente com recibo e rollback.

## Nao escopo desta fatia

- escrever transacoes historicas no Google Sheets;
- importar automaticamente item ambiguo;
- tratar ausencia de categoria, conta, identidade ou evidencia como zero;
- reconstruir a serie historica das Caixinhas;
- ativar writer, WhatsApp, Pluggy ou deploy de producao.

## Invariantes

1. Conta e cartao permanecem fontes distintas mesmo com o mesmo banco/titular.
2. Linha existente ou possivel duplicata nunca entra no lote gravavel.
3. Cartoes e catalogo pessoal A:H; Lancamentos Cartao e fonte consolidada A:J.
4. Mes derivado de `bill_id` exige mesma conta e fatura Pluggy real.
5. Categoria pronta exige decisao explicita ou evidencia deterministica.
6. Aplicacao/resgate de reserva e neutro em receita e despesa.
7. Estorno exige vinculo forte; pagamento de fatura nao vira gasto.
8. O planejador puro sempre retorna `financial_writes=0`.
9. Writer futuro exige hash, backup, idempotencia, recibo, rollback e auditoria.

## Etapas

1. [concluida] Provar por escrita e limpeza sinteticas qual planilha o bot usa.
2. [concluida] Invalidar o snapshot central e capturar a planilha pessoal.
3. [concluida] Atualizar Pluggy read-only e fechar cobertura temporal.
4. [concluida] Adaptar configurador e planejador ao schema consolidado.
5. [concluida] Vincular meses de fatura por conta e `bill_id` com prova causal.
6. [concluida] Reusar `card-itau` e criar/reler somente a conta Cristina/Nubank.
7. [em andamento] Recalcular o plano real e resolver revisoes privadas; regras
   semanticas, pares familiares e decisoes explicitas reduziram o residual a
   521. A rodada v17 reaproveitou decisoes anteriores, catalogo recorrente e
   pesquisa publica somente para identidades comerciais fortes, levando o
   residual a 419 e os prontos a 1.540, sem escrita. Nove decisoes humanas
   agrupadas posteriores fecharam exatamente mais 29 itens, levando o residual
   a 390 e os prontos a 1.569, sem mudancas inesperadas e sem escrita. O segundo
   lote humano fechou mais 16 ocorrencias explicitamente apresentadas, levando
   o residual a 374 e os prontos a 1.585; perguntas futuras exigem contexto
   completo por movimento antes de aplicar a resposta. O terceiro lote usou
   somente decisoes por ocorrencia e fechou mais 15 itens distintos: residual
   359 e prontos 1.600, sem escrita. O quarto lote fechou seis transferencias
   contextualizadas e duas quitacoes inequivocas: residual 351 e prontos
   1.608, restando somente `saldo em atraso` como grupo de categoria repetido.
   O quinto lote fechou sete gastos do casamento e um curso: residual 343 e
   prontos 1.616, sempre sem escrita. O sexto lote fechou seis movimentos,
   excluiu dois pagamentos de fatura e uma contraparte bilateral forte:
   residual 334, prontos 1.622 e excluidos 198, sem escrita. O setimo lote
   classificou dez ocorrencias contextuais, incluindo uma unica Wise coberta
   pela regra ampla autorizada: residual 324 e prontos 1.632, sem escrita. O
   lote de comprovantes Nubank e decisoes associadas fechou mais noventa e sete
   ocorrencias, incluindo 43 despesas BRL ambiguas de ate R$ 20 classificadas
   como lanche, o lote posterior de nove lanches e um teatro e o fechamento de
   quatro lanches, Renner, curso e chip Claro: residual 227 e prontos 1.729,
   sem escrita. O candidato causal posterior neutralizou pares unicos de
   compra/estorno de cartao e papeis explicitos de fatura, reduzindo o residual
   a 172; 22 compras antes prontas passaram corretamente a excluidas junto aos
   estornos, resultando em 1.707 prontos e 275 excluidos, sem escrita.
   A triade de Pix financiado por cartao corrigiu oito itens adicionais: quatro
   creditos de principal ficaram neutros e quatro debitos de cartao passaram a
   representar somente a taxa em revisao. O plano ficou com 1.704 prontos, 279
   excluidos e 171 em revisao, sem escrita.
8. [concluida] Executar a bateria hermetica ampla do candidato privado inicial:
   106/106 verdes; candidato familiar posterior: 111/111 verdes.
9. [concluida] Publicar `fe374a3ee3a67457c02e74268984c7428fbcb2ac` e
   obter `GO TECNICO LOCAL` independente no escopo read-only.
9.1. [concluida] O hash `e9a73b8a6d982d94941dfc73d9b1f393f561e0fd`
   recebeu `NO-GO` por aceitar decisoes privadas em caminho absoluto dentro do
   repositorio; a fronteira foi fechada, a bateria ampla permaneceu 106/106 e
   `87f5e9ad767301cb3ec34197ca13cd470ade55af` recebeu `GO TECNICO LOCAL` em
   reauditoria independente, sem achados ou lacuna indispensavel.
9.2. [concluida] O pareamento familiar bilateral no hash
   `c5d325927721436432d2d38caa7366c77ab1d732` recebeu `GO TECNICO LOCAL`
   independente, sem achados ou lacuna indispensavel.
9.3. [NO-GO independente] O hash
   `2577ebc49efbfa18c845fe77e6c9e9954b00f109` recebeu um achado ALTO porque a
   prova de ausencia do credito consultava Saidas, mas nao Entradas.
9.4. [GO tecnico local independente] Neutralizacao de estorno pre-salvamento exige par
   mutuamente unico, mesma conta bancaria, valor oposto, semantica explicita,
   identidades estaveis, ate 30 dias e ausencia dos dois lados na aba coerente
   com sua direcao; o teste novo prova estorno ja salvo em Entradas. Focal
   31/31, bateria ampla 115/115 e `financial_writes=0`; o hash
   `6dc4e7e36e36f011fa3252412aae36071d654e1e` recebeu `GO TECNICO LOCAL`,
   zero achados e nenhuma lacuna indispensavel no escopo read-only.
9.5. [GO tecnico local independente] Pagamento de fatura bilateral exige
   debito bancario explicitamente classificado, credito `POSTED` de cartao,
   BRL, identidades unicas, ausencia na planilha, mesmo valor, ate tres dias e
   correspondencia mutuamente unica. Focal 34/34, bateria historica 118/118 e
   impacto privado de 37 contrapartes fechadas, sempre com
   `financial_writes=0`. O hash
   `7387a371ef4805ea7b8966685a9ec9411a70530c` recebeu GO independente, sem
   achados altos ou medios e sem lacuna indispensavel; um achado baixo de
   granularidade focal nao bloqueia o escopo.
9.6. [GO tecnico local independente] Decisoes privadas individuais permitem
   transferencia historica para destino textual sem cadastra-lo e comprovacao
   de linha ja existente somente por correspondencia factual unica. O primeiro
   candidato recebeu `NO-GO` probatorio; as cinco lacunas focais foram cobertas
   e o hash `3a528407f97d1bc7aa923807de74c62af23200ab` recebeu `GO TECNICO LOCAL`,
   sem achados bloqueantes ou lacuna indispensavel. O recÃ¡lculo permaneceu
   read-only e sem criar vinculo operacional.
9.7. [NO-GO independente] O snapshot passa a incluir o catalogo `Contas` e o
   configurador reutiliza as regras recorrentes reais do produto. Conflitos
   falham fechado, regras curtas exigem contexto de pagamento e categoria
   historica exata conserva precedencia sem apagar recorrencia. Focal 56/56,
   bateria historica 127/127 e `financial_writes=0`; a auditoria encontrou que
   aba ausente ainda era silenciosamente aceita e faltava cobertura focal.
9.8. [GO tecnico local independente] Snapshot e configurador agora abortam sem
   `Contas`; regra inativa, cartao sem recorrencia sintetica e CLI com a funcao
   real possuem provas negativas. Focal 60/60, bateria historica 131/131 e
   `financial_writes=0`. O hash
   `a1bdaa55c66613b5027132760e356f2530c734c0` recebeu GO independente, sem
   achados materiais ou lacuna indispensavel no escopo read-only.
9.9. [GO tecnico local independente] Pares de compra/estorno de cartao exigem
   mesmo cartao, valores opostos, semantica explicita, identidade estavel,
   unicidade mutua, ate 30 dias, ausencia na planilha e status `POSTED` dos dois
   lados. Pagamentos de fatura, saldos e ajustes de financiamento so sao
   excluidos por descricoes exatas, papel, sinal e status coerentes. Focal
   44/44, bateria historica ampla unica 136/136 e `financial_writes=0`. O hash
   `e17a991a9d89d3b9d1ad423420f784f9205021b7` recebeu GO independente, sem
   achados por severidade ou lacuna indispensavel no escopo read-only.
9.10. [concluida] Pix financiado por cartao exige triade
   mutuamente unica no mesmo item e titular: saida e credito bancarios do
   principal, seguidos em ate cinco segundos por debito maior no cartao. O
   principal fica neutro e somente a taxa permanece em revisao, sem write plan.
   Focal 47/47, bateria historica ampla unica 139/139 e
   `financial_writes=0`. A auditoria do primeiro hash encontrou igualdade entre
   titulares ausentes; a recuperacao exige `ownerUserId` nao vazio nos dois
   bindings, tem focal 47/47, ampla final 139/139 e plano privado `v208` com o
   mesmo hash e contagens. O hash
   `f45a7b2a1b86ab3386482bb86429b538f2c84757` recebeu GO independente sem
   achados por severidade nem lacuna indispensavel no escopo read-only.
9.11. [GO tecnico local independente] O RX historico fechado foi preservado e
   o plano incremental separado de 2026-07-28 a 2026-08-14 usa snapshots novos
   de Pluggy e planilha. O opt-in de fatura aberta reutiliza o contrato do Gate
   40, preserva o estado bruto e mantem parcelamentos, creditos, estornos,
   pagamentos e saldo agregado fora de compras comuns. Bateria causal 168/168,
   plano privado com 46 prontos, 26 em revisao, 17 excluidos, cobertura completa
   e `financial_writes=0`. O hash
   `7e7166823f4e2d77be76d864a14ef979ed11e524` recebeu GO independente,
   sem achados bloqueantes ou lacuna indispensavel no escopo read-only; a suite
   geral continua sem veredito e sera exigida antes de writer ou release.
9.12. [GO tecnico local independente] Oito decisoes incrementais por
   ocorrencia passaram a `ready` sem mudanca colateral. A devolucao restante
   agora exige decisao privada exata e o par forte original de pagamento,
   identidade de titular/conexao, valor, tempo, estado e unicidade mutua. RED
   de duas falhas, focal `68/68`, bateria historica ampla `143/143` e plano
   privado com 71 prontos, 18 excluidos, zero revisoes, cobertura completa e
   `financial_writes=0`. A primeira auditoria confirmou a implementacao, mas
   apontou uma lacuna probatoria MEDIA. O recovery adiciona controles para
   identidade repetida, linha ja existente e ambiguidade inversa; focal
   `68/68` e ampla final `143/143`. A reauditoria confirmou esses controles,
   mas pediu a prova integrada de duplicata forte nao identica. A segunda
   recuperacao acrescentou esse cenario. O hash
   `3a9e09f6b816a26c873eb339aa09027b5b39b820` recebeu GO independente,
   com zero achados e nenhuma lacuna indispensavel no escopo read-only.
9.13. [GO operacional/documental] Substituir o favorecido da mensalidade
   recorrente no cadastro existente, sem criar alias concorrente, e corrigir a
   classificacao para `Educacao / CURSOS / ESTUDOS`. A captura read-only final
   preservou as demais faixas e retornou `Contas` ao total anterior; a
   comparacao das 2.357 entradas do plano mostrou exatamente uma alteracao de
   categoria, subcategoria e recorrencia. O plano privado manteve 71 prontos,
   18 excluidos, zero revisoes, cobertura completa e `financial_writes=0`, hash
   `1fb4e50f4290ea59fe6b56b2143578df671e0cafc41fe99da162554e7fefee23`.
   Nenhum writer, importacao ou deploy foi acionado. O hash
   `69491a7728ca5c9fc4544c30a7acb40e10c315c0` recebeu parecer documental
   `SUFICIENTE`, sem lacuna indispensavel no escopo declarado e sem alegar
   verificacao independente dos artefatos privados.
9.14. [concluida documentalmente] Agrupar as 147 entradas ou estornos uma
   unica vez e aplicar somente 58 decisoes confirmadas: 33 salarios pelos mesmos
   padroes da rodada incremental e 25 entradas do casamento pela fronteira exata
   definida por Daniel, sem ampliar a janela temporal. Decisoes exatas por
   referencia evitam regra por valor ou por data aproximada. A comparacao das
   2.351 entradas exigiu exatamente 58 transicoes para `ready / income`; os
   demais estados permaneceram identicos. O plano privado ficou com 1.762
   prontos, 113 revisoes, cobertura completa e `financial_writes=0`, hash
   `cfd0df66c4753d376ab03847fd376112af7d9703a482c70b4336e8e08e8e1fc3`.
   A primeira auditoria encontrou checkpoints vigentes obsoletos; depois da
   reconciliacao documental, o hash
   `59468cad282f911921feaeb4d084e143c6ae6d45` recebeu `SUFICIENTE`, sem lacuna
   indispensavel no alcance declarado e sem autorizar escrita.
9.15. [concluida documentalmente] Aplicar oito decisoes individuais
   confirmadas por Daniel ao residual bancario, sem criar regra ampla por
   pagador, valor ou descricao. A comparacao integral manteve 2.351 entradas e
   encontrou somente as oito transicoes esperadas para `ready / income`, na
   aba `Entradas`, sem recorrencia e com zero escrita. O plano privado ficou
   com 1.770 prontos, 105 revisoes, cobertura completa e hash
   `d6dd5174cda03fa3375675dfe645b5178c8ad6b79562630d59f7c9ad6b96ecb4`.
   O hash imutavel `f350897c4ceea748c6fa3a8666c42301c2c34dd1` recebeu parecer
   `SUFICIENTE`, sem lacuna documental indispensavel, autorizando somente o
   fechamento documental e a continuidade read-only.
9.16. [concluida tecnicamente] Encerrar as 25 entradas bancarias
   semanticas restantes com 27 decisoes exatas, incluindo duas contrapartes de
   pares ja planejados. Transferencia interna recebida exige origem textual e
   credito bancario positivo; transferencias iguais exigem referencias
   reciprocas, contas distintas, valores opostos, BRL, `POSTED`, identidade
   unica e janela causal. Credito de emprestimo confirmado fica excluido de
   renda e qualquer direcao/status divergente falha fechado. A comparacao
   `v213 -> v214` preservou 2.351 entradas e alterou somente as 27 referencias
   autorizadas: 20 para `ready`, cinco para `excluded` e duas `ready -> ready`.
   Plano privado: 1.846 prontos, 284 excluidos, 24 revisoes, cobertura completa,
   oito bindings e `financial_writes=0`. Focal 73/73 e suite ampla final com
   1.705 aprovados, zero falhas e dez skips controlados. Candidato em
   `docs/audit/254-open-finance-historical-bank-credit-causality-candidate-2026-08-15.md`.
   O hash `388d13e7a35ff45b2718dc54fce14681d976ca76` recebeu `GO TECNICO
   LOCAL`, zero achados materiais e nenhuma lacuna causal indispensavel;
   fechamento em
   `docs/audit/255-open-finance-historical-bank-credit-causality-independent-close-2026-08-15.md`.
9.17. [GO tecnico local independente] Encerrar os 24 residuos tecnicos com
   decisoes privadas exatas: pares reciprocos de estorno, ajustes negativos de
   credito, somente a taxa do Pix financiado e conversao BRL revisada de moeda
   estrangeira `POSTED`; moeda estrangeira `PENDING` nao vira fato. Plano
   privado com 1.863 prontos, 291 excluidos, zero revisoes, cobertura completa
   e `financial_writes=0`. Focal 79/79 e suite ampla final com 1.711 aprovados,
   zero falhas e dez skips controlados. O hash
   `a98f99133ab12e036c914b08654116f3fb4f4b68` recebeu GO independente, sem
   achados materiais nem lacuna indispensavel no escopo read-only; fechamento
   em `docs/audit/257-open-finance-historical-card-residuals-independent-close-2026-08-15.md`.
10. [pronta para gate separado] Implementar e ensaiar writer historico
   idempotente depois das correcoes operacionais priorizadas por Daniel.
11. [bloqueada ate GO e backup] Aplicar lote real com recibo e rollback.

## Estado privado vigente

- 1.863 prontos;
- 2 existentes comprovados;
- 34 duplicatas provaveis;
- 291 excluidos;
- zero em revisao;
- 161 fora da janela;
- zero escrita financeira.

As ambiguidades comuns, bancarias e tecnicas terminaram no planejador read-only.
As 34 duplicatas provaveis permanecem corretamente fora do conjunto gravavel.

## Criterios de GO do planejador

- toda transacao recebe exatamente um estado terminal;
- cobertura temporal completa;
- quatro contas e quatro cartoes relevantes vinculados sem mistura;
- existentes e duplicatas fora do conjunto gravavel;
- nenhum mes de fatura ou categoria fraca inventado;
- reservas, transferencias, estornos e pagamentos possuem provas proprias;
- relatorio privado fora do Git;
- `financial_writes=0` em execucao local e testes;
- auditoria independente sem lacuna indispensavel.

## Condicoes de parada

- snapshot ou inventario divergente;
- dados reais aparecerem em diff, logs publicos ou stdout;
- item sem conta/cartao, identidade ou evidencia ser marcado como pronto;
- qualquer escrita historica antes do GO independente.

## Proxima acao

Abrir gate operacional separado para diagnosticar a ausencia de alertas
proativos posteriores ao ultimo deploy. Nao habilitar writer historico,
importacao real ou aplicacao na planilha dentro desse diagnostico.

Para revisoes futuras, agrupar os descritores de intermediadores pelo
beneficiario real;
consultar planilha, catalogos e decisoes registradas, depois pesquisa publica e
somente entao Daniel, uma vez por identidade ainda opaca. Toda pergunta deve
trazer data, valor, conta/cartao, titular/origem e descricao por ocorrencia.
Manter retidos moedas
nao BRL, creditos sem vinculo forte, saldos rotativos e duplicatas provaveis;
nao habilitar writer historico, importacao real ou deploy. Depois da aplicacao
do RX, abrir gate operacional separado para explicar a ausencia de alertas
proativos posteriores ao ultimo deploy.
