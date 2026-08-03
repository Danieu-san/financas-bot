# Estado atual portátil do FinancasBot

Atualizado em: 2026-08-03

## Objetivo ativo

Promover com segurança o recovery auditado de `OF-ALERT-BIND-01` na OCI,
mantendo proposta `prompt`, escrita `off` e aprovação falsa, e validar health,
processo único e flags após o release por artefato imutável.

## Estado vigente

`DEPENDENCY SECURITY RECOVERY CANDIDATE; AWAITING INDEPENDENT AUDIT; CONFIRM BLOCKED`.

The OCI release preflight on 2026-08-03 found two high severity transitive
runtime vulnerabilities after the functional hash had received GO. The prior
hash was not deployed. A lockfile-only recovery upgrades `brace-expansion` and
`js-yaml`, leaves product sources unchanged and passes the exhaustive suite.
Candidate evidence:
`docs/audit/107-runtime-dependency-security-recovery-candidate-2026-08-03.md`.

O candidato anterior `ed4326759c9108a81b4903abf7e14dc171f7feb7` recebeu
`NO-GO` independente com `ALTO=1`: uma falha de transporte ambígua podia ter
entregado a primeira proposta sem reservar o telefone no restante do ciclo,
permitindo uma segunda tentativa interativa.

O recovery `c26594f3f11cbe702acee37dd85b72f6721d686c` recebeu `GO TÉCNICO
LOCAL` independente: `ALTO=0`, `MÉDIO=0`, `BAIXO=0`, sem lacuna indispensável
residual. Fechamento:
`docs/audit/106-open-finance-alert-binding-independent-close-2026-08-03.md`.

O smoke familiar real expôs três defeitos:

- transporte resolvido sem id podia entregar a proposta sem criar o estado
  conversacional correspondente;
- uma transferência presente no snapshot era excluída pela allowlist de
  alertas;
- marcador sintético de saldo em atraso podia ser tratado como compra.

O snapshot atualizado do provedor não continha a compra e o estorno adicionais
relatados pelo usuário. O produto não sintetizou eventos ausentes da fonte.

O recovery local:

- torna alertáveis compra, estorno, pagamento de fatura, transferência,
  entrada, saída bancária e tarifa/juros;
- mantém incerteza, parcela futura e `bill_balance` bloqueados;
- vincula transporte resolvido sem id somente à proposta e ao principal
  destinatário exatos;
- mantém falha ambígua inelegível para resposta;
- reserva o destinatário no restante do ciclo sempre que o transporte da
  proposta possa ter enviado, inclusive em falha ambígua;
- impede uma segunda proposta interativa simultânea no mesmo telefone;
- preserva zero escrita financeira.

Recovery:
`docs/audit/105-open-finance-ambiguous-recipient-reservation-recovery-candidate-2026-08-03.md`.

## Evidência local

- bateria causal afetada: `193/193`;
- suíte temporal de 9P.4, após estabilizar somente o prazo do fixture: `13/13`;
- suíte hermética: `1.432` testes, `1.427` aprovados, zero falha e cinco skips
  funcionais esperados;
- cobertura: linhas `90,56%`, branches `72,85%`, funções `90,13%`;
- `git diff --check`: verde.

As contagens são execução local do Codex. Ainda não são revisão independente e
não autorizam promover o candidato.

## Git e workspace

- raiz canônica recuperada:
  `C:\Users\Administrador\Documents\FinancasBot\financas-bot`;
- branch: `codex/open-finance-finalization`;
- hash de produto auditado para release:
  `c26594f3f11cbe702acee37dd85b72f6721d686c`;
- o SSD antigo não é raiz canônica e não deve receber edições deste gate.

## Produção vigente

- provedor: Oracle/OCI, conforme runbook e workstream vigentes;
- release funcional conhecido antes deste candidato:
  `33ab7969bf9ef4190a64f103e46b1ddce9ffe4b0`;
- política familiar ativa para o casal;
- proposta `prompt`, escrita `off`, aprovação falsa;
- health e WhatsApp estavam completos na última verificação registrada;
- AWS não participa de deploy ou rollback.

Antes de qualquer ação remota, redescobrir host, usuário, chave, diretório e
processo nos documentos operacionais atuais. Não executar Git no diretório de
produção; usar somente release por artefato imutável, checksum e rollback.

## Limites e fila posterior

- eventos ausentes no provedor não podem ser criados artificialmente;
- eventos já terminalizados como não alertáveis não serão reenviados;
- neste candidato, propostas proativas continuam restritas a compras
  reconciliadas;
- salvar entrada, transferência, saída bancária, pagamento ou tarifa exige gate
  próprio com semântica e writers adequados;
- `confirm` continua bloqueado até smoke acompanhado e autorização própria.

## Próxima ação exata

Commit and publish the lockfile-only security recovery, obtain an independent
audit against the immutable hash, and only after GO build and promote that new
hash to OCI. Do not enable `confirm`.

## Capacidade para retomar

`Codex → Sol → Alto → promover o hash auditado na OCI e validar o estado seguro.`

## Referências dirigidas

- plano vigente: `docs/plans/current-gate.md`;
- candidato atual:
  `docs/audit/106-open-finance-alert-binding-independent-close-2026-08-03.md`;
- última ativação familiar em produção:
  `docs/audit/103-open-finance-family-policy-independent-production-close-2026-07-31.md`;
- release OCI auditado:
  `docs/audit/99-oci-whatsapp-readiness-window-independent-production-close-2026-07-31.md`;
- arquitetura: `docs/agent-memory/architecture-map.md`;
- riscos: `docs/agent-memory/known-issues.md`;
- seleção de testes: `docs/agent-memory/testing-playbook.md`;
- histórico cronológico: `docs/agent-memory/current-state.md` e Git.
