# Auditoria funcional: Meu Planner Financeiro x FinancasBot

Data: 2026-06-19

## Objetivo

Inventariar as capacidades observaveis do Meu Planner Financeiro e comparar com o
FinancasBot sem propor uma copia do produto. O objetivo e identificar conceitos
uteis para um assistente financeiro familiar de Daniel e Thais.

## Fontes e nivel de evidencia

- `WEB`: observado diretamente na aplicacao autenticada, sem alterar dados.
- `ONBOARDING`: observado nos seis prints compartilhados pelo usuario.
- `VIDEO`: descrito no resumo dos videos produzido pelo Gemini; pode conter
  interpretacao e so e tratado como confirmado quando corroborado por outra fonte.
- `BOT`: confirmado no codigo ou na memoria operacional do FinancasBot.

Nao foram registrados credenciais, telefones, tokens, QR codes ou dados financeiros
pessoais neste documento.

## Inventario confirmado do Meu Planner Financeiro

### 1. Estrutura da conta e uso familiar

- A conta web centraliza configuracao, planejamento e analise. (`WEB`, `ONBOARDING`)
- A conta permite cadastrar ate dois numeros para usar o assistente WhatsApp.
  Cada autorizacao possui validade e pode ser gerenciada pela web. (`WEB`)
- O WhatsApp e apresentado como interface rapida; a web concentra ajustes e
  analises detalhadas. (`ONBOARDING`)

### 2. Livro de lancamentos

Cada lancamento possui, na mesma grade: (`WEB`)

- data do evento;
- data de efetivacao;
- categoria e subcategoria;
- instituicao financeira/particao;
- cartao de credito;
- descricao;
- valor;
- status `Pendente` ou `Concluido`.

O tipo contabil e derivado da categoria. Existem categorias nativas de transferencia
de entrada e de saida. A grade permite criar linha, ordenar, filtrar, selecionar e
editar em massa. (`WEB`)

### 3. Entidades financeiras

- Categorias e subcategorias separadas entre receita e despesa. (`WEB`)
- Instituicoes financeiras com particoes, por exemplo conta corrente, poupanca ou
  outra divisao de saldo. (`WEB`, `VIDEO`)
- Cartoes com nome, icone, fechamento, vencimento, limite mensal e marcador de
  cartao principal. (`WEB`)
- O video relata inativacao em vez de exclusao de entidades ja utilizadas. Essa
  regra nao foi exercitada porque a conta inspecionada estava vazia. (`VIDEO`)

### 4. Parcelamento e recorrencia

O formulario unico suporta despesa ou receita e dois modos: (`WEB`)

- `Parcelado`: numero de parcelas, valor da parcela, data da compra, primeiro
  pagamento, categoria, subcategoria, conta, cartao e descricao.
- `Recorrente`: numero de lancamentos, valor, data inicial, primeiro pagamento,
  categoria, subcategoria, conta, cartao e descricao.

O onboarding informa que uma recorrencia sem data final gera previsao para os
proximos 12 meses. (`ONBOARDING`)

### 5. Pendencias e conciliacao

- Despesas, receitas e faturas podem ficar pendentes. (`WEB`)
- A baixa pode ser feita clicando no status. (`WEB`, tutorial interno)
- A tela de pendencias separa despesas e receitas, permite filtros por ano, mes e
  cartao e mostra faturas ao longo dos meses. (`WEB`)
- O gerenciamento de fatura seleciona cartao e competencia, soma os itens, escolhe
  a conta de pagamento, status e data de efetivacao e atualiza o lote. (`WEB`)

### 6. Importacao, categorizacao e exportacao

- Extrato bancario: OFX ou XLS/XLSX. (`WEB`)
- Fatura: OFX, XLS/XLSX ou PDF beta. (`WEB`)
- PDF pode ser marcado como protegido por senha. (`WEB`)
- Existe modelo XLS/XLSX para importacao. (`WEB`)
- A grade pode ser categorizada por IA apos selecao. (`WEB`)
- Lancamentos filtrados podem ser exportados para XLSX. (`WEB`)
- Existe migracao separada da versao antiga MPF Excel para a plataforma web.
  (`WEB`, tutorial interno)

### 7. Planejamento orcamentario

- Planejamento por categoria/subcategoria. (`WEB`, tutorial interno)
- Grade mensal com saldo acumulado, saldo mensal, planejamento e percentual.
  (`WEB`)
