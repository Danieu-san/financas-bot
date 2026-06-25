# Estudo profundo: Meu Planner Financeiro

Data: 2026-06-20
Status: auditoria de produto/UX para referencia interna do FinancasBot

## Objetivo

Registrar, antes da perda de acesso, o maximo possivel do funcionamento observado
no Meu Planner Financeiro: funcionalidades, arquitetura de produto, UX, design,
modelagem financeira, WhatsApp, dashboards e oportunidades de melhoria para o
FinancasBot familiar de Daniel e Thais.

Este documento nao e uma especificacao para copiar o concorrente. Ele separa:

- conceitos de dominio que valem incorporar;
- padroes de UX/design que ajudam o usuario;
- escolhas que nao devemos copiar;
- lacunas que continuam desconhecidas.

## Fontes usadas

- Web app autenticado em `web.meuplannerfinanceiro.com.br`.
- Fluxos reais pelo WhatsApp do Meu Planner, com dados sinteticos marcados para
  teste.
- Prints/onboarding enviados pelo usuario.
- Resumo de videos produzido externamente pelo Gemini e tratado como evidencia
  secundaria.

Nao registrar neste documento credenciais, telefones, QR codes, tokens, links
privados, e-mails completos ou dados financeiros pessoais.

## Nivel de confianca

### Alto

Confirmado diretamente no web app ou no WhatsApp:

- navegacao principal;
- tabelas e dashboards;
- formularios de lancamento, transferencia, recorrencia, fatura, importacao,
  planos e investimentos;
- menus de perfil/configuracao;
- comportamento observado do assistente WhatsApp em mensagens reais;
- ausencia de erros de console na sessao observada.

### Medio

Observado parcialmente, mas nao exercitado ate o fim:

- edicao em massa;
- categorizacao por IA na grade;
- importacao real de OFX/XLS/PDF;
- baixa de fatura em lote;
- edicao de entidades ja usadas;
- tutoriais guiados apos iniciar cada tour.

### Baixo

Baseado em video/resumo ou mensagens de onboarding, ainda sem validacao pratica:

- OCR de comprovantes por imagem;
- cards/graficos enviados pelo WhatsApp;
- regras exatas de bloqueio por itens sem categoria;
- recalculo detalhado de planos apos antecipacao, saque ou alteracao.

## Mapa de navegacao

### Inicio

Funcao: cockpit rapido do mes.

Elementos observados:

- atalhos grandes: Receita, Despesa e Transferencia;
- seletor de mes e ano;
- card de Lancamentos com totais de receitas, despesas e saldo;
- alternancia entre despesas e receitas recentes;
- card de Pendencias com agrupamento por mes, data, categoria, item e status;
- Constancia no acompanhamento financeiro, em grade semanal;
- mensagem motivacional de disciplina financeira;
- Saldo por Conta;
- Cartoes de Credito;
- Anotacoes livres;
- icones para gerenciar contas, editar saldos, gerenciar cartoes e editar
  anotacoes.

Ideia util:

- A tela inicial nao tenta mostrar tudo. Ela responde: "o que aconteceu no mes?",
  "o que esta pendente?", "estou mantendo constancia?", "onde esta meu dinheiro?"
  e "quanto tem em cartoes?".

Risco/limite:

- Muitos botoes sao icones com tooltip e sem nome acessivel obvio. Para mouse
  funciona; para teclado/leitor de tela e descobribilidade, e fraco.

### Dashboard - Balanco Mensal

Funcao: leitura executiva do mes.

Secoes observadas:

- Receitas e Despesas;
- percentual de despesas em relacao as receitas;
- despesas: realizado versus planejado;
- gastos com cartoes de credito;
- percentual por categoria de gasto em relacao a receita;
- detalhamento de gastos por categoria.

Ideia util:

- O dashboard mistura grafico e tabela de detalhe. O grafico da a visao; a tabela
  permite conferir rapidamente.
- Ele fala em realizado versus planejado por categoria, nao apenas saldo final.

### Dashboard - Planos

Secoes observadas:

