# AUDIO-01 - candidato de recuperação do download de voz

Data: 2026-07-30

Base:
`935e620aff4f0fdfaedd7504db8666bd6bc3101b`.

## Sintoma e causa isolada

Em produção, as tentativas observadas chegaram a `[audio] download_started` e
falharam antes de `[audio] temp_file_created`. Portanto, a fronteira causal é
`msg.downloadMedia()`, anterior a FFmpeg e Gemini. Nenhum dado de áudio real,
ID de mensagem ou conteúdo privado integra este candidato.

## Implementação

`src/handlers/audioHandler.js`:

- limita o download a três tentativas;
- depois da primeira falha, solicita `setAutoDownloadAudio(true)` somente quando
  essa API existe;
- reobtém a mensagem com `client.getMessageById()` antes da tentativa seguinte;
- mantém o mesmo caminho único de conversão e transcrição após um download
  válido;
- registra somente códigos opacos e o número da tentativa;
- falha fechado sem chamar FFmpeg ou Gemini quando o download se esgota.

## Provas locais

RED anterior:

- `node --test --test-concurrency=1 tests/audioHandlerPrivacy.test.js`
- resultado: `5` verdes e `2` falhas pela ausência de
  `downloadAudioMedia`.

GREEN focal:

- `node --test --test-concurrency=1 tests/audioHandlerPrivacy.test.js tests/geminiAudioTranscription.test.js`
- resultado: `10/10`.

Entrada pública:

- `node --test --test-concurrency=1 --test-name-pattern="audio" tests/financialStateMachine.test.js`
- resultado: `11/11`.

Sintaxe:

- `node --check src/handlers/audioHandler.js`
- `node --check tests/audioHandlerPrivacy.test.js`

## Invariantes verificadas

1. Uma falha transitória seguida de sucesso produz um único retorno de mídia.
2. A exaustão não inicia conversão nem transcrição.
3. Logs de retry não contêm erro bruto nem ID de mensagem.
4. Temporários continuam isolados e removidos.
5. A entrada pública mantém deduplicação anterior à transcrição e consome o
   rate limit uma única vez.

## Alcance

O candidato é somente local. Não houve restart, alteração de sessão, mensagem
real, deploy ou mudança em produção. O gate continua aguardando commit
imutável, publicação e auditoria independente no Chat.
