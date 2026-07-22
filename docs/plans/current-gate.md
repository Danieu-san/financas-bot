# Próximo gate — STATE-01

Atualizado em: 2026-07-22

Commit de partida efetivo: `083be71580292ff09d11ffb2d4c0b7b99a065bf3`.

## Estado anterior

`FLOW-03` recebeu `GO TÉCNICO LOCAL` independente no commit imutável
`4c1001338ca1ed919b55be4e9566258178a0175e`. O Chat confirmou o hash, leu os
quatro arquivos exigidos e não encontrou achado bloqueante ou lacuna causal
indispensável. Evidência local: scheduler `23/23`, bateria afetada `279/279` e
runner principal do `npm test` `1.068/1.068`, além dos pretests verdes.

## Próximo objetivo já ordenado

Tratar `STATE-01`, item 8 do relatório exaustivo: mensagens do mesmo remetente
podem avançar concorrentemente a máquina de estado e disputar os mesmos efeitos.

## Objetivo

Definir e implementar serialização causal por remetente, preservando paralelismo
entre remetentes diferentes, deduplicação e recuperação segura após falhas.

## Escopo

- mapear entrypoints, máquina de estado, confirmações e writers afetados;
- corrigir somente os caminhos causais de `STATE-01`;
- adicionar testes adversariais com duas mensagens simultâneas do mesmo remetente;
- preservar a ordem da fila da auditoria.

## Não escopo

- deploy, EC2/Oracle, Google/WhatsApp real ou mudança de flags;
- implementação do fluxo Pluggy de proposição de salvamento;
- `FLOW-04`, outbox do scheduler, logs globais e snapshot;
- remoção ampla de legado, dashboard/admin ou expansão multiusuário.

Antes de implementar:

1. mapear cada job, leitura, writer e resolução de planilha afetados;
2. definir os invariantes causais e os testes adversariais do gate;
3. preservar fora do escopo deploy, EC2/Oracle e serviços reais;
4. consultar novamente ADR-002 e o checklist se o mapa tocar dashboard, admin,
   permissões ou expansão multiusuário.

## Trava antes do mapeamento

`STATE-01` é concorrência crítica sobre estado e efeitos financeiros. O nível
mínimo suficiente é `Extra Alto`; nenhuma inspeção ou alteração material desse
gate deve começar enquanto o Codex permanecer em `Alto`.

Os invariantes, riscos, testes causais e critérios de GO serão fixados somente
depois do mapeamento no nível correto. O fechamento continuará exigindo commit
sanitizado no GitHub e auditoria independente obrigatória no Chat.

## Mapeamento causal concluído

- `index.js` entrega o mesmo `handleMessage` exportado tanto ao listener ao vivo
  quanto ao backfill; portanto a fronteira única correta é a entrada pública do
  handler, antes da deduplicação, da resolução de acesso e da leitura de estado;
- `EventEmitter` não aguarda a promessa retornada pelo listener, permitindo que
  duas mensagens distintas do mesmo remetente avancem em paralelo;
- `userStateManager` protege a persistência de cada operação isolada, mas não
  torna atômica a sequência ler estado, aguardar I/O, produzir efeito e mudar ou
  excluir estado;
- chaves de operação e deduplicação por `messageId` não resolvem a disputa entre
  duas mensagens distintas; cada confirmação pode ter identidade própria;
- não existe chamada recursiva do `handleMessage` que exija reentrância da fila.

## Invariantes do gate

1. Duas execuções do handler para o mesmo remetente nunca se sobrepõem e
   observam a ordem em que entraram no handler público.
2. Remetentes distintos continuam podendo executar em paralelo; não haverá fila
   global.
3. A deduplicação permanece dentro da fronteira serializada e uma reentrega do
   mesmo `messageId` continua sem repetir transcrição ou efeito.
4. Rejeição inesperada de uma mensagem não envenena a fila: a próxima operação
   do mesmo remetente ainda executa.
5. A cauda de um remetente é removida quando a última operação termina, evitando
   crescimento permanente por remetentes inativos.
6. Nenhuma chave de operação, transição de estado ou contrato de writer muda.

## Riscos e limites aceitos

- uma operação lenta segura mensagens posteriores do mesmo remetente; isso é o
  custo intencional da ordem causal, sem bloquear outros remetentes;
- a ordem garantida é a ordem de invocação local, não uma reordenação retroativa
  por timestamp entre mensagem ao vivo e mensagem antiga descoberta no backfill;
- a fila é por processo. Coordenação entre múltiplas instâncias simultâneas do
  bot e drenagem especial no shutdown ficam fora do achado causal `STATE-01`.

## Provas planejadas

1. RED no handler público: duas mensagens distintas do mesmo remetente entram
   juntas e a segunda não alcança a região assíncrona enquanto a primeira está
   ativa.
2. Duas confirmações concorrentes não podem consumir o mesmo estado nem produzir
   dois efeitos.
3. Remetentes distintos alcançam a região assíncrona simultaneamente.
4. Uma operação rejeitada libera a seguinte do mesmo remetente.
5. Regressão existente de `messageId` duplicado continua verde.

## Critérios de GO

- RED causal reproduzido antes da implementação e verde depois dela;
- testes focais e baterias afetadas verdes;
- um único runner amplo verde, sem repetição sem causa;
- diff sanitizado, commit imutável publicado e auditoria independente obrigatória
  no Chat sem achado bloqueante ou lacuna causal indispensável.

## Evidência local obtida

- RED causal reproduzido: sobreposição `2 != 1` para o mesmo remetente e duas
  gravações `2 != 1` para confirmações simultâneas; controle entre remetentes
  distintos verde;
- provas focais finais: `5/5`;
- bateria afetada final: `124/124`;
- `npm test` final: pretests verdes e runner principal `1.073/1.073`, sem falha,
  skip ou cancelamento;
- sintaxe e `git diff --check`: verdes;
- estado: candidato local aguardando commit imutável e auditoria obrigatória no
  Chat; ainda sem `GO`.

## Auditoria externa pendente

O candidato foi publicado em
`facf53d8f605165375e35cc0ae6f95491c7f849f`. A tentativa automática única no
Chat não conseguiu ler integralmente as URLs imutáveis e foi interrompida após
entrar em busca sem progresso. Não houve bloqueio de segurança nem veredito.
`STATE-01` permanece sem `GO` até Daniel trazer a resposta da auditoria manual.

## Condições de parada

- necessidade de reduzir ou trocar capacidade;
- ampliação de escopo ou mudança da ordem já decidida;
- acesso a produção, cofre, EC2/Oracle, Google ou WhatsApp real;
- conflito com alterações concorrentes do workstream AWS/Oracle.

## Capacidade

`Codex → Sol → Extra Alto → mapear e corrigir STATE-01 sem deploy.`
