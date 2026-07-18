# Relatório de domínio — Open Finance e Pluggy

Objeto: tree `363ef7fcbbeb18bbc3eb4810e0d4e9cce48755ae`.

## Situação funcional atual

O runtime faz polling natural no startup e em intervalo configurável, com piso
de seis horas. Em produção, o estado anterior à auditoria mantinha:

- shadow preview e reconciliação em `canary`;
- write mode em `off`;
- vault, baseline, outbox, journal e preview privados;
- nenhuma superfície remota de leitura/review;
- nenhum comando `salvar <referência>`.

Quando um ciclo encontra observação posterior ao baseline, ele reconcilia com
os dados internos. Correspondências são silenciadas; incertezas ficam em
preview; eventos novos elegíveis podem gerar alerta com referência pública.
Nada disso cria gasto/entrada na planilha.

## Frequência e mensagem

O código impede intervalo inferior a seis horas. A leitura sanitizada de
produção confirmou `OPEN_FINANCE_POLL_INTERVAL_MS` equivalente a **6 horas**;
portanto, o bot não está em atualização diária. O runtime pode mandar alertas elegíveis no
WhatsApp, limitados por ciclo e escopados por alias/destinatário. Ele não manda
uma pergunta automática de gravação nem salva a partir da resposta do usuário.

## Gates demonstrados

- apenas endpoints GET na integração read-only da Pluggy;
- baseline silencioso, atômico e idempotente;
- coleta incompleta, item desatualizado e 401/403 falham fechado;
- outbox cifra payload, separa referências e não concede escrita;
- `accepted_unconfirmed` não sofre retry automático ambíguo;
- revogação é monotônica por geração e purga todos os stores;
- em canary, preview ausente falha antes do journal;
- backup v3 inclui quatro bancos, verifica pacote e restaura isoladamente;
- review local exige WhatsApp em allowlist e retorna `financial_writes=0`.

## Gate natural concluído — GO

O ciclo posterior ocorreu naturalmente às 01h25 UTC de 2026-07-18. Resultado:
`GO`, zero novas observações, três entregas anteriormente pendentes movidas
para `accepted_unconfirmed`, zero retry e zero escrita financeira. Journal real
permaneceu vazio; preview ficou 1/1, sem review e sem expirado; outbox ficou sem
pending/in-flight. Tree, PM2, health, WhatsApp, modos e permissões continuaram
verdes. Nenhuma execução foi forçada.

## Decisão sobre “quer salvar?”

A ideia é coerente como fluxo futuro: após uma observação não salva, o bot pode
oferecer uma ação explícita em vez de esperar o usuário descobrir um comando.
Entretanto, a pergunta só pode ser exposta depois de existir:

1. referência curta ligada a exatamente um candidato e um ator;
2. revalidação de status, escopo, valor, data e duplicidade no momento do uso;
3. confirmação de uso único com expiração;
4. operation key e recibo de escrita;
5. tratamento de resultado incerto, replay e restart;
6. revogação/retention e auditoria sem payload sensível;
7. rollout shadow → canary com write mode ainda separado.

Até esses contratos existirem e serem auditados, tanto `salvar <referência>`
quanto a pergunta proativa permanecem `NO-GO`.
