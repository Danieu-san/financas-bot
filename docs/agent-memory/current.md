# Estado atual portátil do FinancasBot

Atualizado em: 2026-08-03

## Objetivo ativo

Finalizar `OF-ALERT-BIND-01`: corrigir a visibilidade das classes reconciliadas
do Open Finance e garantir que respostas curtas sejam associadas a uma única
proposta interativa no telefone destinatário. O candidato local ainda precisa
de commit imutável, publicação no GitHub e auditoria independente antes de
qualquer deploy.

## Estado vigente

`CANDIDATO LOCAL; AGUARDANDO AUDITORIA INDEPENDENTE; NO-GO PARA DEPLOY`.

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
- impede uma segunda proposta interativa simultânea no mesmo telefone;
- preserva zero escrita financeira.

Manifesto:
`docs/audit/104-open-finance-alert-binding-recovery-candidate-2026-08-03.md`.

## Evidência local

- bateria causal afetada: `192/192`;
- suíte temporal de 9P.4, após estabilizar somente o prazo do fixture: `13/13`;
- suíte hermética: `1.431` testes, `1.426` aprovados, zero falha e cinco skips
  funcionais esperados;
- cobertura: linhas `90,57%`, branches `72,93%`, funções `90,12%`;
- `git diff --check`: verde.

As contagens são execução local do Codex. Ainda não são revisão independente e
não autorizam promover o candidato.

## Git e workspace

- raiz canônica recuperada:
  `C:\Users\Administrador\Documents\FinancasBot\financas-bot`;
- branch: `codex/open-finance-finalization`;
- base do candidato: `a171a55d23c491575239ccd63c0e0ce4e7cfd666`;
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

Criar commit sanitizado e imutável de `OF-ALERT-BIND-01`, publicar a branch,
submeter o manifesto, código e testes exatos à auditoria independente e
confrontar o parecer com a evidência local. Somente `GO TÉCNICO LOCAL` autoriza
release OCI por artefato, mantendo escrita `off`.

## Capacidade para retomar

`Codex → Sol → Alto → publicar e auditar OF-ALERT-BIND-01 por hash imutável.`

## Referências dirigidas

- plano vigente: `docs/plans/current-gate.md`;
- candidato atual:
  `docs/audit/104-open-finance-alert-binding-recovery-candidate-2026-08-03.md`;
- última ativação familiar em produção:
  `docs/audit/103-open-finance-family-policy-independent-production-close-2026-07-31.md`;
- release OCI auditado:
  `docs/audit/99-oci-whatsapp-readiness-window-independent-production-close-2026-07-31.md`;
- arquitetura: `docs/agent-memory/architecture-map.md`;
- riscos: `docs/agent-memory/known-issues.md`;
- seleção de testes: `docs/agent-memory/testing-playbook.md`;
- histórico cronológico: `docs/agent-memory/current-state.md` e Git.