- Comparacao com minimo, media e maximo dos ultimos 3, 6 ou 12 meses. (`WEB`)
- Realizado exibido mes a mes ao lado do planejado. (`WEB`)
- Os videos relatam valores planejados diferentes por mes para despesas sazonais.
  A conta vazia nao permitiu comprovar integralmente essa edicao. (`VIDEO`)

### 8. Planos, metas e dividas

Um plano pode representar: (`WEB`)

- meta para guardar dinheiro;
- divida;
- financiamento;
- consorcio.

O cadastro inclui conta/particao, nome, inicio, termino ou numero de parcelas,
valor total ou valor da parcela, valor ja arrecadado e valor ja gasto. (`WEB`)

Operacoes confirmadas: (`WEB`)

- quitar parcela do mes;
- adiantar parcelas;
- registrar data e valor pago/guardado;
- retirar saldo;
- indicar se o valor retirado precisa ou nao ser reposto;
- ajustar parcelas futuras em linha do tempo;
- comparar receitas, despesas fixas, planos e saldo mensal.

### 9. Investimentos

O cadastro de ativo inclui: (`WEB`)

- instituicao/particao;
- emissor;
- tipo e nome do produto;
- data da aplicacao;
- vencimento;
- liquidez em dias ou somente no vencimento;
- valor investido;
- observacoes.

O catalogo inclui renda fixa, fundos, Tesouro, previdencia, acoes, BDR, cripto,
derivativos, FII, ouro e imoveis. (`WEB`)

Operacoes e indicadores: (`WEB`)

- editar investimento;
- resgatar;
- gerenciar aportes e resgates;
- ordenar carteira;
- saldo, total aplicado e rendimento mensal;
- grau de independencia financeira;
- rendimento dos ultimos 12 meses;
- composicao por produto, instituicao e emissor;
- rendimento bruto absoluto e percentual;
- indicadores SELIC, CDI e IPCA com fonte do Banco Central.

### 10. Dashboards e analises

- Receitas e despesas mensais. (`WEB`)
- Percentual de despesas sobre receitas. (`WEB`)
- Realizado versus planejado por categoria. (`WEB`)
- Gastos e total de faturas por cartao. (`WEB`)
- Percentual de cada categoria sobre a receita. (`WEB`)
- Receitas e despesas por mes e por ano. (`WEB`)
- Composicao e resumo de receitas/despesas. (`WEB`)
- Despesas por subcategoria. (`WEB`)
- Planos principais, compromisso do mes e montante acumulado. (`WEB`)
- Filtros por ano, mes, categoria e subcategoria. (`WEB`)
- Categorias sem classificacao aparecem explicitamente nos filtros. (`WEB`)
- O video relata bloqueio/alerta de confiabilidade quando ha itens sem categoria;
  a regra nao foi exercitada com dados reais. (`VIDEO`)

### 11. Experiencia e operacao

- Inicio com atalhos para receita, despesa e transferencia. (`WEB`)
- Resumo de lancamentos e pendencias do mes. (`WEB`)
- Saldo por conta e total de faturas. (`WEB`)
- Constancia semanal de uso. (`WEB`)
- Anotacoes livres. (`WEB`)
- Lembrete semanal por email para pendencias dos proximos sete dias. (`WEB`)
- Tour inicial com 11 passos, tutoriais contextuais e 13 videos explicativos.
  (`WEB`)
- Tema claro/escuro. (`WEB`)

### 12. WhatsApp

Capacidades comunicadas no onboarding: (`ONBOARDING`)

- registrar receitas e despesas por texto, audio ou imagem de comprovante;
- usar a data do envio quando nenhuma data for mencionada;
- aceitar lancamentos futuros, inclusive valores a receber;
- criar recorrencias mensais em linguagem natural;
- responder total, situacao do mes, saldo orcamentario e comparacao com planejado;
- reabrir o tutorial por comando;
- recomendar valor e descricao na mesma mensagem para reduzir ambiguidade.

Os videos relatam OCR, cards de confirmacao e graficos enviados como imagem. Esses
comportamentos nao foram exercitados nesta auditoria. (`VIDEO`)

## Comparacao com o FinancasBot

