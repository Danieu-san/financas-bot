# 9P.1 — candidato de confirmação local de proposta Open Finance

Atualizado em: 2026-07-24

Base de produto:
`195ac58af68acdec87c0fb80617d0ddcf1d1de3b`.

Fechamento documental anterior:
`bcdbf0e8772270019e9223e6a996f5102eb446bd`.

## Estado

`CANDIDATO LOCAL VERDE; COMMIT IMUTÁVEL E AUDITORIA INDEPENDENTE PENDENTES`.

Esta fatia não envia a pergunta ao WhatsApp, não instala handler remoto, não
chama Google/ledger e não concede elegibilidade de escrita.

## Contrato implementado

- principal `daniel` ou `thais` é ligado a um WhatsApp explicitamente
  configurado e já presente na allowlist familiar;
- proposta `pending` pode gerar uma única confirmação `ready`;
- a referência entregue ao futuro fluxo é um token aleatório opaco de 192 bits;
- no SQLite persistem apenas o HMAC indexável e uma cópia cifrada/autenticada
  do token, vinculada à proposta, família, ator, criação e expiração;
- replay de preparação preserva token e prazo através de restart;
- `accept` e `decline` usam update condicional, são idempotentes para a mesma
  decisão e conflitantes entre si;
- terceiro, referência ausente/inválida, metadado adulterado, proposta
  cancelada, confirmação expirada ou geração revogada falham fechados;
- expiração e cancelamento apagam o token cifrado; revogação e retenção removem
  a proposta inteira;
- backup/restore v3 preserva a confirmação pronta sem expor o token em claro;
- todos os retornos permanecem sanitizados e declaram `financial_writes: 0`.

`proposal_state` continua representando a vida da proposta financeira
(`pending` ou `cancelled`). `confirmation_state` representa separadamente
`pending`, `ready`, `accepted`, `declined` ou `expired`. Uma aceitação nesta
fatia ainda não executa nem autoriza uma escrita.

## Evidência local

- RED causal inicial: `0/5`, por ausência deliberada dos métodos;
- prova dedicada final: `6/6`;
- bateria focada final de store/proposta/backup: `20/20`;
- bateria completa Open Finance: `222/222`, zero falhas, skips ou TODO;
- gate exaustivo hermético: `1.280` testes, `1.275` aprovados, zero falhas,
  cinco skips funcionais previstos e zero TODO;
- cobertura: linhas `90,00%`, branches `72,11%`, funções `89,80%`;
- bloqueio de rede do runner: ativo para fetch, HTTP(S), sockets, processos Node
  descendentes e subprocessos não Node;
- sintaxe, `git diff --check`, workflow portátil e varredura de padrões de
  segredo: verdes.

Nenhuma execução usou produção, Google, WhatsApp ou Pluggy reais.

## Arquivos do candidato

- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `tests/openFinanceSaveProposalConfirmation.test.js`;
- `tests/openFinanceStateBackup.test.js`;
- `docs/agent-memory/current.md`;
- `docs/plans/current-gate.md`;
- este documento.

## Limites deliberados

- não há pergunta “quer salvar?” nem entrega WhatsApp;
- não há parser de `sim/não`;
- não há consumo da aceitação por Sheets ou ledger;
- `OPEN_FINANCE_WRITE_MODE` permanece desligado;
- o teste de duas conexões é sequencial e não simula duas instâncias de
  produção concorrendo em tempo real; o update condicional continua
  fail-closed e o bot familiar opera em uma única instância.

## Perguntas para a auditoria

1. O vínculo explícito entre principal e ator impede que outro membro consuma a
   confirmação sem impor isolamento incompatível com o escopo familiar?
2. HMAC indexável mais payload AES-GCM vinculado fecha replay, adulteração e
   vazamento do token em repouso?
3. Os updates condicionais e estados terminais fecham resposta repetida,
   contraditória, atrasada, expirada, cancelada e revogada?
4. Backup/restore e migração aditiva preservam compatibilidade com o banco de
   9P.0 sem reabrir payload v1 não autorizado?
5. Há algum achado `CRITICAL`, `HIGH` ou `MEDIUM` que bloqueie o GO técnico
   local deste contrato, considerando o bot familiar privado de duas pessoas,
   uma instância ativa e nenhuma interface remota nesta fatia?
