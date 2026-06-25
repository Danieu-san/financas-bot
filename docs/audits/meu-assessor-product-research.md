# Pesquisa de produto: Meu Assessor

Data: 2026-06-20
Status: referencia estrategica para roadmap do FinancasBot familiar

## Objetivo

Registrar o que vale aprender com o Meu Assessor sem transformar o FinancasBot em
uma copia ou em um assistente generico de produtividade. O foco do FinancasBot
continua sendo o controle financeiro familiar de Daniel e Thais.

## Fontes

- Site publico: `https://www.meuassessor.com/`
- Politica de privacidade: `https://www.meuassessor.com/pages/politica-de-privacidade`
- Termos de uso: `https://www.meuassessor.com/pages/termos-de-uso`

Nao foram usados dados privados, credenciais ou acesso autenticado nesta pesquisa.

## Posicionamento observado

O Meu Assessor se apresenta como um assessor pessoal por IA no WhatsApp, com
financas, agenda, tarefas, projetos, documentos, Open Finance e painel web.

O produto tenta ser um sistema operacional pessoal, nao apenas um controle
financeiro.

## Capacidades relevantes observadas

### Financas

- Registro de despesas e receitas por texto ou audio.
- Categorizacao automatica.
- Consulta de gastos pelo WhatsApp.
- Dashboard financeiro com categorias, metas e exportacao.
- Cartoes, faturas e fluxo de caixa projetado.

### Open Finance

- Conexao com mais de 110 instituicoes.
- Consulta de saldo, extrato e cartoes pelo WhatsApp.
- Sincronizacao automatica prometida por Open Finance.

Esta e a maior vantagem estrutural deles sobre o FinancasBot atual, porque reduz
friccao de importacao manual. Tambem e a area de maior risco regulatorio,
operacional e de confiabilidade.

### Conta compartilhada

- Pessoas diferentes podem alimentar a mesma conta pelo proprio WhatsApp.
- Casais, socios, equipe e secretaria sao citados como casos de uso.

Para o FinancasBot, isso confirma que o caminho familiar com planilha/ledger
unico e responsavel por lancamento esta correto.

### Agenda

- Criacao e consulta de agenda pelo WhatsApp.
- Integracao com Google Agenda.
- Lembretes e resumos diarios.
- Tarefas podem ser marcadas como feitas.

Nesse ponto o FinancasBot nao esta muito atras: ja possui Google Calendar,
resumos e validacao real de scheduler. O que falta e UX/configuracao mais clara,
nao a existencia da integracao.

### Projetos, tarefas e reunioes

- Projetos com tarefas, prioridade, prazo e status.
- Notificacoes para terceiros.
- Criacao de reunioes e atas.

Isso e util como inspiracao de orquestracao, mas nao deve entrar no escopo
principal do FinancasBot agora. E uma expansao lateral que pode destruir foco.

### Drive inteligente

- Envio de arquivos pelo WhatsApp.
- Organizacao automatica em pastas.
- Busca semantica por arquivos.

Para o FinancasBot, a parte que vale e limitada: guardar comprovantes financeiros,
associar comprovante ao lancamento e permitir busca/recuperacao. Nao vale criar um
gerenciador geral de arquivos agora.

### Preco e proposta

- Oferta observada: plano anual em 12 vezes de R$ 29,90.
- Promessas fortes de seguranca, LGPD, precisao de IA e suporte.

As promessas de precisao e seguranca devem ser tratadas como marketing ate serem
provadas por teste real. O FinancasBot deve competir por confiabilidade
auditavel, nao por promessa.

## Comparacao com o FinancasBot

### Eles parecem estar na frente em

- Open Finance.
- Escopo amplo de assistente pessoal.
- Onboarding comercial e promessa de valor.
- Dashboard/painel mais polido como produto.
- Conta compartilhada embalada como recurso central.
- Drive/arquivos, projetos e tarefas.

### O FinancasBot esta bem posicionado em

- Foco financeiro familiar profundo.
- Controle fino de escrita com `Interpretation Reliability`.
- Query Engine, SQL sandbox e ferramentas verificadas.
- LangGraph como runtime final de orquestracao read-only.
- Explicabilidade e verificacao antes da resposta.
- Calendar ja funcional e testado.
- Drive/Sheets como transparencia e portabilidade.

## O que vale incorporar

1. Open Finance como trilha de pesquisa e ADR, nao como implementacao imediata.
2. Conta familiar compartilhada como experiencia central, com Daniel/Thais e
   responsavel por lancamento.
3. Dashboard com linguagem executiva e perguntas de decisao.
4. Comprovantes financeiros como anexos vinculados ao lancamento.
5. Agenda financeira melhor apresentada: compromissos, contas, vencimentos,
   lembretes e resumo diario.
6. Exportacao e portabilidade como promessas claras.
7. Onboarding mais direto: "WhatsApp para rapidez, dashboard para profundidade".

## O que nao vale incorporar agora

- Virar assistente geral de projetos, tarefas, reunioes e Drive.
- Notificar terceiros ou clientes.
- Criar atas de reuniao.
- Automatizar arquivos genericos fora do contexto financeiro.
- Adotar Open Finance antes de ledger canonico, seguranca, consentimento,
  politica de dados e reconciliacao estarem prontos.
- Prometer precisao de IA sem medicao e auditoria.

## Decisao estrategica

O FinancasBot deve ser menor em escopo e mais profundo em confiabilidade.

O caminho vencedor nao e "fazer tudo que o Meu Assessor faz". E construir o melhor
assistente financeiro familiar conversacional:

1. entende conversa natural;
2. registra com seguranca;
3. concilia contas, cartoes, faturas, reserva e metas;
4. explica qualquer numero;
5. mostra um dashboard claro;
6. evolui para Open Finance somente quando o nucleo contabil estiver pronto.

## Impacto no roadmap

- Open Finance entra como fase de pesquisa/ADR antes de qualquer implementacao.
- Agenda/Calendar permanece como capacidade existente a lapidar.
- Drive entra somente como comprovantes financeiros, nao como gestor geral de
  documentos.
- Projetos/tarefas/reunioes ficam fora do roadmap financeiro atual.
- A prioridade segue sendo ledger canonico, contas, status, faturas, orcamento por
  categoria e dashboard v2.