- principais planos;
- grau de compromisso no mes atual;
- planos do mes atual;
- montante acumulado.

Ideia util:

- Metas/dividas nao aparecem so como lista. Elas aparecem como compromisso mensal
  e montante acumulado.

### Dashboard - Investimentos

Secoes observadas:

- rendimentos nos ultimos 12 meses;
- composicao da carteira;
- indicadores do Banco Central;
- investimentos por instituicao financeira;
- investimentos por emissor.

Indicadores visiveis:

- SELIC;
- CDI;
- IPCA;
- data de ultima atualizacao.

Ideia util:

- Indicadores externos ajudam contexto, mas nao substituem os dados proprios.
- Para o FinancasBot, isso fica depois do ledger patrimonial estar correto.

### Controle - Planejamento e Controle

Funcao: orcamento por categoria/subcategoria e comparacao historica.

Elementos observados:

- Saldo Acumulado;
- Saldo Mensal;
- Categorias e Subcategorias;
- Planejamento;
- percentual;
- ultimos 3, 6 e 12 meses com minimo, media e maximo;
- colunas mensais lado a lado;
- edicao de planejamento por linha/categoria.

Ideia util:

- Essa e uma das melhores telas do produto.
- Ela responde: "quanto planejei?", "quanto realizei?", "isso esta alto ou baixo
  comparado ao meu historico?".

Traducao para o FinancasBot:

- Nosso dashboard v2 deve ter orcamento por categoria/mes e comparacao com
  historico, alem do orcamento familiar global.
- No WhatsApp, perguntas como "em que categoria eu estou pior que minha media?"
  devem sair desse mesmo modelo.

### Controle - Lancamentos

Funcao: livro financeiro operacional.

Colunas observadas:

- Data do evento;
- Data da efetivacao;
- Categoria;
- Subcategoria;
- Instituicao Financeira;
- Cartao de Credito;
- Descricao;
- Valor;
- Status.

Acoes observadas:

- Criar lancamento;
- Edicao em massa de lancamentos;
- Filtros;
- Categorizar por IA;
- Lancamentos recorrentes;
- Gerenciar Faturas;
- Importar Extratos e Faturas;
- Exportar Lancamentos;
- Limpar filtros;
- paginacao e quantidade por pagina.

Ideia util:

- O modelo de dados e mais importante que a tabela em si: evento, efetivacao,
  status, conta/cartao e categoria vivem juntos no lancamento.
- O usuario pode olhar a mesma realidade por varias lentes: data, status,
  categoria, conta, cartao e descricao.

UX observada:

- "Criar lancamento" injeta uma linha editavel no topo da tabela.
- Isso e rapido para usuario avancado, mas denso para usuario comum.
- O modal rapido da home e mais amigavel que a linha inline da tabela.

### Controle - Pendencias

Secoes observadas:

- Gastos no cartao de credito;
- Detalhamento das faturas;
- Pendencias por categoria.

Filtros observados:

- ano;
- meses;
- cartao;
- estado vazio;
- limpar filtros.

Ideia util:

- Pendencia tem tela propria. Isso torna claro que "gasto futuro/pagamento futuro"
  nao e a mesma coisa que gasto liquidado.
- Itens pendentes aparecem por mes, cartao, categoria e status.

### Controle - Analises

Secoes observadas:

- receitas e despesas por mes;
- resumo de receitas;
- composicao das receitas;
- resumo de despesas;
- despesas por subcategoria;
- receitas versus despesas por ano.

Filtros observados:

- ano;
- meses;
- categorias;
- subcategorias;
- categorias sem classificacao aparecem explicitamente.

Ideia util:

- A analise deixa o usuario segmentar sem perguntar para IA.
- Para o FinancasBot, a IA pode ser a interface para estes mesmos filtros.

### Planos

Tela: Meus Planos.

Acoes observadas:

- Criar Plano;
- Quitar parcelas;
- Retirar saldo;
- Linha do Tempo.

Cadastro de novo plano:

