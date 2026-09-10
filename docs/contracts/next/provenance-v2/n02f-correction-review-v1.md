# N02-F — correção documental H-01 / H-02 / M-01

Data: 2026-09-10. Candidato corrigido; REAUDITORIA PENDENTE.
Parent exigido: ef04368c95af33a12c0e8b5b286c0e0b01ae27f8.
O parecer integral fornecido por Daniel foi NO-GO, com dois HIGH e um MEDIUM.
Este relatório não atribui execução independente ao Codex nem aprova a mudança.

## Confronto crítico

H-01 confirmado: seis guards de exclusão dos dois safe_daily_pace comparavam
event.state com estimated, fora do enum do input. Corrigidos para confirmed,
com input_evidence_state explícito e sem alterar estimated no claim.

H-02 confirmado como insuficiência relacional de autoria. O exemplo do parecer
reparava também um predicado, portanto não era mutant isolado de snapshot.
Mesmo assim, o pacote permitia autorar limites inconsistentes. Agora as duas
janelas de conta resolvem diretamente os campos; três ciclos de cartão e
duas janelas de ritmo diário usam relações genéricas entre suas autoridades.
Cinco relações novas são propostas em operator-registry-v2.json, com ADR e
propriedades. A versão 1 permanece intacta. NEXT-00 §8 prevê essa via de revisão.

M-01 confirmado: proof.selected_nodes copiava required_nodes nos 76 grafos.
Agora ambas as fases contêm required_selections e selected_nodes coincide
exatamente com a união dos conjuntos efetivamente selecionados por essas
operações. required_nodes conserva examinados, inclusive excluídos/coverage.
Três grafos derivados não possuem seleção: seus pais ficam nos reads/required_nodes.

## Objeto preservado

Sem mudança nos 76 claims, 115 snapshots, fixture/oracle v1, policy financeira,
fórmulas executáveis, kernel, pins, runtime, dependências do projeto, bot, canal,
produção ou dados reais. Os únicos contratos funcionais editados são
account_balance, statement_total e safe_daily_pace. Seus três hashes e o hash
do registry foram atualizados. Contratos executáveis permanecem not_built.

O path de ratificação correto é
docs/plans/workstreams/financasbot-next-00-architecture-ratification-v1.md.
O pedido anterior omitiu architecture no nome; não criar artefato para corrigir
esse erro do prompt. A autoridade existente foi mantida.

## Checks locais executados

Verificação descartável de autoria com Ajv 8.17.1 instalado somente em logs/
ignorado, sem package.json/lockfile versionado. Foi usado o canonicalValue/digest
existente para fingerprints. Contas civis de controle e mutações em memória
confrontaram os predicados temporais específicos; não constituem compiler,
graph evaluator ou mutation suite do runtime.

- 43 documentos validados por schema: pacote de grafos, claims, registry,
  witnesses de evaluator e 39 contratos funcionais.
- 76 grafos/claims e partições; 152 contratos de fase com seleção coerente.
- 115 envelopes de snapshot e fingerprints; cinco hashes de autoridades e
  39 hashes de contratos.
- 32 operadores: 27 anteriores preservados, cinco novos propostos.
- 11 janelas nomeadas nos sete grafos temporais.
- 4.422 arestas materiais e seis derived_from, total 4.428.
- 16.270 requisitos de leitura: acréscimo de calendar/timezone na derivação
  dos dois safe_daily_pace.
- 52 assertions locais de regressão/data/schema, incluindo reprodução da
  antiga tautologia, inputs elegíveis, corte de conta, fechamento/vencimento,
  janela anterior, clock/divisor/mês, bissexto, virada de ano, clamp recusado,
  data local diferente da UTC, range inclusivo e formas inválidas do schema.

Comparação JSON contra o parent confirmou identidade, nodes, sets, edges e
authoring_sources inalterados em 76/76 grafos; predicados dos outros 69 grafos
inalterados. Em required_reads, somente quatro adições: calendar/timezone na
derivação dos dois safe_daily_pace. Demais reads, required_nodes, arestas de
trace e operações estruturais anteriores permaneceram iguais.
git diff --check e node scripts/agent/validateAgentWorkflow.js: OK.

22 casos documentais em temporal-and-selection-witnesses-v1.json descrevem
requisitos futuros. Seu status permanece authoring/not_executed. Os checks
locais acima não os promovem a witnesses instrumentados executados.
Não repetir suíte funcional ampla para delta exclusivamente documental.

## Reauditoria reduzida por delta

Lote A: H-01 e M-01, contrato/schema, alterações de seleção nos 76 grafos,
preservação de claims/inputs e vínculos estruturais/hashes. Foco nas diferenças;
os sete vínculos temporais ficam pendentes para B.

Lote B: H-02, registry v2/ADR/propriedades e somente S-05#1#1, S-06#1#1,
S-12#1#1, M-05#1#1, F-03#2#1, M-13#1#3 e M-13#1#6. Confrontar as relações
com os campos do manifest/claim/policy e os três contratos funcionais.

Consolidação: mesmo SHA/parent em ambos os lotes, inventário completo do delta,
nenhum finding aberto, nenhuma fronteira entre lotes sem revisão. Produzir
um único veredito final; lote incompleto não é aprovação parcial de execução.
Nenhuma autorização de compiler/evaluator ou NEXT-03 decorre deste relatório.
