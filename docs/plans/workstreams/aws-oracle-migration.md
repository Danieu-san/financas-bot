# Plano do workstream — migração AWS para Oracle

Status: migração concluída; contrato permanente de release em OPS-03.

## Objetivo

Manter a produção Oracle/OCI com release imutável, preservação de estado,
checksums e rollback local, sem reintroduzir checkout Git ou caminhos AWS.

## Estado concluído

- Oracle é a produção vigente;
- PM2, Caddy, domínio, health, WhatsApp, Google e read-model foram validados;
- AWS deixou de ser o destino operacional;
- referências privadas de acesso permanecem fora do Git;
- o checkout Git remoto foi retirado do contrato de deploy.

## Gate derivado OPS-03

- construir o pacote a partir de hash completo;
- proibir segredos e estado;
- validar checksum externo e manifesto interno;
- preparar slot sem tocar no processo ativo;
- promover explicitamente e reverter ao script OCI capturado;
- manter AWS desligada.

## Não autorizado por este stub

SSH, upload, deploy, restart, DNS, rotação de segredo, remoção de infraestrutura
ou promoção Oracle sem autorização específica.

## Invariantes mínimas

1. Produção vigente é Oracle/OCI; confirmar novamente antes de ação remota.
2. Não copiar segredos para Git, Chat, logs ou checkpoint.
3. Preservar rollback até validação factual do Oracle.
4. Não permitir escrita concorrente não reconciliada entre servidores.
5. Validar saúde, persistência e integrações antes de alterar tráfego.

## Próximo passo

Fechar OPS-03 por auditoria independente. Depois, qualquer deploy deve seguir
`docs/runbooks/release-checklist.md`.