- Tipo do Plano: meta para guardar dinheiro ou divida/financiamento/consorcio;
- Instituicao Financeira - Particao;
- Nome do Plano;
- Mes/Ano inicial;
- Mes/Ano final ou numero de parcelas;
- Valor total ou valor da parcela;
- Valor ja arrecadado;
- Valor gasto.

Quitar parcelas:

- mostra mes atual;
- permite adiantar parcelas;
- seleciona plano;
- registra valor a guardar;
- registra quando foi pago/gasto;
- registra valor gasto/pago.

Retirar dinheiro:

- seleciona plano;
- mostra saldo disponivel;
- pede valor a retirar;
- observacoes;
- indica se o valor nao sera reposto.

Ideia util:

- "Meta" e "divida" sao dois lados de um mesmo motor de plano/projecao.
- Retirada com ou sem reposicao e uma capacidade excelente para vida real.

### Investimentos

Tela: Meus Investimentos.

Acoes observadas:

- Criar Investimento;
- Editar;
- Resgatar Investimento;
- Gerenciar Aportes e Resgates.

Cadastro de investimento:

- Instituicao Financeira - Particao;
- Emissor;
- Tipo do Produto;
- Produto;
- Data da aplicacao;
- Vencimento;
- Liquidez em dias;
- Valor investido;
- Liquidez apenas no vencimento;
- Observacoes.

Tipos de produto observados:

- Bond;
- CCB;
- CDB;
- Cotas de Cooperativa;
- CRA;
- CRI;
- Debenture;
- ETF;
- FIDC;
- Fundo de Investimento;
- LCA;
- LCD;
- LCI;
- Letra Financeira;
- Poupanca;
- Previdencia privada;
- RDB;
- Tesouro Educa+;
- Tesouro IPCA+;
- Tesouro Prefixado;
- Tesouro Renda+;
- Tesouro Reserva;
- Tesouro Selic;
- Acao;
- BDR;
- CFD;
- COE;
- Criptomoeda;
- Derivativo;
- Fiagro;
- FII;
- FI-Infra;
- FIP;
- Forex;
- Imovel;
- Ouro.

Ideia util:

- Investimento ali e um modulo patrimonial, nao uma "entrada".
- O FinancasBot deve tratar aporte/resgate como movimento patrimonial, nao como
  receita/despesa comum.

## Fluxos de criacao observados

### Receita e despesa rapidas

Campos do modal:

- tipo: despesa, receita ou transferencia;
- descricao;
- valor;
- status;
- categoria;
- subcategoria;
- instituicao financeira;
- cartao de credito;
- data do evento;
- data de efetivacao.

Observacao:

- Receita mostra categorias de receita.
- Despesa mostra categorias de despesa.
- Status pode ser pendente ou concluido.

### Transferencia rapida

Campos do modal:

- descricao;
- valor;
- status;
- instituicao de saida;
- instituicao de entrada;
- data da transferencia.

Microcopy observado:

- transferencias entre contas representam movimentos entre contas do mesmo titular;
- nao sao receita nem despesa;
- apenas redistribuem saldo entre instituicoes financeiras.

Este texto e conceitualmente muito bom. Para o FinancasBot, a regra deve ser
mais importante que a frase: transferencia interna nunca muda gasto, renda ou
patrimonio total.

### Lancamento parcelado / recorrente

Campos:

- tipo: despesa ou receita;
- modo: parcelado ou recorrente;
- instituicao financeira;
- cartao de credito;
- numero de parcelas/lancamentos;
- valor da parcela;
- data da compra;
- primeiro pagamento;
- categoria;
- subcategoria;
- descricao.

Ideia util:

- A mesma tela cobre parcela e recorrencia, mas distingue a regra.
- Para o FinancasBot, prefiro manter regra de recorrencia como regra, nao como 12
  linhas precriadas.

### Gerenciar faturas

Campos:

- cartao de credito;
- mes/ano;
- valor total da fatura;
- lista de lancamentos encontrados;
- atualizar lancamentos;
- instituicao financeira;
- status;
- data de efetivacao.

Ideia util:

- Fatura e uma entidade operacional: cartao + competencia + itens + conta de
  pagamento + status.
