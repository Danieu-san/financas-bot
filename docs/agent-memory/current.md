# Estado atual portatil do FinancasBot

Atualizado em: 2026-08-10

## Objetivo ativo

Fechar o Gate 40, que corrige a interpretacao e o salvamento proativo de compras
de cartao na fatura aberta do Pluggy.

## Estado vigente

- Gate 39 permanece promovido e ativado na OCI no hash
  `38aa275d5928ffe350215727f158e962ff78a999`;
- o smoke real revelou que compras correntes de cartao chegam como `PENDING` e
  eram impedidas de gerar proposta numerada;
- a documentacao oficial do Pluggy confirma que `PENDING` em cartao inclui
  transacoes da fatura aberta e parcelas futuras; `POSTED` aparece quando a
  fatura fecha ou vence;
- o candidato do Gate 40 diferencia compra corrente nao parcelada de parcela
  futura, preserva o estado bruto, admite somente `PENDING -> POSTED` do mesmo
  lancamento e usa um unico marco de transporte da proposta;
- RED causal convertido em verde no runtime real e na revalidacao final;
- bateria causal `90/90`, backup/restore afetado `4/4` e suite hermetica ampla
  `1632/1622/0/10` estao verdes;
- auditoria independente no hash
  `421270f98a3a6c5eccee21af39557cfecabb04ac`: `GO TECNICO LOCAL`, zero
  achados e nenhuma lacuna tecnica indispensavel;
- o preflight posterior encontrou `ip-address@10.2.0` vulneravel na cadeia
  transitiva do Puppeteer; o lockfile foi atualizado minimamente para `10.5.0`;
- instalacao limpa, smoke da cadeia proxy/SOCKS, `npm audit` zerado e suite
  hermetica ampla `1632/1622/0/10` passaram apos a atualizacao;
- reauditoria independente do hash
  `30e23da19db67af601ddec713876966899f3334f`: `GO TECNICO LOCAL`; delta
  minimo e fechamento dos tres avisos confirmados;
- nenhum deploy do Gate 40 foi executado.

## Git e workspace

- worktree: `C:\Users\Administrador\AppData\Local\Temp\financas-bot-phasea-8972205`;
- branch: `codex/open-finance-numeric-save-release`;
- commit de partida: `f0d94d1eff341335e1a2077396018ac6239f72c1`;
- preservar arvores alheias ou sujas.

## Producao conhecida

- provedor vigente: Oracle/OCI; AWS nao participa;
- release vigente: `38aa275d5928ffe350215727f158e962ff78a999`;
- flags: proposta `prompt`, escrita `confirm`, aprovacao verdadeira;
- Gate 40 ainda nao esta em producao.

## Próxima ação exata

Construir o artefato do hash auditado e, apos recuperar o acesso SSH OCI,
executar prepare, plan, promote e health conforme o runbook.

## Capacidade para retomar

`Codex -> Sol -> Alto -> construir o artefato auditado e promover o Gate 40 na OCI.`

## Referencias dirigidas

- gate ativo: `docs/plans/current-gate.md`;
- Gate 39 em producao: `docs/audit/219-open-finance-reviewed-write-release-production-activation-2026-08-10.md`;
- Gate 40 auditado: `docs/audit/221-open-finance-open-invoice-purchase-independent-close-2026-08-10.md`;
- saneamento de dependencia: `docs/audit/222-gate40-ip-address-security-preflight-candidate-2026-08-10.md`;
- reauditoria do saneamento: `docs/audit/223-gate40-ip-address-security-independent-close-2026-08-10.md`;
- elegibilidade: `src/openFinance/openFinancePurchaseProposalEligibility.js`;
- finalizacao: `src/openFinance/openFinanceSaveProposalFinalization.js`;
- deploy: `docs/runbooks/release-checklist.md`;
- producao: `docs/runbooks/production-health.md`.
