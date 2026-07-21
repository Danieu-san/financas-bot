# Pacote C-01 - gates antes de áudio e transcrição

## Estado

- Prioridade: `CRITICAL`.
- Base auditada: `0737d7ccbdd309e4c39f503ca781e89d5aac7bc3`.
- Autorização atual: `NO-GO` após revisão adversarial independente; correção
  dos temporários concorrentes pendente.
- Produto, flags, produção, WhatsApp e Gemini real permanecem congelados.

## Problema causal

`handleMessage()` chama `handleAudio()` antes de descartar `status/fromMe`,
resolver acesso/lifecycle, aplicar modo familiar e consumir o rate limit
genérico. `handleAudio()` baixa mídia, grava arquivo temporário, converte e envia
o conteúdo ao serviço de transcrição. Assim, uma mensagem que seria rejeitada
depois pode produzir custo e saída de dados antes da decisão de acesso.

Além disso, o texto transcrito substitui `msg.body` e pode alcançar handlers de
conteúdo anteriores ao security gate atual. A transcrição deve ser tratada como
entrada não confiável; ela não autoriza comando, consulta ou escrita.

## Objetivo

Garantir esta ordem para áudio:

```text
mensagem
-> descarte de status/fromMe
-> claim de deduplicação
-> identidade e lifecycle
-> comandos admin por áudio não executam e não consomem confirmação pendente
-> modo familiar
-> rate limit pré-transcrição
-> download/conversão/transcrição
-> security gate sobre o texto transcrito
-> roteamento normal autorizado
```

Nenhum download, arquivo temporário, resposta de processamento ou chamada de
transcrição pode ocorrer antes dos gates de identidade, lifecycle, escopo e
rate limit.

## Decisões travadas

1. Mensagem `status` ou `fromMe` é descartada antes de qualquer mídia.
2. A deduplicação deve ser reivindicada antes do primeiro `await` que possa
   processar áudio, evitando transcrição concorrente do mesmo message ID.
3. Usuário ausente, pendente, bloqueado, inativo, excluído, aguardando Google ou
   fora do modo familiar recebe somente o comportamento de acesso aplicável;
   seu áudio não é baixado nem transcrito.
4. Áudio autorizado consome o mesmo rate limit no máximo uma vez. Não criar
   dupla cobrança ao alcançar o ponto legado posterior.
5. O transcritor não decide intenção nem executa ferramenta. Seu texto é
   marcado conceitualmente como não confiável.
6. O security gate roda imediatamente após a transcrição e antes de dashboard,
   admin pós-acesso, importação, comandos financeiros, Query Engine ou escrita.
7. Um conteúdo inseguro em áudio pode precisar ser transcrito para ser
   identificado; após a transcrição, ele deve ser bloqueado sem outra chamada
   LLM, ferramenta ou mutação.
8. O `msg.body` bruto de `ptt/audio` não pode executar `admin...` nem
   `confirmar admin` antes da transcrição. Admin continua permitido somente por
   texto.
9. Mensagens de texto não devem sofrer mudança de ordem/semântica neste pacote,
   salvo helper compartilhado necessário para deduplicação segura.
10. Não adicionar flag que permita restaurar a ordem insegura.
11. Falha de áudio continua limpando temporários e não cria estado financeiro.

## Diferença observada entre áudio e texto

A observação de que o áudio parecia classificar melhor ainda possui base
estrutural no código, mas não prova superioridade inerente do canal. Depois da
transcrição, consultas e comandos locais comuns continuam disponíveis; porém,
para transações genéricas, o áudio não percorre os dois parsers locais nem o
planner de comandos usados pelo texto. Sem uma intenção local anterior, ele cai
no `MASTER_SCHEMA` do Gemini e a origem `llm` exige confirmação antes da escrita.

Isso pode produzir linguagem mais natural e classificação aparente melhor, ao
custo de duas chamadas Gemini e dependência do classificador legado. O C-01
preserva deliberadamente esse comportamento autorizado e sua confirmação. Ele
não tenta tornar o texto igual ao classificador legado nem unificar os canais
dentro de um hotfix de segurança.

A convergência correta, em pacote futuro, é tornar o pipeline de confiabilidade
independente da modalidade: texto ou transcrição entram como texto não
confiável, passam por extração determinística, Gemini somente para lacunas,
validação e mesma política de confirmação. Essa decisão não faz parte do gate
de saída do C-01.

## Arquivos prováveis

- `src/handlers/messageHandler.js`.
- `src/handlers/audioHandler.js` somente se for necessário tornar efeitos
  observáveis/injetáveis; não mover política de acesso para este handler.
- Novo teste focado, preferencialmente
  `tests/audioPreAccessGate.test.js`.
- `tests/financialStateMachine.test.js` apenas para regressões de áudio já
  existentes.
- Documentação e memória operacional após o gate.