- Pagamento de fatura deve liquidar a fatura, nao criar novo gasto duplicado.

### Importar arquivo

Opcoes:

- Extrato bancario;
- Fatura cartao;
- instituicao financeira/particao;
- formato OFX;
- formato XLS/XLSX;
- PDF beta para fatura, segundo evidencia anterior;
- importar.

Ideia util:

- Importacao pertence ao web app, mas o WhatsApp pode receber arquivo se houver
  preview e confirmacao.
- XLS/XLSX e uma capacidade que nosso bot ainda nao cobre.

### Exportar lancamentos

Fluxo:

- exporta os lancamentos filtrados para XLSX.

Ideia util:

- Exportacao filtrada e uma conveniencia simples e valiosa, principalmente se um
  dia deixarmos Sheets como espelho e SQLite como fonte canonica.

## Entidades financeiras

### Categorias e subcategorias

Caracteristicas:

- categorias separadas por tipo: receita ou despesa;
- subcategorias associadas;
- categorias visiveis no cadastro e nos filtros.

Para o FinancasBot:

- manter categorias como entidades configuraveis;
- permitir aliases aprendidos;
- mostrar qualidade/cobertura de categorizacao;
- nao bloquear todo dashboard por uma linha sem categoria.

### Instituicoes financeiras e particoes

Caracteristicas:

- instituicao financeira pode ter particoes;
- exemplos: principal, reserva/caixinha;
- saldos por conta aparecem na home.

Para o FinancasBot:

- contas/particoes sao P0 no futuro ledger familiar;
- caixinha/reserva deve virar conta/particao, nao apenas categoria textual.

### Cartoes

Caracteristicas:

- cartoes sao entidades proprias;
- exibem limite, vencimento, fechamento e fatura;
- faturas podem ser gerenciadas em lote.

Observacao de UX:

- Ao criar cartao, mascara monetaria pode confundir: valor digitado como `1500`
  apareceu como `R$ 15,00` no teste anterior. Precisamos ser melhores em mascara
  de dinheiro e exemplos de preenchimento.

## Perfil, configuracoes e educacao

### Perfil

Campos:

- nome;
- sobrenome;
- genero;
- e-mail.

### Assinatura

Mostra:

- plano;
- status;
- vencimento;
- adesao;
- provedor;
- cancelamento;
- contato.

### Assistente WhatsApp

Mostra:

- adicionar dispositivo;
- limite de ate dois numeros;
- telefone cadastrado;
- expiracao;
- link/QR para conexao;
- copiar link.

Para o FinancasBot familiar:

- nao precisamos limitar artificialmente a dois numeros no modelo, mas para
  Daniel/Thais podemos ter uma tela simples de dispositivos autorizados.

### Lembretes

Mostra:

- lembretes por e-mail;
- transacoes pendentes da semana;
- resumo dos proximos 7 dias.

Para o FinancasBot:

- WhatsApp e Calendar continuam canais melhores para o nosso uso, mas uma
  configuracao clara de lembretes e importante.

### Configuracoes

Opcoes:

- alterar e-mail;
- importar dados do MPF Excel;
- apagar dados da conta.

Para o FinancasBot:

- precisamos de uma area de manutencao: backup, exportacao, limpar dados de
  teste, manual, status do bot, permissoes, dispositivos e preferencias.

### Tutoriais e videos

Videos listados:

- Primeiros passos;
- Planejamento orcamentario;
- Registrando receitas e despesas;
- Importando faturas e extratos;
- Analisando as receitas e despesas;
- Contas a Pagar e a Receber;
- Criando planos;
- Editando parcelas dos planos;
- Quitando parcelas dos planos;
- Retirando dinheiro dos planos;
- Investimentos;
- Dashboards;
- Migrando da planilha para a web.

Tutoriais listados:

- Tour Inicial;
- Como importar MPF Excel;
- Planejamento Financeiro;
- Registrar Receitas e Despesas;
- Gerenciar Pendencias;
- Criar Planos;
- Criar Investimentos.

Ideia util:

