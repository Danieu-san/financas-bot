# ARQ-06 — candidato de observabilidade do canário iterativo

Data: 2026-08-22

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Este documento não autoriza ativar o canário, consumir OpenRouter, enviar uma
resposta nova, escrever dados financeiros, retirar o legado nem alterar a
produção.

## Objetivo causal

Tornar observável toda tentativa realmente elegível do canário read-only antes
de expor uma resposta promovida. Se a evidência operacional não puder ser
persistida, a promoção falha fechada e o usuário recebe o baseline vigente.

## Implementação

- a fronteira pública reavalia modo, usuário, domínio e fonte por configuração
  server-side, sem confiar no resultado devolvido pelo reasoner;
- somente tentativas elegíveis são registradas; modo desligado e itens fora das
  allowlists não geram linha nem chamada externa;
- cada tentativa elegível termina em `promoted` ou `fallback` e é persistida em
  JSONL antes de uma possível exposição da resposta candidata;
- falha do canário registra `fallback`; falha de persistência bloqueia a
  promoção e preserva o baseline;
- promoção exige resposta adequada e contadores numéricos explícitos de
  mensagens e escritas exatamente iguais a zero. Campo ausente, textual ou
  desconhecido não equivale a zero;
- domínio, fonte e disponibilidade do baseline gravados vêm da decisão
  server-side, e não de campos retornados pelo modelo;
- o registro contém somente timestamp, versão de esquema, domínio, classe de
  fonte, resultado, motivo, contagem limitada de leituras, ação, adequação e
  booleanos operacionais;
- não são persistidos usuário, telefone, mensagem, descrição, valor, payload,
  planilha, conta, cartão ou resposta;
- o relatório local agrega total, linhas inválidas e contagens por domínio,
  fonte, resultado e motivo, com limite temporal validado;
- o caminho da telemetria é documentado e permanece sob `data/`, fora do Git.

## Invariantes preservados

- o modo padrão continua `off`;
- o legado permanece disponível e é o fallback integral;
- o catálogo continua estritamente read-only e sem writer;
- a allowlist continua exigindo exatamente o casal autorizado;
- nenhum segredo foi versionado;
- a integração do `origin/main` vigente foi concluída antes do candidato;
- nenhuma chamada real a OpenRouter, Google, WhatsApp ou produção ocorreu.

## Evidência local

- testes do canário na última execução focal completa: `16/16` verdes;
- testes específicos da telemetria após o recovery: `3/3` verdes;
- bateria causal ARQ-02/03/04/agente: `119/119` verdes;
- aceitação financeira: `265/265`, zero gap, 23 bloqueios de segurança, 238
  respostas verificadas e zero chamada Gemini;
- contrato de ambiente: zero variável não documentada e zero acesso dinâmico
  não aprovado;
- suíte hermética ampla final: `1.807/1.817` aprovados, zero falha e dez skips
  previstos;
- cobertura ampla final: linhas `91,70%`, branches `74,59%`, funções `91,17%`;
- rede bloqueada pela suíte ampla e WhatsApp real explicitamente excluído.

As contagens acima são evidência local relatada pelo candidato, não execução do
auditor independente.

## Arquivos causais

- `.env.example`;
- `package.json`;
- `src/agent/financialIterativeCanary.js`;
- `src/agent/financialIterativeCanaryTelemetry.js`;
- `src/handlers/messageHandler.js`;
- `scripts/reportFinancialIterativeCanary.js`;
- `tests/financialIterativeCanary.test.js`;
- `tests/financialIterativeCanaryTelemetry.test.js`.

## Critério de GO técnico local

O parecer independente deve confirmar que:

1. toda tentativa elegível observável termina em `promoted` ou `fallback`;
2. a evidência é persistida antes da promoção e falha de persistência bloqueia
   a resposta candidata;
3. elegibilidade, domínio, fonte e baseline são determinados server-side;
4. ausência ou tipo incorreto dos contadores de side effect falha fechado;
5. telemetria e logs não carregam identidade, texto ou dado financeiro;
6. o relatório não transforma período inválido em resultado aparentemente
   válido;
7. o modo desligado, o baseline, o legado, o catálogo read-only e o rollback
   do ARQ-05 permanecem intactos.

Com GO fica autorizado apenas fechar tecnicamente o ARQ-06 e preparar um
artefato OCI com o canário ainda desligado. Ativação real exige segredo válido
armazenado fora do Git, release imutável, saúde verde e rollback ensaiado.
