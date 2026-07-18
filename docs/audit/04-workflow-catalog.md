# Catálogo de jornadas ponta a ponta

Objeto: tree `363ef7fcbbeb18bbc3eb4810e0d4e9cce48755ae`.

Cada jornada abaixo foi seguida da entrada ao efeito persistente e, quando há
dado financeiro, também no sentido inverso até ator, escopo e origem.

| ID | Jornada | Entrada → decisão → efeito | Situação |
| --- | --- | --- | --- |
| WF-01 | primeiro contato | WhatsApp desconhecido → cria usuário `PENDING` → envia termos | parcial: escrita anterior ao consentimento e `AUTH-01`/`DATA-02` |
| WF-02 | consentimento e aprovação | `ACEITO` → consent log → `PENDING_APPROVAL` → aviso admin → aprovação confirmada | parcial: sem serialização e admin por nome |
| WF-03 | conexão Google | link assinado → callback → token cifrado → planilha → `ACTIVE` | parcial: state reutilizável e lifecycle incompleto |
| WF-04 | gasto/entrada simples | interpretação → confirmação/forma → append idempotente → ledger shadow → resposta | demonstrada por código e testes focais |
| WF-05 | cartão e parcelas | identificação do cartão → quantidade → agenda de parcelas → múltiplos appends | demonstrada; concorrência por remetente não provada |
| WF-06 | transferência | origem/destino explícitos → confirmação → transferência e pernas financeiras | demonstrada; compensação depende do ledger de escrita |
| WF-07 | dívida/meta | estado multi-etapa → validação → append → projeções | demonstrada; estado recente pode se perder no shutdown Redis |
| WF-08 | pagar conta/dívida/fatura | seleção → confirmação → update e movimento relacionado | demonstrada por testes; chamadas concorrentes permanecem lacuna |
| WF-09 | apagar/atualizar/desfazer | seleção inequívoca → confirmação → ledger de operação → mutação/reversão | demonstrada por baterias da fase 6 |
| WF-10 | manutenção em lote | filtro seguro → preview → confirmação → mutações item a item | demonstrada; resultado parcial é possível e informado |
| WF-11 | importar CSV/OFX/XLSX | arquivo limitado → parser → preview → destino → confirmação → appends | parcial: fórmula de entrada ainda pode chegar ao Sheets como `USER_ENTERED` |
| WF-12 | importar PDF/imagem | mídia → Gemini OCR → staging → confirmação → mesmos appends da importação | parcial: processamento ocorre antes do rate limit global |
| WF-13 | comprovante | mídia validada → upload Drive → vínculo SQLite → resposta | demonstrada; handler antecede o rate limit global |
| WF-14 | exportar | comando → leitura escopada → neutralização de células → arquivo WhatsApp | demonstrada; handler antecede o rate limit global |
| WF-15 | pergunta financeira | scope resolver → fontes/read-model → cálculo → resposta/LLM | parcial: falha do Sheets pode virar conjunto vazio e resposta zero |
| WF-16 | dashboard v1 | link curto → token → dados próprios; admin amplo só com flag | parcial: token não observa bloqueio até expirar |
| WF-17 | dashboard v2 | link curto → token → consultas próprias → DTO sem campos internos | parcial: adapter de Sheets pode converter indisponibilidade em zero |
| WF-18 | scheduler diário | cron → usuários ativos → Sheets/Calendar → WhatsApp | parcial: fontes centrais em alguns jobs e envio sem outbox |
| WF-19 | relatório mensal | cron → opt-in → entradas/saídas/cartões → WhatsApp | parcial: entradas/saídas vêm da planilha central, não da planilha pessoal |
| WF-20 | lembrete Calendar | cron → Calendar pessoal → janela de 55–70 min → WhatsApp | parcial: deduplicação só em memória e sem retry/outbox |
| WF-21 | Open Finance polling | timer ≥6h → Pluggy GET → vault/baseline → reconciliação → preview/outbox | canário ativo; próximo ciclo natural é gate pendente |
| WF-22 | alerta Open Finance | outbox escopada → destinatário resolvido → WhatsApp → status de entrega | demonstrada em testes; `accepted_unconfirmed` é at-most-once |
| WF-23 | revogar Open Finance | modo resolvido → abre todos os stores → journal → purga monotônica | demonstrada em restore isolado; nunca executada em conexão real nesta rodada |
| WF-24 | revisar preview | store privado → ator em allowlist → classificação sem escrita | somente local; não há superfície remota por desenho |
| WF-25 | salvar referência OF | inexistente | `NO-GO`: nenhuma autorização de escrita financeira |
| WF-26 | inativar/excluir/bloquear | comando → status local | incompleta: não revoga OAuth, dashboard já emitido nem Drive |
| WF-27 | compartilhar planilha familiar | admin → confirmação → permissão Drive → membership local | demonstrada; remoção é comando separado do lifecycle do usuário |

## Jornadas reversas de dados

| Dado observado | Origem e rastreabilidade | Lacuna principal |
| --- | --- | --- |
| linha financeira Google | mensagem/importação + `user_id` + operation key/ledger | duas mensagens distintas concorrentes não são o mesmo replay |
| dado de dashboard | planilha do usuário/read-model + token `uid` | erro de leitura perde a distinção entre vazio e indisponível |
| lembrete/resumo | cron + usuário ativo + planilha/Calendar | alguns jobs consultam a fonte central; sem recibo durável de entrega |
| comprovante | WhatsApp → hash/metadados SQLite → arquivo Drive | lifecycle do usuário não remove/revoga automaticamente o acesso |
| token OAuth | callback assinado → store cifrado por `user_id` | state não é de uso único e status não revoga a conexão |
| alerta Open Finance | alias → geração → referência pública → outbox | payload privado permanece cifrado; nenhuma escrita financeira habilitada |

## Respostas às perguntas de produto sobre Pluggy

O fluxo atual não pergunta nem salva automaticamente uma transação. O polling
natural apenas lê a Pluggy, reconcilia com dados internos, persiste candidatos
privados e pode enviar um alerta com referência. O comando `salvar
<referência>` não existe e continua bloqueado. A proposta de o bot oferecer
“quer salvar?” depois de detectar uma consulta não salva é coerente como
experiência futura, mas depende antes de autorização, confirmação de uso único,
revalidação do candidato, idempotência e escrita auditável. Nenhum desses
requisitos foi presumido como concluído nesta auditoria.