- Manual estatico nao basta. O produto ensina pelo contexto da tarefa.
- Para o FinancasBot: ajuda contextual no WhatsApp + tour do dashboard + manual
  vivo na pasta do Drive.

## WhatsApp observado

### O que funcionou bem

- Lanca despesa simples com valor, descricao, data e PIX.
- Lanca receita simples.
- Lanca compra no cartao com parcelas depois de perguntar categoria.
- Entende erro de digitacao simples, como "gstei" e "ubre".
- Data passada foi registrada corretamente.
- Lancamento futuro ficou pendente.
- Recorrencia mensal criou ocorrencias futuras.
- Excluir item recente funcionou com confirmacao.

### O que funcionou mal

- Transferencia interna pelo WhatsApp criou apenas saida, sem entrada pareada,
  reduzindo saldo total. O web app sabe modelar transferencia corretamente, mas
  o bot deles nao aplicou isso no teste.
- Duplicata simples foi aceita.
- Perguntas como "ultimo lancamento" retornaram total geral, nao o item recente.
- Perguntas de status, detalhe e fatura foram respondidas de forma generica.
- Pedido de meta/orcamento redirecionou para web.
- Edicao/exclusao de item antigo por texto foi fraca.
- Imagem de comprovante nao respondeu no teste controlado.

Conclusao sobre WhatsApp do concorrente:

- Ele e bom em captura guiada simples.
- Ele nao parece ser um assistente conversacional analitico profundo.
- O FinancasBot deve mirar acima: conversa natural, ferramentas verificadas,
  SQL seguro e explicacao auditavel.

## UX e design

### Pontos fortes

- Hierarquia clara entre captura rapida, controle, analise, planejamento e
  patrimonio.
- Uso consistente de cards, tabelas e graficos.
- Home orientada a decisao, nao apenas cadastro.
- Separacao visual de lancamentos e pendencias.
- Dashboards com perguntas de negocio bem definidas.
- Planejamento por categoria com historico minimo/medio/maximo.
- Microcopy bom em transferencia interna.
- Tutoriais/videos por contexto.
- Dark mode.
- Console limpo na sessao observada.

### Pontos fracos

- Muitos icones sem label visivel, exigindo tooltip.
- Acessibilidade provavelmente limitada em varios botoes sem nome acessivel.
- Densidade alta na tela de lancamentos.
- Algumas acoes importantes ficam escondidas em icones pequenos.
- Mascara monetaria pode induzir erro.
- WhatsApp promete agilidade, mas respostas analiticas foram rasas.
- Algumas tarefas simples pelo WhatsApp redirecionam cedo demais para web.
- A conta de teste ficou com artefatos que nao foram faceis de remover pelo bot.

### Direcao visual para o FinancasBot

Nao copiar layout, cores ou identidade visual. Incorporar a logica:

- dashboard como cockpit de decisoes;
- cada card responde uma pergunta explicita;
- todo grafico tem drill-down;
- status/cobertura/confianca dos dados sempre visiveis;
- mobile-first;
- botoes com texto e icone, nao so icone;
- exemplos de preenchimento nos formularios;
- explicacao curta do criterio temporal usado.

## Comparacao com o FinancasBot

### O concorrente esta melhor hoje em

- livro financeiro com evento/efetivacao/status em toda transacao;
- contas/particoes e saldo por conta;
- planejamento por categoria e mes;
- pendencias como fluxo central;
- fatura como entidade operacional;
- investimentos e patrimonio;
- dashboards executivos;
- tutoriais/videos integrados.

### O FinancasBot esta melhor ou tem plano melhor em

- arquitetura conversacional com LangGraph;
- SQL read-only seguro para perguntas nao previstas;
- verificador antes de responder;
- confiabilidade de escrita com shadow/enforce;
- idempotencia/recibo/limpeza marker-only;
- explicabilidade por ferramenta, nao por calculo do LLM;
- Google Sheets/Drive como transparencia para o usuario;
- foco em conversa familiar Daniel/Thais;
- potencial de responder perguntas abertas melhor que o WhatsApp deles.

## O que devemos incorporar

### P0 - Antes de grandes novidades

