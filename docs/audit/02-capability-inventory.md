# Inventário de capacidades e efeitos

Objeto: tree `363ef7fcbbeb18bbc3eb4810e0d4e9cce48755ae`.

Legenda: `R` leitura, `W` escrita real, `S` staging/shadow, `M` mensagem externa.

| ID | Capacidade/entrada | Efeito | Confirmação ou barreira | Estado da trilha |
| --- | --- | --- | --- | --- |
| CAP-01 | primeira mensagem | W cadastro `PENDING`; M termos | consentimento e aprovação | parcial: `AUTH-01` |
| CAP-02 | `ACEITO` | W consent log e `PENDING_APPROVAL`; M admin | palavra exata | demonstrada; concorrência não coberta |
| CAP-03 | aprovação admin | W status; M link Google | confirmação admin em duas mensagens | parcial: `AUTH-01` |
| CAP-04 | callback Google | W token cifrado, planilha e `ACTIVE` | state assinado/expirável | parcial: `AUTH-02` |
| CAP-05 | onboarding | W perfil/configurações | perguntas determinísticas | demonstrada; nome não é identidade |
| CAP-06 | gasto/entrada | W Sheets + shadow ledger | máquina de estados e reliability gate | coberta por bateria focal |
| CAP-07 | cartão/parcelas | W uma ou várias linhas | cartão, parcelas e confirmação quando exigida | coberta; concorrência global ausente |
| CAP-08 | transferência | W transferência/saída/entrada conforme fluxo | seleção e confirmação por estado | coberta por testes focais |
| CAP-09 | dívida/meta | W Sheets e projeção de planos | coleta multi-etapa | coberta; falhas limpam estado |
| CAP-10 | pagar dívida/conta/fatura | W atualização e/ou movimento | confirmação explícita | coberta por testes focais |
| CAP-11 | apagar/atualizar/desfazer | W update/delete/reversão | seleção e confirmação | stores de idempotência presentes |
| CAP-12 | lote | W múltiplas linhas | preview e confirmação | resultado parcial possível e reportado |
| CAP-13 | CSV/OFX/XLS/XLSX | R arquivo; W após preview | limites, classificação e confirmação | coberta |
| CAP-14 | PDF/imagem OCR | R arquivo; chamada Gemini; S estado | canário, limites e confirmação posterior | parcial: `FLOW-02` |
| CAP-15 | comprovante | R/W Drive + SQLite de vínculo | canário, arquivo validado, evento revalidado | coberta; bypass de rate limit |
| CAP-16 | exportação | R Sheets; M arquivo | política de usuário | coberta; bypass de rate limit |
| CAP-17 | pergunta financeira | R Sheets/read-model/ledger; chamada LLM opcional | scope resolver + security gate | baterias amplas |
| CAP-18 | dashboard v1/v2 | R dados; M link | token assinado curto | parcial: `AUTH-04` |
| CAP-19 | admin | W status/share/log; M usuários; restart | admin + confirmação sensível | parcial: `AUTH-01` |
| CAP-20 | scheduler | R Sheets/Calendar; M resumos/lembretes | usuário `ACTIVE` e opt-in quando aplicável | parcial: `FLOW-04` |
| CAP-21 | read-model | R Sheets; W SQLite local | sync e fallback | coberta por testes |
| CAP-22 | ledger canônico | S projeção e leituras canary | flags e operation key | coberta por gates históricos/testes |
| CAP-23 | Open Finance polling | R Pluggy; W stores cifrados; M alertas | aliases/ativação/reconciliação | canário ativo; polling natural posterior `GO` |
| CAP-24 | Open Finance preview | S candidatos de revisão | DB privado + viewer cifrado | persistência canary ativa; sem UI remota |
| CAP-25 | revogação Open Finance | W journal e purga dos stores | runtime fail-closed | integração provada apenas em restore isolado |
| CAP-26 | `salvar <referência>` | proibido | não existe autorização de escrita | `NO-GO` correto |
| CAP-27 | revisão remota de preview | proibida | nenhum handler exposto | `NO-GO` correto |

## Entradas externas

- WhatsApp: texto, áudio/PTT, mídia e documentos.
- HTTP: páginas dashboard, APIs GET, OAuth start/callback e health.
- Cron: 03h, 07h, 08h mensal, 09h05, 09h15, 19h domingo, 20h,
  horário e a cada dez minutos.
- Startup/ready: dashboard, scheduler, Open Finance e backfill de não lidas.
- Scripts operacionais: gates, relatórios, canários, migrações e E2E.
- Fontes: Google Sheets/Calendar/Drive, Gemini, Pluggy e WhatsApp Web.

## Saídas e persistências

- mensagens e arquivos enviados no WhatsApp;
- linhas/updates/deletes no Google Sheets e eventos Calendar;
- arquivos e permissões Google Drive;
- SQLite de OAuth, read-model, receipts, ledger, planos, reliability e Open
  Finance;
- JSON/JSONL de estado, custos, telemetria e auditoria;
- logs PM2/Winston;
- timers, Maps, Sets e cache apenas em memória.

## Barreiras globais efetivas

No texto comum, a ordem é: deduplicação, status/fromMe, acesso, modo família,
contexto de planilha, handlers especiais, rate limit, security gate, cache,
estado e interpretação. Áudio é exceção: transcrição ocorre antes dessas
barreiras. Vários handlers de mídia/arquivo também executam antes do rate limit
global. Esses desvios são detalhados na matriz de falhas.
