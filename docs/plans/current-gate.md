# Gate ativo — 9P.1 confirmação local de proposta Open Finance

Atualizado em: 2026-07-24

Base: `195ac58af68acdec87c0fb80617d0ddcf1d1de3b`.

## Estado

`CANDIDATO LOCAL VERDE; AUDITORIA INDEPENDENTE PENDENTE`.

9P.0 encerrou a persistência shadow da proposta reconciliada. Esta fatia
implementa o destinatário autorizado e a confirmação durável de uso único sem
enviar mensagem e sem conceder escrita.

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

Criar e publicar o commit sanitizado do candidato, pedir auditoria independente
por hash imutável e confrontar o parecer com a evidência local.

## Capacidade

`Codex → Sol → Alto → implementar o contrato local 9P.1 sem produção.`
