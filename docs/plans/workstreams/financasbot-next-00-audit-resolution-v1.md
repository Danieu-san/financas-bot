# NEXT-00 — Resolução da primeira auditoria independente

Data: 2026-08-30
Candidato auditado: `9935e497e4a688686f21f5bd351eba04449bd40e`
Estado: `ACHADOS REPRODUZIDOS E CORRIGIDOS LOCALMENTE; REAUDITORIA PENDENTE`

## Pareceres recebidos

- Claude: `APROVÁVEL`, com ressalvas de auditabilidade indireta;
- Chat: `APROVÁVEL APÓS AJUSTES`, com dois HIGH e findings de robustez.

O parecer mais permissivo não anulou o mais adversarial. Cada finding foi
confrontado com contratos, fixtures e validadores locais.

## Resolução causal

| Finding | Confirmação local | Resolução |
|---|---|---|
| H1 — Golden Set sem oracle factual completo | confirmado em S-01, S-02, M-01 e outros | oracle tipado para 56/56 turnos e recálculo de sentinelas da fixture |
| H2 — `67/67` apenas cardinal | confirmado: fonte intermediária e modos permissivos | IDs nos contratos primários e policy causal independente por ID |
| M1 — constantes autorreferenciais/permissivas | confirmado | 48 IDs, 16/16/8/8, 14 dimensões e prefixos contratuais fixados no validador |
| M2 — vocabulário da fixture | confirmado | eventos `confirmed/projected`, proposta `presented`, categoria e refs resolvidas |
| M3 — sanitização automática insuficiente | confirmado como risco futuro | detectores gerais e allowlist sintética positiva |
| L1 — workflow não prova semântica | confirmado | workflow permanece evidência estrutural separada, nunca GO semântico |

## Findings não aceitos como defeito material

- o corpus atual já era sintético e não continha segredo/dado real;
- o diff anterior já era estritamente documental;
- a arquitetura de autoridade, fencing, proposal/CAS, Model Boundary e cutover
  não precisou ser redesenhada;
- propriedades executáveis continuarem deferidas é correto; o erro era sugerir
  que o corpus já as evidenciava.

## Não escopo preservado

Nenhum runtime, integração, dado real, serviço, writer, deploy, produção ou bot
legado foi acessado ou alterado. NEXT-01 permanece fechado.

## Critério de saída

Novo candidato só pode substituir o hash auditado após:

1. validação focal verde;
2. uma única validação ampla verde sobre candidato staged;
3. diff e varredura de escopo/segredos verdes;
4. commit sanitizado publicado;
5. reauditoria independente sem lacuna indispensável;
6. decisão explícita de Daniel antes de NEXT-01.
