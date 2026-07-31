# Gate ativo - AUDIO-01 recuperacao do download de voz

Atualizado em: 2026-07-30

Base:
`abf411e0831d90bc9628f56021475c9e23816de9`.

## Estado

`EM IMPLEMENTACAO LOCAL`.

## Objetivo

Recuperar de falhas transitorias de `msg.downloadMedia()` em mensagens de voz
sem duplicar o processamento, expor conteudo privado ou transformar falha de
download em transcricao vazia.

## Escopo

- retentativa limitada de download;
- reacquisicao da mensagem pelo ID publico da biblioteca;
- habilitacao defensiva do auto-download de audio quando suportada;
- temporarios isolados e removidos;
- regressao causal para falha inicial seguida de sucesso e exaustao.

## Não escopo

- dashboard, Pluggy, saldos, alertas ou proposta de salvamento;
- mudanca de provedor de transcricao;
- mensagem de voz real, restart ou deploy OCI;
- alteracao de sessao WhatsApp.

## Invariantes

1. Cada mensagem produz no maximo uma transcricao.
2. Falha de download nao chama Gemini nem FFmpeg.
3. Logs nao contem audio, transcricao, ID de mensagem ou caminho privado.
4. Toda tentativa termina com limpeza dos temporarios pertencentes ao handler.
5. Exaustao responde de forma segura e nao envenena mensagens posteriores.

## Etapas

1. [concluido] Diagnosticar a fronteira da falha em producao.
2. [pendente] Escrever regressao RED para retry/reacquisicao.
3. [pendente] Implementar recuperacao minima.
4. [pendente] Executar testes focais e afetados.
5. [pendente] Publicar candidato sanitizado e auditar no Chat.

## Critérios de GO

- falha inicial e sucesso posterior retornam uma unica transcricao;
- exaustao nao chama transcricao;
- temporarios e privacidade permanecem verdes;
- entrada publica afetada continua processando o texto transcrito uma vez;
- auditoria independente sem lacuna indispensavel.

## Condições de parada

- necessidade de reiniciar ou alterar a sessao real;
- recuperacao exigir dependencia nao documentada da pagina WhatsApp;
- regressao de privacidade ou concorrencia;
- `NO-GO` independente.

## Próxima ação exata

Criar a prova RED de falha inicial de download seguida de reacquisicao e
sucesso.

## Capacidade

`Codex -> Sol -> Alto -> corrigir e auditar o gate AUDIO-01.`
