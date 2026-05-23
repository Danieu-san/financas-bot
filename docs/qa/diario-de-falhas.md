# Diario de Falhas Inteligente

O FinancasBot registra automaticamente pedidos que precisam de revisao humana para melhorar intents, calculos e respostas sem depender de memoria solta da equipe.

## Arquivo

Por padrao, os eventos ficam em:

```text
data/qa-failures.jsonl
```

Esse arquivo fica fora do Git porque pode conter perguntas reais de usuarios. Cada linha e um JSON independente.

## Quando Registra

- `unknown_intent`: o bot nao entendeu o pedido.
- `command_missing_details`: o usuario pediu algo, mas faltaram dados obrigatorios.
- `question_needs_review`: pergunta financeira caiu em intent generica e foi respondida pela IA.
- `analysis_fallback`: o read-model/SQLite falhou e o bot precisou cair para fallback.
- `question_error`: erro ao processar uma pergunta financeira.

## Privacidade

O registro tenta preservar contexto suficiente para corrigir o bot, mas reduz exposicao:

- `user_id` e WhatsApp ID viram hashes curtos.
- Telefones, CPF, emails, tokens e parametros sensiveis de URL sao redigidos.
- Textos longos sao truncados.

Mesmo assim, trate o arquivo como dado sensivel de suporte. Nao envie para GitHub, prints publicos ou terceiros.

## Como Usar

1. Revisar os eventos abertos.
2. Transformar cada erro relevante em um teste.
3. Criar ou ajustar intent/operacao deterministica.
4. Rodar a suite.
5. Marcar internamente como corrigido, preservando o caso para regressao.

## Configuracao

Variaveis opcionais:

```text
QA_FAILURE_LOG_ENABLED=false
QA_FAILURE_LOG_PATH=/caminho/customizado/qa-failures.jsonl
```

Por padrao, o log fica ativo.
