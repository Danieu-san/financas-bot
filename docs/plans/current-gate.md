# Gate ativo — PROD-ACT-01 ativação funcional Open Finance

Atualizado em: 2026-07-31

## Estado

`GO TÉCNICO LOCAL; CONTROLADOR INSTALADO; ATIVAÇÃO REAL PENDENTE`.

## Objetivo

Promover de forma controlada a experiência proativa de salvamento para o casal,
sem transformar alerta em escrita automática e sem habilitar flags antes de
prova operacional, auditoria independente e rollback explícito.

## Escopo

- inventário das flags vigentes e da política de ativação;
- sequência reversível `shadow/prompt` antes de `confirm`;
- prova real de segunda confirmação, escrita única e recibo;
- rollback imediato para `OPEN_FINANCE_WRITE_MODE=off`;
- auditoria independente do plano e da evidência antes do GO funcional.

## Não escopo

- escrita automática ao detectar movimentação;
- aceitar correspondência ou ambiguidade como item novo;
- ampliar o produto além do casal autorizado;
- usar AWS como destino ou rollback;
- ativar escrita sem Daniel disponível para o smoke controlado.

## Incidente

O controlador auditado no commit
`bae6454ba5ab1cc109ce608e41cb0b849b6266af` está ativo na OCI por artefato
imutável, com WhatsApp `ready/healthy`, zero reinício e sem rollback. As flags
funcionais foram preservadas: alerta, reconciliação e preview em `canary`;
proposta e escrita em `off`; aprovação falsa.

## Invariantes

1. Detecção e alerta nunca escrevem automaticamente.
2. Somente evento `new`, revalidado, pode originar proposta.
3. O primeiro cônjuge autorizado que confirmar reserva a operação.
4. A segunda confirmação explícita é obrigatória antes da escrita.
5. Operation key e recibo impedem duplicação em retry/restart.
6. Falha ou incerteza permanece fail-closed e reconciliável.
7. Rollback de flags remove imediatamente a capacidade de escrita.
8. AWS não participa de deploy ou rollback.

## Evidência

- fechamento técnico local de 9P.4:
  `docs/audit/66-open-finance-finalization-independent-close-2026-07-30.md`;
- composição fail-closed:
  `docs/audit/78-open-finance-write-activation-independent-close-2026-07-30.md`;
- fanout familiar:
  `docs/audit/92-open-finance-family-alerts-independent-close-2026-07-30.md`;
- release OCI vigente:
  `docs/audit/99-oci-whatsapp-readiness-window-independent-production-close-2026-07-31.md`.
- controlador candidato:
  `docs/audit/100-open-finance-production-activation-controller-candidate-2026-07-31.md`;
- testes focais do controlador: `12/12`;
- controlador mais instalador OCI: `35/35`;
- o primeiro parecer independente do hash
  `b56fd6a930057788f0afe24ea93fee09aaf621bc` foi `NO-GO`: exigiu sincronizar
  no pai a criação de `data/backups` e tornar causalmente observável
  `backup → alteração` e `restauração → restart`;
- o recovery implementa exatamente essas duas exigências;
- a segunda reauditoria confirmou o fechamento das duas exigências e encontrou
  a borda `rename` aplicado seguido de falha no fsync; o recovery marca a
  substituição no instante do rename, restaura também nesse caso e mantém o
  restart seguro mesmo se o fsync do rollback falhar;
- a terceira auditoria independente do hash
  `bae6454ba5ab1cc109ce608e41cb0b849b6266af` emitiu `GO TÉCNICO LOCAL`, sem
  lacuna residual;
- fechamento e produção:
  `docs/audit/101-open-finance-activation-controller-independent-production-close-2026-07-31.md`;
- bateria causal afetada: `92/92` antes do reforço final somente probatório.

## Critérios de GO

- plano de ativação identifica todos os estados e rollback;
- flags parciais continuam com zero escrita;
- smoke real prova pergunta, revisão, segunda confirmação, escrita única e
  recibo sem dados de teste residuais;
- replay/restart não duplica;
- health, WhatsApp, Sheets, ledger e dashboard permanecem coerentes;
- evidência recebe auditoria independente antes do GO funcional.

## Condições de parada

- Daniel indisponível para confirmar e conferir o lançamento real;
- identidade do servidor/processo divergente;
- qualquer escrita antes da segunda confirmação;
- falha de health, recibo, reconciliação ou rollback;
- `NO-GO` independente.

## Próxima ação exata

Quando Daniel estiver presente, executar o plano `prompt`, ativar somente a
proposta e realizar o smoke real no WhatsApp. A etapa `confirm` continua
bloqueada até essa validação.

## Capacidade

`Codex -> Sol -> Alto -> ativar prompt e executar o smoke real com Daniel presente.`
