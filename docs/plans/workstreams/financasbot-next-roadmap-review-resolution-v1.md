# Matriz de resolução das revisões — FinançasBot Next draft v2

Data: 2026-08-30
Base avaliada: `570ec0878ebbaf479b9aef23320e9e37a5b62d67`

## Convergência

Os dois pareceres emitiram `APROVÁVEL APÓS AJUSTES`. Claude elevou a CRITICAL
três pontos que o Chat tratou como HIGH, mas a cadeia causal converge.

| Tema | Chat | Claude | Resolução no v2 |
| --- | --- | --- | --- |
| autoridade/schema de eventos | H1 | C1/C2 | §§3 e 4.1: Observation -> Event -> Projection; ledger Next é autoridade semântica |
| single writer/notifier | H2 | H5 | §4.2 e NEXT-09: lease, fencing, epoch por família/capacidade |
| proposta/estado velho | H3 | M5 parcial | §4.3: proposal_id, hash, TTL, CAS e source version |
| matemática/claims | H4 | divisão IA/código | §§2 e 6: toda derivação no kernel e claim ligado à evidência |
| falha do verificador | — | C3 | §§4.7 e 6: bloqueio, uma recomposição apenas de forma, sem fallback silencioso |
| regras aprendidas | H5 | H2 | §8: whitelist só de classificação/metadado; nunca writer/identidade/permissão |
| Calendar/reminder lifecycle | H6 | M4 parcial | §7.2: CRUD, complete/snooze, ETag, série, timezone e delivery ledger |
| NEXT-08 monolítico | H7 | capacidades/MVP | NEXT-08 vira loop por domínio; §4.6 cria tiers |
| integrações/least privilege | H8 | H4 | §4.5: capability manifest, read-only inicial e teste negativo |
| privacidade do provider | H9 | §15 observação | §4.4: Model Data Boundary Contract |
| tools com métricas divergentes | M1 | C1/M3 | §2.2 e §7: fachadas do registry/kernel |
| migração por total compensatório | M2 | — | §3.3: evento, contagem, fingerprint, dimensão e compensação |
| evento muda antes do commit | M3 | — | §§4.3 e 10: revalidação e invalidação por mudança material |
| três tipos de teste | M4 | M1/M5 | §11: replay, properties e state machine/fault injection |
| estabilidade subjetiva | M5 | H3 | §§4.8 e 14: métrica/limiar antes do teste |
| delete/backup/restore | M6 | M4 | §4.8: tombstone, hard delete, retenção e restore |
| telemetria útil | L1 | — | NEXT-10 preserva valor forense/segurança/auditoria |
| decisões que não bloqueiam NEXT-00 | L2 | resposta final | NEXT-00 abre para decidir; GO exige contratos |
| tool budget concreto | — | H1/L4 | §4.7: 6 soft, 12 hard, repetição e timeout calibráveis |
| troca de modelos | — | M2 | §5: agente/trace único; primeiro MVP usa um modelo |
| dashboard mesma leitura | pedido Daniel | M3/L2 | §§9.1, NEXT-05 e critérios globais |
| tombstone objetivo | Chat M6 | Claude M4 | §4.8: reconciliado/efeito externo não usa hard delete |
| concorrência manual/proativa | — | M5 | §10 e §11.3: disputa da mesma identidade econômica |
| mudança material | Claude L1 | — | §10 enumera campos materiais |
| ADR-002 | — | L3 | §15 resume a obrigação |

## Decisões substantivas tomadas

1. O ledger do Next será autoridade semântica desde NEXT-02; não permanece
   aberta a decisão “espelho ou autoridade”.
2. Sheets e Pluggy são observações/projeções, nunca semânticas concorrentes.
3. O primeiro vertical é gasto por categoria, preservando a necessidade atual.
4. Dashboard v2 é preservado como UX, mas perde cálculo independente.
5. NEXT-08 deixa de ser fase global e vira loop de gates por domínio.
6. Nenhuma capacidade usada pode desaparecer no cutover sem aceitação humana.

## Estado

Todos os achados receberam resolução documental rastreável. Isso ainda não é
GO: a suficiência das resoluções será verificada focalmente por Chat e Claude.

## Residual da revisão focal

O Chat aprovou integralmente o v2. Claude confirmou todos os fechamentos, mas
manteve H3 e M1 como parciais e encontrou um novo MEDIUM: o texto exigia
cobertura do Golden Set sem tornar sua construção um entregável de NEXT-00.

O candidato final fecha os três pontos:

- Golden Set v1 é artefato obrigatório de NEXT-00;
- piso inicial de 48 conversas e três casos por dimensão crítica;
- revisão por Daniel e auditor independente;
- GO de NEXT-00 proíbe limiares numéricos `TBD`.

