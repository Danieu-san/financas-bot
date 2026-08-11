# Estado atual portatil do FinancasBot

Atualizado em: 2026-08-11

## Objetivo ativo

Observar o primeiro ciclo natural posterior ao deploy do Gate 40 e confirmar,
sem fabricar transacao, a proposta numerada de uma compra corrente elegivel.

## Estado vigente

- Gate 40 foi promovido na OCI no hash auditado
  `30e23da19db67af601ddec713876966899f3334f`;
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
- o artefato de 894 arquivos foi verificado, preparado sem alterar producao e
  promovido sem rollback ou bootstrap de estado;
- PM2 ficou com um processo online no script do novo hash, zero reinicios e
  health local/publico `ok/sqlite/whatsapp`, com WhatsApp `ready/healthy`;
- `.env` e `state_store.json` conservaram os checksums anteriores; as flags
  continuaram `prompt/confirm/true` e o acesso admin global continuou desligado;
- o primeiro ciclo Open Finance apos o restart falhou fechado em `NO_GO`, com
  `writes=0`; o mesmo marcador ja existia antes do deploy, portanto nao prova
  regressao do Gate 40, mas impede declarar smoke funcional concluido;
- a regra SSH temporaria `/32` foi removida e a porta 22 voltou a expirar;
- o RX historico recebeu `GO PROSPECTIVO/OPERACIONAL` desde o baseline atual
  zero das Caixinhas. A serie historica ausente nao foi reconstruida e continua
  explicitamente fora desse GO.

## Git e workspace

- worktree: `C:\Users\Administrador\AppData\Local\Temp\financas-bot-phasea-8972205`;
- branch: `codex/open-finance-numeric-save-release`;
- commit de partida: `f0d94d1eff341335e1a2077396018ac6239f72c1`;
- preservar arvores alheias ou sujas.

## Producao conhecida

- provedor vigente: Oracle/OCI; AWS nao participa;
- release vigente: `30e23da19db67af601ddec713876966899f3334f`;
- flags: proposta `prompt`, escrita `confirm`, aprovacao verdadeira;
- Gate 40 esta em producao; observacao funcional real ainda pendente.

## Próxima ação exata

Observar o proximo ciclo natural Pluggy. Se surgir compra corrente elegivel,
confirmar lote numerado e ausencia de duplicidade antes de qualquer segundo
consentimento. Conferir separadamente a proposta de transferencia do Gate 39;
nao forcar polling nem produzir escrita financeira para o smoke.

## Capacidade para retomar

`Codex -> Sol -> Medio -> observar o proximo ciclo Pluggy e conferir as propostas reais.`

## Referencias dirigidas

- gate ativo: `docs/plans/current-gate.md`;
- Gate 39 em producao: `docs/audit/219-open-finance-reviewed-write-release-production-activation-2026-08-10.md`;
- Gate 40 auditado: `docs/audit/221-open-finance-open-invoice-purchase-independent-close-2026-08-10.md`;
- saneamento de dependencia: `docs/audit/222-gate40-ip-address-security-preflight-candidate-2026-08-10.md`;
- reauditoria do saneamento: `docs/audit/223-gate40-ip-address-security-independent-close-2026-08-10.md`;
- producao: `docs/audit/224-gate40-open-invoice-purchase-oci-production-close-2026-08-11.md`;
- elegibilidade: `src/openFinance/openFinancePurchaseProposalEligibility.js`;
- finalizacao: `src/openFinance/openFinanceSaveProposalFinalization.js`;
- deploy: `docs/runbooks/release-checklist.md`;
- producao: `docs/runbooks/production-health.md`.
