# NEXT-00 — Validação do Golden Conversation Set v1

Data: 2026-08-30
Fatia: `NEXT00-04`
Estado: `VALIDADO LOCALMENTE — CANDIDATO DOCUMENTAL`

## Escopo

Esta evidência valida somente o corpus sintético exigido pelo charter do
FinançasBot Next. Não implementa agente, kernel, tool, writer, integração,
dashboard, migração nem comportamento de produção.

## Artefatos

- `tests/fixtures/financasbot-next/golden-financial-fixture-v1.json`;
- `tests/fixtures/financasbot-next/golden-conversation-set-v1.json`;
- `scripts/agent/validateFinancasBotNextGoldenSet.mjs`.

O relógio de referência é fixo em `2042-06-15T12:00:00-03:00`. Família,
pessoas, contas, cartões, categorias, eventos, propostas e valores são
inteiramente fictícios.

## Distribuição obrigatória

| Classe | Casos | IDs |
|---|---:|---|
| simples | 16 | `S-01` a `S-16` |
| multi-tool | 16 | `M-01` a `M-16` |
| follow-up | 8 | `F-01` a `F-08` |
| negativa | 8 | `N-01` a `N-08` |
| **total** | **48** | — |

## Cobertura das dimensões críticas

| Dimensão | Casos que a exercitam |
|---|---:|
| pessoa/família | 14 |
| conta/cartão | 18 |
| categoria | 18 |
| período | 26 |
| base temporal | 17 |
| transferência | 3 |
| pagamento de fatura | 3 |
| estorno | 3 |
| projeção | 6 |
| zero | 3 |
| vazio | 3 |
| incompleto | 4 |
| indisponível | 4 |
| coverage de fonte | 14 |

Todas superam ou igualam o mínimo normativo de três casos.

## Rastreabilidade dos contratos

A matriz `contract_traceability` cobre, sem lacuna ou ID desconhecido, os 67
testes documentais: o índice versionado dos contratos 1 a 4 e as tabelas dos
contratos 5 a 8:

- `DA-01..06`: 6;
- `SW-01..05`: 5;
- `CP-01..05`: 5;
- `MB-01..05`: 5;
- `IM-01..12`: 12;
- `CM-01..08`: 8;
- `TB-01..12`: 12;
- `QS-01..14`: 14.

Cada entrada distingue `conversation_guard`, `corpus_evidence`,
`deferred_executable` ou `mixed`, cita casos quando aplicável, informa a fase da
prova executável e explica o vínculo causal. Assim, lease, retry, retenção e
infraestrutura não recebem falso verde conversacional; suas provas de estado e
fault injection continuam reservadas às fases definidas no roadmap.
## Invariantes verificados pelo validador

1. JSON válido e `schema_version=1` nos artefatos;
2. corpus e fixture marcados `synthetic=true` e com o mesmo relógio fixo;
3. exatamente 48 IDs únicos e distribuição `16/16/8/8`;
4. follow-ups com dois ou mais turnos e demais classes com um turno;
5. negativas nunca classificadas como resposta simples;
6. toda conversa possui dimensões, fixtures, contratos, claims e proibições;
7. toda tool pertence à allowlist read-only do roadmap;
8. toda referência de fixture resolve para uma entidade sintética existente;
9. todas as 14 dimensões críticas têm cobertura mínima;
10. matriz de rastreabilidade contém exatamente `67/67`, cada ID uma vez, com
    modo, fase, justificativa e casos válidos quando aplicável;11. marcadores conhecidos de dados privados, produção, segredo ou chave não
    aparecem no corpus.

## Resultado reproduzível

Comando:

```powershell
node scripts/agent/validateFinancasBotNextGoldenSet.mjs
```

Resultado:

```text
NEXT00-04 GOLDEN SET: PASS
cases=48
classes={"simple":16,"multi_tool":16,"follow_up":8,"negative":8}
dimensions={"person_family":14,"account_card":18,"category":18,"period":26,"time_basis":17,"transfer":3,"invoice_payment":3,"refund":3,"projection":6,"zero":3,"empty":3,"incomplete":4,"unavailable":4,"source_coverage":14}
contract_traceability=67/67
fixture_ids=48
```

## Interpretação

O conjunto está apto a ser a especificação conversacional inicial do Next e a
alimentar os replays futuros. Ele ainda não prova que um runtime responde
corretamente: não existe runtime Next autorizado nesta fatia. O próximo gate
deve verificar a coerência cruzada dos oito contratos, da matriz e deste corpus
antes de qualquer implementação funcional.