| Capacidade | FinancasBot atual | Diferenca real | Prioridade familiar |
| --- | --- | --- | --- |
| Data do evento + efetivacao | Bases temporais existem em dominios separados, mas nao em todo lancamento | Falta modelo temporal universal | P0 |
| Status pendente/concluido | Contas inferem pago/pendente; lancamentos comuns nao possuem lifecycle universal | Falta conciliacao explicita | P0 |
| Contas e saldos por instituicao/particao | Transferencias possuem origem/destino, mas nao ha ledger de saldos por conta | Falta reconciliacao patrimonial | P0 |
| Orcamento por categoria e mes | Existe orcamento global/ciclo, ritmo diario e ranking por categoria | Falta teto planejado por categoria/mes | P0 |
| Baixa de fatura em lote | Pagamento de fatura e detectado como transferencia | Falta vinculo explicito entre pagamento, fatura, conta e itens | P1 |
| Recorrencia projetada | Existem contas recorrentes, regras e lembretes | Nao ha cronograma universal de receitas/despesas futuras | P1 |
| Reembolso como despesa negativa | Categoria de reembolso existe, mas nao ha regra contabil universal de estorno do consumo | Falta estorno vinculado/auditavel | P1 |
| Importacao XLS/XLSX/PDF | CSV/OFX; PDF e imagem sao rejeitados | Falta cobertura de formatos | P2 |
| Exportacao XLSX filtrada | Dados ficam em Sheets; nao ha exportacao conversacional filtrada | Diferenca de conveniencia | P2 |
| Edicao/categorizacao em massa | Importacao classifica e possui preview; correcao e individual | Falta manutencao em lote | P2 |
| Carteira de investimentos | Reserva/caixinha e tratada como transferencia; metas auditam aportes | Falta carteira, rentabilidade, liquidez e vencimento | P2 |
| Planos com redistribuicao de parcelas | Metas e dividas sao separadas e auditaveis | Falta motor de projecao/redistribuicao | P2 |
| Imagem de comprovante/OCR | Audio e texto; imagem/PDF fora do MVP | Falta captura multimodal | P3 |
| Dois numeros na mesma conta | Existe vinculo familiar e responsavel por lancamento | Nossa modelagem e mais flexivel, mas precisa ficar simples | Manter |
| Perguntas livres | LangGraph, Query Engine e SQL seguro em rollout | FinancasBot tem arquitetura conversacional mais forte | Manter |
| Idempotencia e verificacao | Camada de confiabilidade e ledger de escrita | FinancasBot possui controle mais forte contra erro silencioso | Manter |

## O que vale incorporar

1. Um livro financeiro familiar unificado, independente da interface.
2. Conta, cartao, pessoa responsavel, data do evento, efetivacao, competencia e
   status como dimensoes explicitas.
3. Orcamento por categoria e mes, preservando o orcamento familiar global.
4. Conciliacao entre lancamento manual, extrato, fatura e pagamento.
5. Projecao futura de recorrencias, parcelas, contas, dividas e metas.
6. Correcao em massa e trilha de auditoria.
7. Carteira patrimonial somente depois do livro e da conciliacao estarem solidos.

## O que nao vale copiar

- Exigir que a pessoa use a web para tarefas que o assistente pode resolver com
  seguranca pelo WhatsApp.
- Precriar 12 linhas mensais quando uma regra de recorrencia + materializacao sob
  demanda evita duplicidade e facilita alteracoes.
- Usar `float` para dinheiro; o FinancasBot deve usar centavos inteiros/decimal.
- Permitir que OCR ou IA grave valores sem a camada de confiabilidade.
- Separar meta, divida e investimento apenas pela tela; o modelo deve preservar a
  natureza contabil e os vinculos entre eventos.
- Bloquear toda analise por uma unica linha sem categoria; e melhor mostrar o grau
  de cobertura e separar totais confirmados de itens pendentes de classificacao.

## Lacunas que esta auditoria nao conseguiu fechar

- Comportamento real da categorizacao em massa por IA.
- Edicao em massa com dados selecionados.
- Soft delete de entidades ja usadas.
- Recalculo exato de parcelas apos adiantamento, desconto, multa ou saque.
- Regra exata de orcamento variavel por mes.
- Fluxo real de OCR/imagem no WhatsApp.
- Cards, botoes de editar/excluir e graficos enviados pelo WhatsApp.
- Tratamento de duplicidade na importacao e conciliacao manual versus extrato.
- Precisao dos dashboards quando existem itens sem categoria.

Fechar essas lacunas exigiria uma conta de teste populada ou execucao controlada
dos fluxos, nao apenas scraping de uma conta vazia.
