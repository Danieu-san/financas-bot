# 9P.1 — segunda recuperação com journal terminal monotônico

Atualizado em: 2026-07-24

Segundo candidato auditado:
`5fbeb378ea666ae854b3ae7bad0069bdb9f53a15`.

## Estado

`RECUPERAÇÃO LOCAL VERDE; COMMIT IMUTÁVEL E REAUDITORIA PENDENTES`.

Esta recuperação fecha os dois caminhos de reabertura apontados na segunda
auditoria sem expor interface remota e sem executar escrita financeira.

## Desenho

- toda proposta nasce com o estado inicial autenticado; apagar o envelope e o
  MAC não volta a ser um estado inicial válido;
- decisões e cancelamentos 9P.1 são registrados primeiro em journal monotônico
  separado do pacote de backup;
- o journal persiste apenas referências HMAC, estado e marcos sanitizados, com
  MAC próprio e conflito fail-closed;
- perda do update no preview após gravar o journal é recuperável: a próxima
  operação reaplica o terminal autoritativo;
- restore reaplica revogações e depois terminais antes de retenção ou exposição;
- ingest não recria uma proposta cujo terminal já existe no journal;
- payload e versão devem existir somente em `ready`; estados terminais exigem
  ambos nulos;
- autoria e horário do cancelamento entram no MAC do estado;
- cancelamento 9P.0 sem confirmação preserva compatibilidade; qualquer
  confirmação 9P.1 exige o journal;
- a migração aditiva foi exercitada com uma linha 9P.0 preexistente.

## Provas adversariais

- envelope terminal inteiro apagado: a preparação não emite novo token e
  restaura `accepted` pelo journal;
- backup `ready`, decisão posterior e restore do backup antigo: o restore
  reaplica `accepted` antes da leitura e o token antigo é apenas replay;
- alteração do terminal para recolocar ciphertext falha na invariável;
- alteração de `resolved_at` de cancelamento falha no MAC;
- conflito ou adulteração no journal terminal falha fechado;
- duas instâncias continuam convergindo pela decisão monotônica.

## Evidência local

- confirmação dedicada: `8/8`;
- journal, confirmação e backup: `17/17`;
- conjunto causal ampliado: `41/41`;
- todos os testes Open Finance: `226/226`;
- runner exaustivo hermético: `1.283` testes, `1.278` aprovados, zero falhas,
  cinco skips funcionais previstos e zero TODO;
- cobertura: linhas `90,02%`, branches `72,20%`, funções `89,85%`;
- bloqueio de rede ativo para fetch, HTTP(S), sockets, processos Node
  descendentes e subprocessos não Node.

Nenhuma execução usou produção, Google, WhatsApp ou Pluggy reais.

## Limites

- o journal operacional continua sendo o estado monotônico externo ao pacote
  v3, assim como já ocorre com revogações;
- não há pergunta WhatsApp, parser de resposta ou consumo por Sheets/ledger;
- `OPEN_FINANCE_WRITE_MODE` permanece desligado;
- esta fatia não autoriza deploy.

## Perguntas para a reauditoria

1. O estado inicial autenticado e o journal terminal impedem a reabertura por
   apagamento coordenado sem exigir conhecimento da chave?
2. A reaplicação do journal antes da exposição fecha rollback de backup
   `ready → terminal → restore`?
3. As invariantes de payload terminal e autoria do cancelamento resolvem os
   dois achados `LOW`?
4. Resta algum achado `CRITICAL`, `HIGH` ou `MEDIUM` no contrato técnico local
   9P.1, considerando o bot familiar privado, uma instância e ausência de
   handler ou escrita nesta fatia?
