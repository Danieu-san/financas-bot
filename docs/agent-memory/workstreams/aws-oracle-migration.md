# Estado — migração AWS para Oracle

Atualizado em: 2026-07-30

## Responsabilidade

Registrar o estado operacional consolidado da migração e impedir o reuso de
procedimentos AWS em releases futuras.

## Objetivo conhecido

Manter o FinancasBot na Oracle/OCI e publicar evoluções somente pelo contrato de
artefato imutável.

## Estado conhecido neste checkpoint

- migração AWS→Oracle concluída com GO técnico e funcional;
- produção vigente: Oracle/OCI, Ubuntu, raiz
  `/home/ubuntu/financas-bot`, PM2 `financas-bot` e Caddy;
- domínio público e sessão WhatsApp operam na Oracle;
- a AWS não é destino de deploy nem rollback comum e não pode executar a mesma
  sessão simultaneamente;
- o runtime OCI foi materializado por artefato e não possui checkout Git
  aprovado;
- OPS-03 implementa builder, checksum, manifesto, slots, preflight, promoção e
  rollback por artefato;
- nenhuma ação remota faz parte do gate local OPS-03.

## Próxima ação obrigatória

Encerrar OPS-03 por testes locais, commit sanitizado e auditoria independente.
Deploy real continua dependendo de autorização específica e do checklist de
release.

## Capacidade

`Codex → Sol → Alto → validar e auditar o release OCI por artefato.`
