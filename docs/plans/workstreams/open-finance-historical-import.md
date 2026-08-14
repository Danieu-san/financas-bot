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
   lote de comprovantes Nubank e decisoes associadas fechou mais dezessete
   ocorrencias: residual 307 e prontos 1.649, sem escrita.
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
   sem achados bloqueantes ou lacuna indispensavel. O recálculo permaneceu
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
10. [bloqueada ate GO] Implementar e ensaiar writer historico idempotente.
11. [bloqueada ate GO e backup] Aplicar lote real com recibo e rollback.

## Estado privado vigente

- 1.649 prontos;
- 2 existentes comprovados;
- 34 duplicatas provaveis;
- 198 excluidos;
- 307 em revisao;
- 161 fora da janela;
- zero escrita financeira.

O residual exige decisoes privadas sobre grupos repetidos opacos; moedas nao
BRL, creditos sem vinculo forte e duplicatas provaveis continuam retidos.

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

Agrupar primeiro os descritores de intermediadores pelo beneficiario real;
consultar planilha, catalogos e decisoes registradas, depois pesquisa publica e
somente entao Daniel, uma vez por identidade ainda opaca. Toda pergunta deve
trazer data, valor, conta/cartao, titular/origem e descricao por ocorrencia.
Manter retidos moedas
nao BRL, creditos sem vinculo forte, saldos rotativos e duplicatas provaveis;
nao habilitar writer historico, importacao real ou deploy.
