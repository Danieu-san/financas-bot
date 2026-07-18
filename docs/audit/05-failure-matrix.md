# Matriz adversarial de falhas

Objeto: tree `363ef7fcbbeb18bbc3eb4810e0d4e9cce48755ae`.

| ID | Falha/injeção | Comportamento esperado | Comportamento observado | Classificação |
| --- | --- | --- | --- | --- |
| FAIL-01 | remetente usa nome do admin | negar privilégios | `isAdminWithContext` concede admin pelo `display_name` | `AUTH-01` P1 |
| FAIL-02 | callback OAuth depois de bloqueio | negar antes de trocar código/gravar token | callback aceita state ainda válido e promove para `ACTIVE` | `AUTH-02` P1 |
| FAIL-03 | bloquear/excluir usuário conectado | revogar credenciais e shares | altera apenas status; Drive/OAuth persistem | `AUTH-03` P1 |
| FAIL-04 | token dashboard já emitido e usuário bloqueado | negar imediatamente | continua válido até TTL | `AUTH-04` P2 |
| FAIL-05 | áudio de usuário sem acesso | negar antes de mídia/LLM | baixa, converte, transcreve e responde antes do access gate | `FLOW-01` P1 |
| FAIL-06 | mesmo áudio concorrente | transcrever uma vez | dedup só é gravada depois da transcrição | `STATE-02` P1 |
| FAIL-07 | duas confirmações simultâneas | uma transição serializada | não há fila/mutex por remetente | `STATE-01` P1 |
| FAIL-08 | falha Google ao ler dashboard | “dados indisponíveis” | adapter retorna `[]`; cálculo produz zeros | `DATA-01` P1 |
| FAIL-09 | falha Google em scheduler | não enviar resumo assertivo | `[]` é tratado como ausência e pode produzir “nenhum”/zero | `DATA-01` P1 |
| FAIL-10 | nome/descrição começa com fórmula | persistir texto literal | writers usam `USER_ENTERED` sem neutralização global | `DATA-02` P1 |
| FAIL-11 | mídia/OCR repetido acima do limite | bloquear antes do download/LLM | handlers especiais antecedem rate limit global | `FLOW-02` P2 |
| FAIL-12 | primeiro envio do scheduler falha | continuar demais usuários e reter retry | `try/catch` engloba o loop; não há outbox | `FLOW-04` P2 |
| FAIL-13 | processo reinicia após lembrete | não duplicar envio | `notifiedEventIds` é apenas memória | `FLOW-04` P2 |
| FAIL-14 | usuário possui planilha pessoal | jobs leem a fonte pessoal | manhã, contas e relatório mensal leem fonte central | `FLOW-03` P1 |
| FAIL-15 | shutdown com Redis | aguardar último flush | flush/quit é disparado sem espera explícita | `STATE-03` P2 |
| FAIL-16 | snapshot conversacional no disco | mínimo de dados e modo privado | ainda contém IDs/valores/metadados; sem `chmod` explícito | `STATE-04` P2 |
| FAIL-17 | erro de API contém request/response sensível | log sanitizado | diversos `console.error` recebem erro/response bruto | `PRIV-01` P1 |
| FAIL-18 | revogação OF sem preview em canary | falhar antes do journal | runtime exige o preview e fecha todos os stores | demonstrado `CODE`/`TEST` |
| FAIL-19 | replay OF após revogação | purgar/bloquear por geração | journal monotônico é reaplicado antes de expor restore | demonstrado `CODE`/`TEST` |
| FAIL-20 | tentativa de escrita OF | zero escrita | write mode permanece `off`; preview/review retornam `financial_writes=0` | demonstrado `CODE`/`TEST`/`PROD` histórico |
| FAIL-21 | teste de regressão padrão | incluir gates ativos | 23/104 arquivos não rodam no `npm test` | `COV-01` P2 |
| FAIL-22 | configuração nova no deploy | exemplo completo e validável | variáveis usadas e `.env.example` divergem | `OPS-01` P2 |

## Falhas que degradam fechado

- modo familiar habilitado com allowlist vazia;
- scope financeiro desconhecido ou ambíguo;
- dashboard v2 com parâmetro de outro usuário;
- preview/review Open Finance sem viewer autorizado;
- restore Open Finance adulterado ou com arquivo não declarado;
- revogação canary sem preview store;
- estado Open Finance revogado, desatualizado ou com coleta incompleta;
- batch maintenance em campo crítico ou com conteúdo de fórmula;
- XLSX importado contendo célula de fórmula.

## Falhas que degradam aberto ou de forma ambígua

- reconhecimento administrativo por nome;
- callback OAuth sem revalidar status e sem nonce consumível;
- leitura Sheets que transforma falha em lista vazia;
- processamento de áudio antes de consentimento/acesso/rate limit;
- `USER_ENTERED` aplicado a texto não neutralizado;
- scheduler sem outbox e com deduplicação volátil;
- logs brutos fora do sanitizador central.
