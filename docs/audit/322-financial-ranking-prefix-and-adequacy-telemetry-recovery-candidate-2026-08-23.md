# ARQ-06 — prefixo verificável de ranking e motivo sanitizado de adequação

Data: 2026-08-23

## Estado

`RECOVERY CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

O canário de produção permanece `off`. Este candidato não autoriza ativação,
writer, remoção do baseline vigente ou novo smoke antes de `GO TÉCNICO LOCAL`.

## Evidência operacional anterior

O recovery 321 recebeu `GO TÉCNICO LOCAL` e foi promovido na OCI pelo artefato
imutável do hash `132d56a344394bdae83e5851df018b8df3b8dda5`, inicialmente com o
canário desligado. Na ativação estrita para o casal, `expenses` e
`personal_sheet`, a pergunta real familiar executou a primeira leitura exata e
produziu uma resposta candidata, mas a adequação a rejeitou. O baseline foi
preservado, nenhum writer foi habilitado e o canário foi revertido
imediatamente para `off`; processo, WhatsApp, SQLite e health permaneceram
saudáveis.

Uma inspeção read-only e sem conteúdo financeiro confirmou que o ranking real
continha 12 itens. A revisão estática mostrou que o verificador exigia a
presença dos dez primeiros rótulos, enquanto uma resposta natural resumida aos
primeiros colocados era rejeitada mesmo sem trocar a ordem.

## Recovery

Para `operation=rank`, o verificador aceita somente um prefixo não vazio,
contínuo e iniciado no primeiro colocado. Omissão do primeiro item, salto de um
item para citar posição posterior e reordenação continuam falhando com
`wrong_result_order`. As operações `trend` e `group` preservam o contrato
anterior de lista completa e ordenada.

O prompt do compositor agora exige a mesma regra de prefixo, proíbe saltos e
proíbe totais, percentuais ou contagens que não estejam na evidência. A
verificação numérica anterior continua sendo aplicada depois dessa instrução.

A telemetria passa a registrar apenas o primeiro código técnico de inadequação.
O campo aceita exclusivamente identificador `snake_case` limitado; texto livre,
identidade ou conteúdo anexado viram `unknown`. Mensagem, resposta, valores,
payload, usuário e planilha continuam ausentes do JSONL e do log operacional.

Identidade, owner, família, planilha, fonte, plano, limite de três leituras,
efeitos laterais, writers e rollback não foram alterados.

## Evidência local

- RED: prefixo correto era rejeitado, o prompt não declarava o contrato e a
  telemetria não carregava o código de inadequação;
- GREEN: prefixo iniciado no primeiro colocado é aceito;
- controles negativos: primeiro item ausente, salto intermediário e ordem
  invertida são rejeitados;
- controle de regressão: tendência continua exigindo todos os itens em ordem;
- controle de privacidade: código válido é preservado, mas texto misturado com
  marcador privado vira `unknown`;
- bateria causal: `146/146`, zero falha;
- suíte hermética ampla única: `1.816/1.826`, zero falha e dez skips previstos;
- cobertura: linhas `91,75%`, branches `74,73%`, funções `91,21%`;
- runner amplo local, com rede e subprocessos externos bloqueados;
- contrato de ambiente e workflow versionado: verdes.

As contagens são execução local relatada, não execução do auditor.

## Arquivos causais para auditoria

- este documento;
- `src/agent/resultVerifier.js`;
- `src/agent/financialIterativeReasoner.js`;
- `src/agent/financialIterativeCanary.js`;
- `src/agent/financialIterativeCanaryTelemetry.js`;
- `src/handlers/messageHandler.js`;
- `tests/financialAgent.test.js`;
- `tests/financialIterativeCanary.test.js`;
- `tests/financialIterativeCanaryTelemetry.test.js`.

## Critério de GO

O auditor deve confirmar que um ranking só aceita prefixo contínuo iniciado no
primeiro item, que saltos e reordenação permanecem bloqueados, que tendência e
grupo não foram relaxados, que valores inventados continuam sujeitos ao
verificador numérico e que o novo motivo operacional não pode transportar
conteúdo livre ou identidade.

Com `GO TÉCNICO LOCAL`, fica autorizado apenas construir e promover novo
artefato OCI com canário `off`. A ativação estrita, uma pergunta base, o
follow-up familiar, a telemetria terminal e o health continuam sendo gate
operacional separado com rollback imediato.
