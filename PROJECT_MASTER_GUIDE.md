# 🧠 Habit Tracker AI — Project Master Guide

Versão: 1.3
Status: Base finalizada
Objetivo atual: Consolidar a versão inicial antes de iniciar melhorias da versão seguinte

---

# 📌 REGRA PRINCIPAL DO PROJETO

A ordem oficial do projeto é:

1. Finalizar e estabilizar a base inicial.
2. Validar tudo em uso real.
3. Só depois iniciar a próxima versão.
4. Ideias novas só entram se fizerem sentido com o projeto e com a fase seguinte.

Nada novo deve ser implementado antes da base estar concluída e estável.

---

# 🧱 BLOCO A — SISTEMA BASE (PLANO ORIGINAL)

Este bloco registra apenas o que fazia parte do plano inicial.

## 🔐 Autenticação

- Login com JWT
- Rotas protegidas
- Sessão persistente no navegador

Usuário consegue:

- criar conta
- fazer login
- manter sessão

## 📋 Sistema de Hábitos

Usuário pode:

- criar hábito
- definir frequência
- registrar execução
- acompanhar progresso

Campos principais:

- title
- description
- frequency_type
- target_value

## 🎯 Sistema de Metas

Usuário pode:

- criar metas
- definir valor objetivo
- atualizar progresso
- visualizar percentual

Cálculo base:

```text
(current_value / target_value) * 100
```

## 🔗 Relação Meta ↔ Hábito

Tabela:

- goal_habits

O sistema permite:

- selecionar hábitos ao criar meta
- visualizar hábitos ligados
- relacionar progresso com comportamento

Esse é um dos núcleos do projeto.

## 📊 Progresso Visual

O sistema exibe:

- percentual de progresso
- barra visual
- atualização manual de valores

## 🧠 Sistema de IA

Arquivo principal:

- src/services/geminiService.js

Fluxo:

1. Verifica cache diário
2. Coleta dados
3. Monta prompt
4. Chama Gemini
5. Valida JSON
6. Salva resultado

Saída esperada:

```json
{
  "insights": "...",
  "warnings": [],
  "recommendations": []
}
```

## 📱 PWA (APP MOBILE)

Arquivos:

- manifest.json
- service-worker.js

Permite:

- instalar no celular
- rodar como app
- abrir em tela cheia

## 📊 STATUS REAL DA BASE

- Autenticação: ✔
- Hábitos: ✔
- Logs: ✔
- Metas: ✔
- Relação Meta-Hábito: ✔
- IA: ✔
- Dashboard: ✔
- PWA: ✔

Status geral:

- BASE FUNCIONAL
- BASE CONCLUÍDA

---

# 🧱 BLOCO B — PRÓXIMA VERSÃO (MELHORIAS LOGO APÓS A BASE)

Este bloco reúne melhorias que fazem sentido para a próxima versão, desde que a base esteja consolidada.

## 📊 Melhorias de Finanças que fazem sentido para este projeto

Esses itens entram como próximos passos naturais porque dialogam com organização de vida, hábitos e metas:

- lançamento de entradas e saídas
- categorias financeiras
- resumo mensal automático
- alertas de excesso de gastos
- ligação entre finanças e metas
- insights da IA sobre comportamento financeiro

### Prioridade sugerida dentro das finanças

1. Registro de entradas e saídas.
2. Categorias financeiras.
3. Resumo mensal e visão consolidada.
4. Alertas de desequilíbrio financeiro.
5. Conexão entre finanças e metas.
6. Insights financeiros da IA.

## 📈 Melhorias de acompanhamento que fazem sentido depois da base

- relatórios semanais
- relatórios mensais
- notificações automáticas
- alertas de falha em hábitos ou metas
- melhorias na análise da IA com base em padrões reais

---

# 🎥 BLOCO C — IDEIAS EXTRAÍDAS DOS VÍDEOS

Essas ideias foram registradas como referência estratégica, mas ainda não devem ser implementadas enquanto a base não estiver encerrada e a próxima versão não estiver definida.

## Do vídeo 1 (app principal)

Detectado:

- radar de vida
- streak (dias invictos)
- sistema financeiro mais visual
- gamificação
- missões

## Do vídeo 2 (concorrente)

Detectado:

- tarefas diárias
- planejamento do dia
- prioridades
- execução diária

## Interpretação estratégica

A direção futura mais forte combina:

- planejamento
- execução
- organização de vida integrada

---

# 🔄 BLOCO D — REFERÊNCIAS EXTERNAS — FINANCEBOT

O FinanceBot foi analisado como referência de arquitetura e organização, principalmente em IA, cache, rate limiting e estrutura de respostas.

## Padrões úteis observados

- separação entre serviço de IA, classificação de intenção e geração de resposta
- cache em memória com TTL
- retry e timeout para chamadas de IA
- logging de performance e falhas
- rate limiting por usuário
- utilitários separados para organização do código
- scheduler / jobs em background

## O que pode fazer diferença na evolução do projeto

Essas ideias só devem entrar se fizerem sentido com a proposta do app:

- cache curto para respostas repetidas da IA
- rate limit por usuário para evitar abuso
- separação de camadas da IA em módulos pequenos
- logging de lentidão e falhas da IA
- rotinas automáticas em background para gerar alertas ou resumos

## O que não entra agora

- lógica financeira específica do FinanceBot
- classificador de intenção voltado apenas para consultas de gastos
- fluxos que desviem o app da proposta principal

---

# 🧭 ORDEM OFICIAL DE EXECUÇÃO

## Etapa 1 — Estabilização da base

Agora estamos aqui.

Objetivo:

- testar tudo
- corrigir bugs
- validar uso real
- consolidar a base

## Etapa 2 — Próxima versão

Só depois da base fechada:

- melhorias financeiras relevantes
- relatórios
- alertas
- inteligência incremental

## Etapa 3 — Expansões maiores

Somente após a próxima versão estabilizar:

- tarefas diárias
- radar de vida
- streak system
- automações maiores

---

# 📅 HISTÓRICO

## Versão 1.0

- base inicial criada
- hábitos
- metas
- IA
- dashboard
- PWA

## Versão 1.1

- análise de vídeos adicionada
- roadmap futuro definido

## Versão 1.2

- separação entre base, expansão e referências externas
- correção de direção do projeto

## Versão 1.3

- reforço da ordem: finalizar base antes da próxima versão
- inclusão de melhorias financeiras relevantes para a fase seguinte
- inclusão de referências úteis do FinanceBot

---

# 📌 REGRA FINAL

Se algo novo surgir:

- não implementar de imediato
- registrar no local correto do guia
- decidir depois se faz sentido para a próxima versão