## O que não pode mudar

- Contratos de onboarding e OAuth por texto.
- Permissões de admin ou modo familiar.
- Fluxos de escrita financeira, Query Engine e dashboard.
- Formato das planilhas, SQLite ou ledger canônico.
- Texto transcrito não pode aparecer em logs novos.
- Testes não podem chamar Gemini, WhatsApp, Google ou rede real.

## TDD obrigatório

### RED 1 - descarte básico

Provar que áudio com `isStatus=true` ou `fromMe=true` não chama download,
conversão, transcrição nem envia a resposta “processando”.

### RED 2 - lifecycle e escopo

Para usuário ausente e para cada status impeditivo material, provar que a
resolução de acesso ocorre e que nenhum efeito de áudio acontece. Cobrir também
negação do modo familiar.

### RED 3 - rate limit

Provar que áudio rate-limited não chama `handleAudio()` e que áudio permitido
consome a cota exatamente uma vez, mesmo ao continuar pelo roteamento normal.

### RED 4 - concorrência e replay

Entregar simultaneamente duas mensagens com o mesmo ID e provar uma única
transcrição. Reentrega posterior dentro do TTL também deve ser ignorada.

### RED 5 - texto transcrito inseguro

Usar transcrição sintética que tente acessar dado interno ou comando admin.
Provar bloqueio pelo security gate antes de qualquer handler analítico,
administrativo pós-acesso ou financeiro, com zero mutações.

### GREEN e regressão

Provar que áudio autorizado e seguro ainda percorre exatamente uma transcrição
e chega ao mesmo fluxo financeiro que o texto equivalente, sem chamada real.

### RED 6 - body bruto de áudio

Provar que `ptt/audio` cujo `msg.body` bruto seja `admin status bot` não executa
admin antes da transcrição, e que `msg.body` bruto `confirmar admin` não consome
confirmação pendente. A decisão deve se basear no texto transcrito autorizado,
não no corpo bruto do objeto de mídia.

## Critérios de aceite

- Zero efeito de áudio antes dos gates definidos.
- Zero transcrição para status/fromMe, acesso negado, escopo negado, rate limit
  ou duplicata.
- Uma transcrição por mensagem autorizada única.
- Conteúdo transcrito inseguro bloqueado antes de comando/ferramenta/escrita.
- Corpo bruto de áudio não executa admin nem confirmação pendente.
- Nenhuma dupla cobrança do rate limiter.
- Temporários removidos em sucesso e falha.
- Logs sanitizados e nenhuma transcrição financeira persistida.
- Testes focados verdes, `npm test` completo verde e `npm audit` sem
  vulnerabilidade alta/crítica.
- Runner exaustivo final verde, com snapshots restaurados e sem serviço real.

## Gate de saída

O pacote recebe `GO local` somente após TDD, revisão adversarial do diff e suíte
completa. Deploy continua `NO-GO` até commit sanitizado, revisão independente do
diff de produto, backup/rollback e smoke marker-free que não escreva dados
financeiros.

## Revisão adversarial independente — NO-GO — 2026-07-21

O Chat confirmou o HEAD documental
`30cb39e17e635712e75ad5198e7c4dccbf6f6e8d`, o diff de produto
`c6103234fa344a60d6cd8dae7a141281c396d6c6..f4c160649c2f97a48d20ad7d68dd1467ceee683f`
e a ausência de mudanças posteriores nos quatro arquivos centrais. A análise
foi estática e não reproduziu os testes registrados neste pacote.

Os contratos originais de `FLOW-01` e `STATE-02` foram aceitos localmente nos
limites documentados: os efeitos de áudio ficam depois dos gates, e o mesmo
message ID não é transcrito novamente na mesma instância durante o TTL.

O fechamento integral da C-01 recebeu `NO-GO` por um `MEDIUM` novo. Os arquivos
temporários `.ogg` e `.mp3` usam somente `Date.now()` no nome. Áudios distintos
que concluam o download no mesmo milissegundo podem compartilhar caminhos,
permitindo sobrescrita, remoção cruzada, falha ou transcrição associada ao áudio
errado. Os testes de limpeza atuais exercitam somente uma execução por vez.

O gate exige isolamento de temporários por execução e um teste concorrente
determinístico que force o mesmo timestamp. Deduplicação global/durável e o
fechamento geral de `PRIV-01` continuam resíduos separados e não devem ser
declarados resolvidos por este pacote.

## Fora do escopo

- `C-02/C-03` de OAuth e revogação.
- Exceções gerais fora do `try/catch` (`WCP-02`), salvo erro diretamente criado
  pela nova ordem.
- Reordenação global de todos os handlers de texto.
- Troca do provedor de transcrição ou adoção de ASR local.
- Correções analíticas, dashboard, read-model ou os demais caminhos de mídia
  anteriores ao rate limit agregados em `FLOW-02`.
