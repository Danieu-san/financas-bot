# Relatório de domínio — integridade, scheduler e operação

Objeto: tree `363ef7fcbbeb18bbc3eb4810e0d4e9cce48755ae`.

## Veredito

`NO-GO` para prometer coerência multiusuário completa. Os writes financeiros
principais possuem operation keys e gates relevantes, mas as leituras,
agendamentos e entradas textuais ainda têm contradições transversais.

## Achados confirmados

### DATA-01 — P1 — erro de leitura vira dado financeiro vazio

`readDataFromSheet` captura qualquer erro e retorna `[]`
(`src/services/google.js:1128-1137`). O dashboard pessoal lê nove ranges em
paralelo e reduz listas vazias a KPIs zero, ainda marcando a origem como
`personal_sheet` (`src/services/userSheetAnalyticsService.js:575-658`).

O mesmo adapter alimenta scheduler e análises. Portanto, a promessa da camada
de apresentação de mostrar “indisponível, não zero” é anulada abaixo dela.

### DATA-02 — P1 — fórmula pode entrar como texto `USER_ENTERED`

Os appends e updates genéricos usam `USER_ENTERED`. Não existe neutralização
global de células textuais. Antes mesmo do consentimento, `createPendingUser`
grava o `notifyName`/`pushname` diretamente na aba central `Users`. Descrições
digitadas ou importadas por CSV/OFX também alcançam writers genéricos.

Há controles locais corretos para batch maintenance, fórmulas em XLSX de
entrada e exportação, mas eles não cobrem os caminhos genéricos.

### FLOW-03 — P1 — scheduler mistura planilha central e planilhas pessoais

`checkUpcomingBills`, `sendMorningSummary` e as entradas/saídas do relatório
mensal fazem leituras sem `userId`, logo usam a planilha central. O resumo
noturno e Calendar usam contexto por usuário. Usuários cujo bot grava na
planilha pessoal podem receber “nenhuma dívida” ou totais zero apesar de terem
dados na própria planilha.

### FLOW-04 — P2 — entrega do scheduler não é durável

Os loops de envio ficam dentro de um único `try/catch`; falha em um destinatário
interrompe os seguintes. Não há outbox, recibo ou retry por usuário. IDs de
eventos notificados vivem apenas em um `Set`, então restart pode repetir
lembrete dentro da janela.

### STATE-01 — P1 — ausência de serialização por remetente

O listener não aguarda uma fila por remetente. Operation keys impedem replay do
mesmo `messageId`, mas duas mensagens distintas podem consumir o mesmo estado
e executar duas mutações legitimamente diferentes.

### STATE-03/04 — P2 — último estado e snapshot

O flush Redis no encerramento não é aguardado explicitamente. O snapshot em
arquivo é atômico e redige algumas chaves textuais, mas mantém identificadores,
valores e metadados e não força modo privado.

## Controles positivos

- append/update/delete financeiros usam ledger de escrita e resultado
  `uncertain` bloqueia repetição automática quando aplicável;
- batch maintenance restringe campos e confirma preview;
- importação limita tipo, tamanho, quantidade e exige confirmação;
- receipts têm hash, vínculo, revalidação e compensação de upload;
- canonical ledger e projected plans operam em shadow/canary com gates;
- backup Open Finance v3 é verificável e restore reaplica revogação/retenção.

## Menor ordem futura de correção

1. preservar erro/indisponibilidade em `readDataFromSheet` e consumidores;
2. neutralizar texto na fronteira de escrita ou usar `RAW` com fórmulas internas
   explicitamente separadas;
3. serializar mensagens por remetente;
4. migrar todos os jobs para fonte escopada por usuário;
5. introduzir outbox/recibo de scheduler e dedup durável;
6. endurecer snapshot e shutdown Redis.

Essa ordem só começa depois do gate natural Open Finance previsto no charter.