1. Consolidar Fase 0 do nosso roadmap: rollouts atuais estaveis.
2. Garantir que escrita `expense.create` e `income.create` em enforce fique
   limpa em uso real.
3. Continuar agente read-only em shadow ate termos evidencia suficiente.
4. Criar baseline visual e funcional do dashboard atual antes de redesenhar.

### P1 - Nucleo financeiro familiar

1. Ledger familiar canonico.
2. Contas/particoes com saldos.
3. Data do evento, efetivacao, competencia e vencimento em todo evento.
4. Status universal: pending, settled, cancelled, uncertain.
5. Transferencias internas pareadas e neutras.
6. Cartoes/faturas vinculados a conta pagadora e itens.
7. Orcamento por categoria e mes.

### P2 - Dashboard v2

1. Home/cockpit: hoje, ciclo, saldo, disponivel, pendencias e alertas.
2. Realizado versus planejado por categoria.
3. Contas/faturas/parcelas futuras.
4. Daniel, Thais e familia.
5. Qualidade dos dados: pendente, sem categoria, nao conciliado.
6. Drill-down em todo numero.
7. "De onde veio este valor?" usando o mesmo agente.

### P3 - Conveniencia e manutencao

1. Importacao XLS/XLSX.
2. Exportacao filtrada.
3. Correcao em massa.
4. Categorizacao assistida por IA com preview.
5. OCR/imagem somente com confirmacao.
6. Tour/manual contextual.

### P4 - Patrimonio

1. Planos como motor comum de metas/dividas/financiamentos.
2. Retirada com ou sem reposicao.
3. Investimentos com aportes, resgates, vencimento, liquidez e valoracao.
4. Separacao clara entre caixa, competencia, patrimonio e rendimento.

## O que nao devemos copiar

- Visual, texto, marca, estrutura literal de telas ou copy.
- Forcar a web para tarefas que o assistente consegue resolver com seguranca.
- Responder analises pelo WhatsApp de forma generica quando o usuario pediu
  detalhe.
- Aceitar transferencia interna de uma ponta so.
- Aceitar duplicata obvia sem aviso.
- Precriar recorrencias de forma dificil de manter, se uma regra auditavel for
  suficiente.
- Esconder acoes principais em icones sem texto.
- Fazer OCR/IA gravar dados sem preview.

## Lacunas ainda nao fechadas

Mesmo apos a auditoria profunda, ainda nao conhecemos perfeitamente:

- detalhes internos de edicao de entidades ja usadas;
- comportamento de categorizacao por IA com linhas selecionadas;
- fluxo completo de importacao real OFX/XLS/PDF;
- OCR real de comprovantes;
- regras de duplicidade na importacao;
- regras de confiabilidade quando ha dados sem categoria;
- detalhes dos tutoriais guiados apos iniciar cada tour;
- comportamento com uma conta populada por meses/anos reais;
- desempenho e responsividade mobile em profundidade.

Para fechar isso seria preciso executar fluxos mutaveis adicionais ou ter uma
conta descartavel populada. Para nosso objetivo atual, o nivel de conhecimento
e suficiente para orientar roadmap e design.

## Veredito

O Meu Planner Financeiro e forte como plataforma web estruturada. Ele modela bem
contas, datas, status, pendencias, planejamento, faturas, planos e investimentos.
Seu dashboard e claro porque nasce de um livro financeiro rico.

O WhatsApp deles, porem, parece ser mais uma camada de captura rapida do que um
assistente financeiro conversacional profundo. Foi justamente ai que o FinancasBot
pode vencer: manter a solidez contabil do web app, mas oferecer conversa natural
com ferramentas verificadas, sem exigir que Daniel e Thais saibam navegar por
telas densas.

O caminho recomendado continua sendo o roadmap familiar ja criado:

1. concluir os rollouts atuais;
2. criar ledger familiar canonico;
3. construir contas/datas/status/transferencias/faturas sobre esse ledger;
4. redesenhar o dashboard v2 em cima de numeros auditaveis;
5. so depois avancar para planos, importacao ampliada, OCR e investimentos.
