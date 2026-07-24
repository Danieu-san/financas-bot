# 9P.1 — recuperação pós-NO-GO da confirmação local

Atualizado em: 2026-07-24

Primeiro candidato auditado:
`434ecaafed4e20cbafc02dffd51c7710ef3b86fc`.

## Estado

`NO-GO INDEPENDENTE; SUBSTITUÍDO PELA SEGUNDA RECUPERAÇÃO`.

O primeiro candidato recebeu `NO-GO` independente por dois achados `MEDIUM` e
dois `LOW`. Esta recuperação trata os quatro pontos sem enviar mensagens, sem
instalar handler remoto e sem conceder escrita financeira.

## Resultado da reauditoria

O candidato foi publicado em
`5fbeb378ea666ae854b3ae7bad0069bdb9f53a15`. O Chat confirmou o SHA, o parent
`434ecaafed4e20cbafc02dffd51c7710ef3b86fc` e a leitura integral dos oito
arquivos antes de emitir `NO-GO`.

Os dois bloqueadores `MEDIUM` foram:

1. apagar coordenadamente todo o envelope de confirmação ainda fazia uma
   decisão terminal parecer uma proposta nunca preparada;
2. restaurar um backup válido anterior à decisão reabria o estado `ready`,
   porque o MAC autenticava o conteúdo, mas não sua atualidade.

Os dois achados `LOW` foram a ausência de invariante verificável para payload
terminal nulo e a falta de autenticação de `resolved_by_ref`/`resolved_at`.

A segunda recuperação está em
`docs/audit/51-open-finance-save-proposal-terminal-journal-recovery-candidate-2026-07-24.md`.

## Correções

- `accepted`, `declined` e `expired` não preservam o token cifrado nem sua
  versão de payload;
- replay terminal retorna somente estado, proposta e `financial_writes: 0`;
- HMAC autentica a referência, o ator, o estado da proposta, o estado da
  confirmação e seus marcos temporais;
- adulteração de `ready`, `accepted`, `declined`, `expired` ou dos metadados
  vinculados falha antes de replay, decisão ou estatística;
- updates continuam condicionados e falham fechados diante de corrida;
- o restore aceita relógio injetado, sem depender da data real de execução;
- uma prova cria diretamente o esquema vazio de 9P.0 e valida a migração
  aditiva antes de preparar a primeira confirmação.

Cancelamento após uma decisão preserva o estado histórico da decisão, mas
autentica a mudança da proposta para `cancelled` e mantém o material cifrado
destruído. Isso não autoriza escrita nem reabre consumo.

## Evidência causal

Antes da implementação, os quatro testes de recuperação falharam:

1. adulteração de estado não era rejeitada;
2. replay terminal ainda devolvia o token;
3. a migração ainda não possuía o MAC de estado;
4. o restore ignorava o relógio injetado e purgava dados pelo relógio real.

Depois da correção:

- confirmação, proposta e backup focados: `22/22`;
- conjunto causal ampliado: `39/39`;
- todos os testes Open Finance: `224/224`;
- runner exaustivo hermético: `1.282` testes, `1.277` aprovados, zero falhas,
  cinco skips funcionais previstos e zero TODO;
- cobertura: linhas `90,01%`, branches `72,15%`, funções `89,82%`;
- bloqueio de rede ativo para fetch, HTTP(S), sockets, processos Node
  descendentes e subprocessos não Node;
- sintaxe dos quatro arquivos alterados e `git diff --check`: verdes.

Nenhuma execução usou produção, Google, WhatsApp ou Pluggy reais.

## Arquivos de produto e teste da recuperação

- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/openFinance/openFinanceStateBackup.js`;
- `tests/openFinanceSaveProposalConfirmation.test.js`;
- `tests/openFinanceStateBackup.test.js`.

## Limites preservados

- nenhuma pergunta “quer salvar?” é enviada;
- nenhum `sim/não` remoto é interpretado;
- nenhuma aceitação chama Sheets, ledger ou Google;
- `OPEN_FINANCE_WRITE_MODE` continua desligado;
- nenhuma configuração ou banco de produção foi acessado.

## Perguntas para a reauditoria

1. A destruição do payload terminal resolve integralmente a retenção do token?
2. O MAC de estado impede que alteração local reabra uma decisão consumida ou
   transforme a decisão oposta em replay válido?
3. O relógio injetado e a migração adversarial removem os dois achados `LOW`?
4. Resta algum achado `CRITICAL`, `HIGH` ou `MEDIUM` que bloqueie o GO técnico
   local, considerando o bot familiar privado de duas pessoas, uma instância
   ativa e nenhuma interface remota nesta fatia?
