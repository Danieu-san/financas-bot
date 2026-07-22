# Plano do workstream — migração AWS para Oracle

Status: requer reconciliação pela conversa responsável.

## Objetivo

Migrar o FinancasBot de AWS para Oracle com continuidade, rollback e nenhum uso
acidental de credenciais ou caminhos obsoletos.

## Escopo ainda a confirmar

- inventário da origem AWS e do destino Oracle;
- dados/estado persistente, processo, rede, DNS/TLS, secrets e observabilidade;
- estratégia de sincronização, cutover, validação e rollback;
- atualização dos runbooks e do destino oficial de deploy.

## Não autorizado por este stub

SSH, criação/remoção de infraestrutura, deploy, cópia de dados, DNS, restart,
troca de segredo, desligamento AWS ou promoção Oracle.

## Invariantes mínimas

1. Descobrir o destino vigente; nunca inferi-lo do histórico.
2. Não copiar segredos para Git, Chat, logs ou checkpoint.
3. Preservar rollback até validação factual do Oracle.
4. Não permitir escrita concorrente não reconciliada entre servidores.
5. Validar saúde, persistência e integrações antes de alterar tráfego.

## Próximo passo

A conversa responsável deve substituir este stub por plano factual baseado no
estado já executado, mantendo o workstream separado do WGL.
