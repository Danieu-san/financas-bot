# Gate ativo — 9P.1 confirmação local de proposta Open Finance

Atualizado em: 2026-07-24

Base: `195ac58af68acdec87c0fb80617d0ddcf1d1de3b`.

## Estado

`GO TÉCNICO LOCAL`.

9P.0 encerrou a persistência shadow da proposta reconciliada. Esta fatia
implementa o destinatário autorizado e a confirmação durável de uso único sem
enviar mensagem e sem conceder escrita.

O primeiro candidato `434ecaafed4e20cbafc02dffd51c7710ef3b86fc` recebeu
`NO-GO` independente porque preservava o token cifrado após decisão e não
autenticava o estado mutável. A recuperação destrói o payload terminal,
autentica estado e marcos temporais por HMAC, injeta o relógio no restore e
prova a migração aditiva desde 9P.0.

A primeira recuperação `5fbeb378ea666ae854b3ae7bad0069bdb9f53a15` também
recebeu `NO-GO`, pois apagar o envelope completo ainda simulava estado inicial
e um backup válido anterior à decisão reabria `ready`. A segunda recuperação
autentica o estado inicial e registra terminais em journal monotônico externo ao
backup, reaplicado antes da exposição no restore.

A segunda recuperação foi publicada em
`3beef9309c5d8f857bc96a3de08965118fdb989b` e recebeu `NO-GO`
independente por um `MEDIUM`: o próprio journal ainda podia ser apagado,
truncado ou revertido para uma cópia válida anterior. A terceira recuperação
vincula o journal a uma âncora autenticada e separada, verificada antes de toda
operação. Ela foi publicada em
`a2c15b6dd7e52ef7aff8dc3ac4a4050e9adbc445` e recebeu `GO TÉCNICO LOCAL`
independente, sem achados `CRITICAL`, `HIGH` ou `MEDIUM`.

## Objetivo

Definir um contrato local e durável que transforme uma proposta pendente em
pergunta pronta para entrega e processe `sim/não` uma única vez, preservando
ator familiar, geração, expiração e idempotência.

## Escopo

- estados locais `pending`, `ready`, `accepted`, `declined` e `expired`;
- destinatário derivado da política familiar, sem inferência por titularidade;
- token/referência de confirmação de uso único: somente HMAC indexável e cópia
  cifrada persistem, com expiração e apagamento do material cifrado;
- `sim` e `não` vinculados à proposta e ao ator autorizado;
- replay idêntico sem reabrir estado terminal;
- resposta conflitante falhando fechada;
- zero envio, zero handler remoto e zero escrita financeira nesta fatia.

## Não escopo

- envio de “quer salvar?” ou ativação de handler WhatsApp;
- escrita em Sheets/ledger ou mudança de `OPEN_FINANCE_WRITE_MODE=off`;
- categorias, forma de pagamento, conta/cartão ou atribuição de pessoa;
- propostas de estorno, eventos `PENDING`, duplicados, incertos ou incompletos;
- produção, deploy, Pluggy/Google/WhatsApp reais.

## Contrato

1. proposta só fica pronta para o destinatário explicitamente resolvido;
2. confirmação sem referência, expirada ou de terceiro falha fechada;
3. `sim` repetido é replay do mesmo resultado; `não` depois de `sim`, ou o
   inverso, é conflito;
4. nenhuma confirmação desta fatia chama Google, ledger ou transporte;
5. revogação e retenção invalidam também a confirmação;
6. restart preserva estado e uso único;
7. retorno e logs expõem apenas referências e estados sanitizados;
8. `financial_writes=0` em todos os caminhos.
9. perda, truncamento ou rollback unilateral do journal ou de sua âncora falha
   fechado antes de ingest, restore, replay ou nova decisão.

## Critérios de GO

- RED causal e prova verde dedicados;
- testes de estado, autorização, restart, replay, conflito, revogação e
  expiração verdes;
- gate exaustivo e controles estáticos verdes;
- commit sanitizado publicado por hash imutável;
- auditoria independente no Chat sem achado bloqueante.

## Evidência de entrada

- 9P.0: `GO TÉCNICO LOCAL` no hash `195ac58`;
- gate exaustivo anterior: `1.269/1.274`, zero falhas e cinco skips previstos;
- nenhum banco persistente criado pelo candidato v1 será reutilizado;
- produção, rede, Google e WhatsApp reais permanecem fora do gate.

## Condições de parada

- necessidade de expor a pergunta antes do fluxo local confirmável;
- qualquer escrita com modo `off`;
- payload privado em claro;
- replay que reabra proposta terminal ou estenda retenção;
- revogação que preserve proposta da geração revogada;
- necessidade de produção ou integração real.

## Próxima ação exata

Publicar o fechamento documental de 9P.1 e substituir este plano por um gate
local de entrega/captura WhatsApp da proposta já reconciliada. A nova fatia deve
manter `OPEN_FINANCE_WRITE_MODE=off`, não acessar produção e não conceder escrita
financeira.

## Capacidade

`Codex → Sol → Alto → materializar a entrega e captura local da proposta sem escrita.`
