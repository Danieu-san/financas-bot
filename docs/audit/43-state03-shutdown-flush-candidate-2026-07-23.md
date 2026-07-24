# STATE-03 — candidato de fechamento do estado

Atualizado em: 2026-07-23

Base: `7f619a0b0b15734a836b3288c281d21f5a270290`.

## Estado

`CANDIDATO LOCAL; COMMIT IMUTÁVEL E AUDITORIA INDEPENDENTE PENDENTES`.

## Decisão causal

O achado original apontava que o caminho Redis disparava `flush` e `quit` sem
aguardar sua conclusão. STATE-04 posteriormente passou a aceitar somente
`STATE_STORE_DRIVER=file`; Redis ficou inalcançável e falha fechado antes de
qualquer efeito.

Este candidato não reintroduz uma arquitetura Redis sem necessidade
operacional. Ele:

- remove o cliente, restore, fallback, flush e fechamento Redis legados;
- remove da configuração de exemplo as duas variáveis sem consumidor;
- mantém `redis` como driver inválido antes de qualquer leitura ou escrita;
- torna `closeStateStore()` aguardável e idempotente;
- faz `SIGINT` e `SIGTERM` solicitarem saída somente depois do fechamento;
- encerra com código não zero e mensagem sanitizada se o flush falhar;
- atualiza os três consumidores de teste para aguardar o fechamento.

O backend de arquivo continua usando o envelope, journal, retenção, `fsync` e
permissões aprovados em STATE-04.

## Evidência executada

- RED causal antes da implementação: `0/4`, com as quatro condições ausentes;
- prova causal após a implementação: `4/4`;
- estado protegido + onboarding: `26/26`;
- máquina financeira: `121/121`;
- funcional: cinco skips previstos, zero falha;
- recorte `userStateManager` de unit: `4/4`;
- contrato de ambiente: `5/5`;
- gate local exaustivo: `1.265` testes, `1.260` aprovados, zero falhas, cinco
  skips previstos e zero TODO;
- cobertura exaustiva: linhas `89,92%`, branches `71,98%`, funções `89,71%`;
- sintaxe dos cinco arquivos JavaScript alterados, `git diff --check` e workflow:
  verdes.

## Limites

- nenhum Redis, snapshot, Google, WhatsApp, Pluggy/Open Finance ou dado real foi
  acessado;
- nenhuma rede externa, produção, Oracle, AWS, flag, restart ou mensagem foi
  usada;
- não há autorização de deploy;
- uma eventual reintrodução de Redis exigirá gate arquitetural próprio, incluindo
  prontidão, restore, confidencialidade, replay e shutdown.

## Pergunta de auditoria

Confirmar se o candidato:

1. fecha STATE-03 por eliminação integral do backend Redis sem suporte;
2. conclui o último flush do único backend aceito antes da saída;
3. é idempotente sob sinais repetidos;
4. falha com código não zero e observabilidade sanitizada;
5. preserva os controles de STATE-04 e não cria mudança lateral bloqueante.
