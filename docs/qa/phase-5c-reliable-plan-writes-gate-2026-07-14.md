# Gate da Fase 5C - movimentos de plano com escrita confiavel

Data: 2026-07-14

## Veredito final

`GO de producao` para o canario shadow da 5C.

O deploy manteve a allowlist em um unico usuario e o E2E automatico marker-only
terminou com limpeza zero. A Fase 5C esta encerrada e a 5D esta autorizada.

## Escopo entregue

- aporte, retirada e ajuste de meta;
- pausa, retomada, conclusao e cancelamento de meta;
- pagamento de divida pelo planner e pelo fluxo legado;
- confirmacao de meta, tipo/status, valor e saldo antes da escrita;
- recibo duravel com estados `prepared`, `legacy_committed` e
  `shadow_committed`;
- chaves filhas estaveis para cada update/append no Google;
- plano versionado, movimento realizado e snapshot atualizados em uma unica
  transacao SQLite depois do commit legado;
- rollout `off|shadow` com allowlist exata por `user_id`;
- E2E real automatizado com fixture e cleanup marker-only.

## Semantica de consistencia

Sheets permanece a autoridade de escrita legivel durante a Fase 5. O recibo e
gravado antes de tocar o legado e conserva o payload original. Assim, uma
falha entre o update da meta e o append em `Movimentacoes Metas` pode ser
repetida com as mesmas chaves sem duplicar linhas.

A projecao nova so e persistida depois que todas as escritas legadas foram
confirmadas. Se o legado foi confirmado e somente o shadow falhou, a operacao
retorna sucesso legado com `shadowPending=true`; o recibo permanece
`legacy_committed` para reconciliacao segura. O bot nao responde que nada foi
salvo e nao incentiva o usuario a gerar uma segunda operacao.

## Invariantes comprovados

- a mesma chave gera no maximo um movimento de plano;
- reinicio preserva recibo, identidade, versao e replay;
- payload diferente com a mesma chave e recusado;
- movimento de plano nao chama nem cria `Entradas` ou `Saidas`;
- cancelamento antes da confirmacao executa zero escrita;
- saldo de meta nao pode ficar negativo;
- pagamento nao pode ser zero, negativo ou superar a divida;
- usuario fora da allowlist permanece integralmente no legado;
- modo ausente ou invalido falha fechado em `off`;
- backups do schema 1 continuam restauraveis no schema 2.

## Evidencia automatizada local

- gate especifico 5C: `8/8`;
- store, backup e recibos: `14/14`;
- suite completa final: `845/845`;
- `npm audit --audit-level=high`: `0` vulnerabilidades;
- sintaxe dos modulos e runner E2E: verde;
- `git diff --check`: verde;
- nenhum segredo, telefone, `user_id` real, documento Google ou valor
  financeiro real foi impresso.

## E2E remoto automatico

Comando versionado:

```bash
npm run plans:writes-e2e
```

O runner exige `PROJECTED_PLAN_E2E_USER_LOOKUP`, resolve exatamente um usuario
`ACTIVE` e exige que a politica 5C permita esse `user_id`. Ele:

1. cria uma meta e uma divida com marcador `TESTE_APAGAR_...`;
2. grava aporte, status de meta e pagamento de divida;
3. repete as mesmas operacoes e comprova replay;
4. confirma dois planos e tres movimentos no shadow;
5. confirma zero linha marcada em `Entradas` e `Saidas`;
6. remove apenas linhas com o marcador exato;
7. verifica cleanup zero e apaga o SQLite temporario isolado.

## Flags e rollback

- padrao: `PROJECTED_PLAN_WRITES_MODE=off`;
- canario: `PROJECTED_PLAN_WRITES_MODE=shadow`;
- allowlist: `PROJECTED_PLAN_WRITES_USER_IDS=<user_id exato>`;
- banco normal: `PROJECTED_PLANS_DB_PATH` ou
  `data/projected-plans-identity.sqlite`;
- o runner E2E substitui o caminho por um arquivo temporario e nunca apaga o
  banco normal.

O canario pode ser configurado sem imprimir o identificador interno:

```bash
PROJECTED_PLAN_E2E_USER_LOOKUP=Daniel npm run plans:writes-canary
```

O utilitario exige exatamente um usuario `ACTIVE`, altera somente modo e
allowlist, preserva permissao `0600` da `.env` e informa apenas a contagem de
usuarios configurados. Para rollback:

```bash
PROJECTED_PLAN_CANARY_ACTION=disable npm run plans:writes-canary
```

Rollback operacional: definir `PROJECTED_PLAN_WRITES_MODE=off` e reiniciar o
PM2 com `--update-env`. Isso devolve imediatamente metas e dividas aos fluxos
legados. Nao apagar o SQLite: recibos e projecoes existentes sao evidencia de
auditoria. Rollback de codigo usa `git revert`, nunca `git reset --hard`.

## Evidencia de deploy

- commit principal: `14a1f6b`;
- hotfix do parser localizado do verificador: `4771d79`;
- `HEAD` final da EC2:
  `4771d79d9f0bac2ee2521faa45f6b9b852b2106a`;
- backup final da configuracao:
  `.env.pre-5c-4771d79-20260714T041934Z`;
- backup final do store:
  `data/projected-plans-identity.pre-5c-4771d79-20260714T041934Z.sqlite`;
- dependencias atualizadas e auditadas com zero vulnerabilidades;
- store/recibos remotos `14/14` e maquina de estados 5C `2/2`;
- PM2 online, Google autorizado, Sheets sincronizada, read-model pronto,
  integridade `user_id` verde, dashboard ativo, WhatsApp pronto e health
  `{"ok":true,"sqlite":true}`;
- um unico admin, acesso amplo desligado, modo `shadow` e allowlist com um
  usuario;
- schema normal em versao 2 e tabela de recibos presente.

## Primeiro E2E remoto - NO-GO do verificador

As escritas e o cleanup foram executados, mas a assercao do saldo da meta usou
`Number(...)`. A API do Google retornou o decimal no formato localizado com
virgula, portanto o verificador recusou um valor valido. O rollback automatico
colocou a flag em `off` e reiniciou o bot; health recuperou normalmente.

O hotfix `4771d79` usa `parseValue` e compara centavos inteiros tanto para meta
quanto para divida. Nenhuma regra de negocio ou escrita produtiva mudou.

## E2E remoto final - GO

Marcador: `TESTE_APAGAR_PLAN_WRITES_20260714_0421`.

Resultado sanitizado:

- `plans=2`;
- `movements=3`;
- aporte, status de meta e pagamento de divida projetados;
- replay sem nova linha;
- zero linha marcada em `Entradas` e `Saidas`;
- `cleanup=zero`;
- `privacy=true`;
- zero artefato SQLite temporario no postflight;
- zero recibo de teste no banco normal;
- health permaneceu saudavel e o canario continuou em `shadow` para um
  usuario.

Decisao final: `GO de producao`, encerramento da 5C e abertura autorizada da
5D - Gate de saida da Fase 5.
