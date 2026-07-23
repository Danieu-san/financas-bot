# STATE-04 — candidato à auditoria independente

Data: 2026-07-23

Estado: `CANDIDATO LOCAL VERDE; AUDITORIA INDEPENDENTE PENDENTE`.

Base imutável:
`fd7146c3604fe41bb2ae44de695099254fb30aa4`.

## Escopo

Proteger o snapshot conversacional local sem depender de `umask`, listas
parciais de campos sensíveis ou retenção opcional.

O candidato:

- cifra todo o payload persistido em envelope autenticado AES-256-GCM;
- exige `STATE_STORE_ENCRYPTION_KEY` exclusiva de 32 bytes;
- cria o temporário em `0600`, reforça o modo antes do `rename` e preserva
  atomicidade;
- rejeita envelope legado, corrompido, adulterado ou aberto com chave errada;
- preserva byte a byte o último snapshot válido quando a substituição falha;
- aplica TTL de 24 horas por padrão, configurável até 30 dias, inclusive no
  restore;
- registra somente códigos constantes em falhas de persistência/restore;
- integra a prova causal ao pretest e ao runner hermético.

## Arquivos do gate

- `.env.example`;
- `index.js`;
- `package.json`;
- `scripts/runExhaustiveLocalTestCoverage.js`;
- `src/state/userStateManager.js`;
- `tests/userStateSnapshotSecurity.test.js`;
- `tests/unit.test.js`;
- `tests/financialStateMachine.test.js`;
- `tests/functional.test.js`;
- `tests/onboardingState.test.js`;
- `docs/agent-memory/current.md`;
- `docs/plans/current-gate.md`;
- este pacote.

## Evidência executada

- RED causal: `3/3`;
- teste dedicado final: `5/5`;
- bateria causal/afetada: `336/336`;
- runner hermético final: `1.229` testes, `1.224` aprovados, zero falhas, cinco
  funcionais intencionalmente desativados e rede externa bloqueada;
- cobertura ampla: linhas `89,72%`, branches `71,79%`, funções `89,56%`;
- sintaxe dos arquivos alterados e `git diff --check`: verdes;
- varredura dirigida encontrou somente fixtures sintéticas preexistentes.

Uma primeira execução ampla foi invalidada quando o SSD `E:` desmontou durante
o runner. Após remontagem, Node, junction e dependências foram confirmados; duas
execuções amplas consecutivas convergiram sem falhas (`1.228` e `1.229` testes).

## Limites e rollout

- nenhuma produção, Oracle, AWS, Google, WhatsApp ou dado real foi acessado;
- nenhum deploy, restart ou alteração de flag foi realizado;
- Redis/`STATE-03` permanece fora do escopo;
- o snapshot legado em plaintext é rejeitado; antes de deploy será necessário
  provisionar a chave dedicada e executar um procedimento deliberado de
  backup/migração ou descarte controlado;
- `0600` foi provado pela API chamada em Windows e deve ser confirmado no host
  Linux antes de qualquer promoção;
- o parecer externo é revisão estática e não reprodução dos testes.

## Pergunta de auditoria

Confirmar se o commit imutável:

1. impede plaintext privado no arquivo final e temporário, inclusive para
   chaves desconhecidas e estruturas aninhadas;
2. garante autenticação, falha fechada e restauração sem estado parcial;
3. preserva atomicidade e o último snapshot válido em falhas anteriores ao
   `rename`;
4. impõe retenção limitada sem reabrir estado expirado;
5. usa segredo exclusivo e observabilidade sanitizada;
6. possui testes causais suficientes sem enfraquecer as asserções;
7. pode receber `GO TÉCNICO LOCAL`, mantendo rollout Linux e snapshot legado
   como condições operacionais separadas e sem autorizar deploy.
