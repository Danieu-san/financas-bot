# Gate ativo — 9P.0 propostas Open Finance em shadow

Atualizado em: 2026-07-23

Base: `f8d124f785f89479642fbf4847a9f4c3860a268d`.

## Estado

`RECOVERY PÓS-NO-GO VALIDADO LOCALMENTE; COMMIT IMUTÁVEL E REAUDITORIA
PENDENTES`.

A reconciliação read-only já separa `matched`, `new`, `possible_duplicate` e
`uncertain` antes do outbox. Esta fatia cria a fundação durável da proposta de
salvamento, sem mudar a mensagem enviada e sem habilitar escrita.

## Objetivo

Persistir em shadow somente compras `POSTED`, realmente novas e reconciliadas,
com referência estável, payload cifrado, escopo familiar autorizado, retenção,
replay fechado e revogação monotônica.

## Escopo

- modo `OPEN_FINANCE_SAVE_PROPOSAL_MODE=off|shadow`, com `off` padrão;
- tabela de propostas no preview privado já incluído no backup v3;
- operação idempotente por observação, alias e geração;
- autorização por WhatsApp familiar para leitura/cancelamento local;
- expiração sem extensão por replay;
- revogação e restore apagando propostas da geração revogada;
- integração shadow no runtime após reconciliação e antes do outbox;
- zero mudança de mensagem, transporte ou escrita financeira.

## Não escopo

- `canary`, pergunta “quer salvar?”, comando remoto ou resposta `sim/não`;
- escrita em Sheets/ledger ou mudança de `OPEN_FINANCE_WRITE_MODE=off`;
- categorias, forma de pagamento, conta/cartão ou atribuição de pessoa;
- propostas de estorno, eventos `PENDING`, duplicados, incertos ou incompletos;
- produção, deploy, Pluggy/Google/WhatsApp reais.

## Contrato

1. modo ausente não cria banco nem proposta;
2. `canary`, `on` ou valor desconhecido falha antes do polling;
3. shadow exige reconciliação e preview em `canary`;
4. somente `new + purchase + POSTED` entra no store;
5. replay não duplica, não reabre cancelamento e não amplia `expires_at`;
   replay idêntico é no-op e divergência causal falha fechada;
6. payload privado fica cifrado e só pode ser lido por ator familiar autorizado;
7. revogação e retenção removem o material cifrado;
8. o backup/restore v3 preserva a nova tabela e reaplica as mesmas proteções;
9. mensagens continuam informando somente leitura e `financial_writes=0`.

## Critérios de GO

- RED causal e prova verde dedicados;
- testes de runtime, preview, revogação, reconciliação e backup verdes;
- gate exaustivo e controles estáticos verdes;
- commit sanitizado publicado por hash imutável;
- auditoria independente no Chat sem achado bloqueante.

## Evidência local atual

- candidato anterior: `NO-GO` estático no hash `826807a`;
- recovery causal, operacional e backup: `16/16`;
- bateria diretamente afetada: `32/32`;
- regressões Open Finance adicionais: blocos `41/41`, `26/26`, `4/4` e
  `113/113`, parcialmente sobrepostos;
- gate exaustivo: `1.269/1.274`, zero falhas, cinco skips previstos e zero TODO;
- cobertura: linhas `89,99%`, branches `72,04%`, funções `89,75%`;
- sintaxe, diff e workflow: verdes;
- reauditoria: pendente;
- produção, rede, Google e WhatsApp reais não acessados.

## Condições de parada

- necessidade de expor a pergunta antes do fluxo confirmável;
- qualquer escrita com modo `off`;
- payload privado em claro;
- replay que reabra proposta terminal ou estenda retenção;
- revogação que preserve proposta da geração revogada;
- necessidade de produção ou integração real.

## Próxima ação exata

Publicar o recovery imutável e solicitar reauditoria independente no Chat.

## Capacidade

`Codex → Sol → Alto → validar e auditar o gate 9P.0 sem produção.`
