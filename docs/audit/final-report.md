# Relatório final — auditoria adversarial completa do FinançasBot

Data: 2026-07-17

Objeto: commit `94c52f23261ae2b9150edcdb7f3ba5ebaba35727`, tree
`363ef7fcbbeb18bbc3eb4810e0d4e9cce48755ae`.

## Veredito executivo

- `P0`: nenhum incidente ativo ou escrita financeira indevida foi observado.
- `P1`: 10 achados com caminho plausível para privilégio, exposição, resposta
  financeira falsa, duplicidade ou perda de coerência.
- `P2`: 7 achados de revogação tardia, recuperação, entrega, cobertura e
  configuração.
- Canário read-only Open Finance: `GO` após o polling natural de 2026-07-18;
  zero escrita, journal real vazio e operação saudável.
- Expansão multiusuário: `NO-GO`.
- `salvar <referência>` e pergunta proativa de gravação: `NO-GO`.
- Revisão remota do preview Open Finance: `NO-GO`.

O resultado mais importante é que as baterias verdes não cobrem algumas
contradições entre camadas. O bot tem bons controles locais de confirmação,
idempotência e Open Finance, mas identidade, lifecycle, leitura e scheduler
ainda não formam um contrato global fechado.

## Achados prioritários

| Ordem | ID | Sev. | Síntese | Evidência |
| --- | --- | --- | --- | --- |
| 1 | AUTH-01 | P1 | nome controlável concede admin, inclusive antes do gate de acesso | `CODE` + `TEST` |
| 2 | FLOW-01 | P1 | áudio de remetente não autorizado é processado e enviado ao Gemini antes do acesso | `CODE` + `GAP` |
| 3 | DATA-01 | P1 | falha de leitura Google vira `[]` e pode ser exibida como zero/“nenhum” | `CODE` + `GAP` |
| 4 | DATA-02 | P1 | texto não neutralizado entra no Google Sheets como `USER_ENTERED` | `CODE` + `GAP` |
| 5 | AUTH-02 | P1 | state OAuth reutilizável pode reativar usuário bloqueado/deletado | `CODE` + `GAP` |
| 6 | AUTH-03 | P1 | bloquear/excluir não revoga OAuth nem compartilhamento Drive | `CODE` + `GAP` |
| 7 | FLOW-03 | P1 | parte do scheduler lê planilha central enquanto writes vão para planilha pessoal | `CODE` + `TEST` parcial |
| 8 | STATE-01 | P1 | mensagens do mesmo remetente não são serializadas | `CODE` + `GAP` |
| 9 | STATE-02 | P1 | áudio concorrente pode ser transcrito duas vezes | `CODE` + `GAP` |
| 10 | PRIV-01 | P1 | caminhos `console.error` e IDs crus contornam a sanitização | `CODE` + `PROD` |
| 11 | AUTH-04 | P2 | token dashboard ignora bloqueio até expirar | `CODE` |
| 12 | FLOW-02 | P2 | OCR/receipts/import/export antecedem rate limit global | `CODE` + `GAP` |
| 13 | FLOW-04 | P2 | scheduler não possui outbox/retry por usuário e dedup é volátil | `CODE` + `GAP` |
| 14 | STATE-03 | P2 | shutdown Redis não aguarda explicitamente o último flush | `CODE` + `GAP` |
| 15 | STATE-04 | P2 | snapshot mantém metadados e está `0664` em produção | `CODE` + `TEST` + `PROD` |
| 16 | COV-01 | P2 | `npm test` omite 23/104 arquivos, inclusive gates Open Finance ativos | `CODE` + `TEST` |
| 17 | OPS-01 | P2 | 22 variáveis diretas do runtime não constam no `.env.example` | `CODE` |

## Controles fortes preservados

- writes financeiros principais entram no contexto de mensagem e usam ledger
  de operation key, com estado `uncertain` quando o resultado não é seguro;
- mutações destrutivas/lote/importação exigem seleção e confirmação;
- Query Engine e dashboard v2 não concedem atalho admin para outro usuário;
- exportação neutraliza fórmulas e XLSX de entrada rejeita células de fórmula;
- receipts usam hash, escopo, revalidação e compensação;
- Open Finance usa GET, payload cifrado, baseline idempotente, outbox, retenção,
  journal monotônico, backup v3 e zero escrita financeira;
- preview não está exposto remotamente e exige ator autorizado localmente;
- revogação canary sem preview falha antes de registrar sucesso.

## Situação exata do Pluggy e das mensagens

Produção está configurada para polling a cada **6 horas**. Portanto, não é uma
atualização diária. O ciclo natural lê a Pluggy, atualiza stores privados,
reconcilia observações e pode enviar alertas elegíveis por WhatsApp. O polling
natural observado às 01h25 UTC manteve zero writes, journal real vazio, um
preview pendente e nenhum preview expirado. As três entregas que estavam
pendentes passaram para `accepted_unconfirmed`, sem retry automático; a outbox
ficou com zero pendente e zero in-flight.

O alerta não salva a transação. Também não existe hoje a pergunta automática
“quer salvar?”. Essa experiência é recomendável apenas depois de implementar
referência de uso único, revalidação completa, confirmação, operation key,
recibo, retry/restart e revogação. Até lá, uma pergunta proativa apenas criaria
uma expectativa de escrita que o contrato atual corretamente proíbe.

## Evidência de testes

- suíte padrão integral verde; etapa principal `996/996`;
- arquivos locais omitidos: `110` aprovados, `5` pulados, `0` falhas;
- E2E real não executado;
- nenhum código/teste de produto foi alterado;
- nenhuma escrita, mensagem, revogação ou polling real foi disparado.

## Menor sequência segura de correção

Esta sequência é uma fila, não autorização imediata:

1. remover admin por nome e criar vínculo explícito seguro de `@lid`;
2. mover dedup, acesso e rate limit antes de áudio/mídia/efeitos externos;
3. preservar indisponibilidade de leitura até dashboard, análise e scheduler;
4. neutralizar textos na fronteira genérica do Sheets;
5. tornar OAuth state de uso único e unificar revogação de lifecycle;
6. serializar mensagens por remetente;
7. alinhar scheduler à planilha pessoal e adicionar outbox durável;
8. fechar escapes de log e proteger o snapshot;
9. transformar a bateria Open Finance local em gate padrão de release;
10. sincronizar schema de ambiente e `.env.example`;
11. reauditar cada fatia antes de promoção.

## Gate de retorno obrigatório

A auditoria documental, estática, local e operacional está concluída. O ciclo
natural posterior ocorreu sem ser forçado e recebeu `GO`: tree equivalente,
PM2/health/WhatsApp verdes, `writes=0`, journal real vazio, preview estável,
retenção válida e outbox sem itens pendentes/in-flight. A trava de retorno foi
satisfeita. A primeira correção futura é `AUTH-01`, em nova fatia explícita.
