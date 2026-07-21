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
- Status posterior: `AUTH-01` foi corrigida e validada em produção; `FLOW-01`
  e o contrato original restrito de `STATE-02` receberam `GO local` na C-01.
  Restam sete `P1` residuais — dois parcialmente resolvidos e cinco abertos —
  e sete `P2` abertos do objeto auditado.

O resultado mais importante é que as baterias verdes não cobrem algumas
contradições entre camadas. O bot tem bons controles locais de confirmação,
idempotência e Open Finance, mas identidade, lifecycle, leitura e scheduler
ainda não formam um contrato global fechado.

## Adendo de remediação — AUTH-01 — 2026-07-18

O achado histórico permanece documentado, mas seu caminho explorável foi
fechado. O commit `7f61aaa` eliminou a autorização por nome controlável e passou
a reconhecer admin somente por identificadores presentes em `ADMIN_IDS`. A
migração operacional vinculou o `@lid` real ao único alias telefônico admin já
autorizado, sem usar nome, criou backup privado do `.env` e falhou fechado para
qualquer cardinalidade diferente de um.

Evidência: colisão de nome negada, `@lid` explícito aceito, bateria afetada
`215/215`, suíte principal de release `997/997` mais pretestes, auditoria npm
offline sem vulnerabilidades e teste focado remoto verde. A tree do deploy de
produto validada em local e EC2 é
`943fe932184e37552e908339b4523879684f7a0a`. Após um único restart,
PM2, health, SQLite e WhatsApp ficaram verdes; não houve padrão de erro crítico,
mensagem real, polling forçado ou escrita financeira. Open Finance permaneceu
em canary/canary com write mode `off`, e o dashboard admin amplo permaneceu
desligado.

## Adendo de remediação — C-01 / FLOW-01 / STATE-02 — 2026-07-21

A revisão independente confirmou o HEAD
`30cb39e17e635712e75ad5198e7c4dccbf6f6e8d`, o intervalo de produto
`c6103234fa344a60d6cd8dae7a141281c396d6c6..f4c160649c2f97a48d20ad7d68dd1467ceee683f`
e os arquivos exigidos. A análise foi estática e não reproduziu os testes.

`FLOW-01` foi aceito como resolvido localmente: os efeitos de áudio agora ficam
depois dos gates. O contrato específico de `STATE-02` também foi aceito para o
mesmo message ID na mesma instância e dentro do TTL. O pacote C-01, contudo,
recebeu `NO-GO` por um novo `MEDIUM`: `.ogg` e `.mp3` usam somente o timestamp
em milissegundos, permitindo colisão entre áudios distintos, sobrescrita,
remoção cruzada ou transcrição trocada. Os testes atuais não exercitam essa
concorrência.

O fechamento da C-01 exige temporários isolados por execução, teste concorrente
determinístico e nova revisão independente. Deduplicação após restart ou entre
instâncias permanece limite `LOW`; sanitização arbitrária de erros externos
permanece em `PRIV-01`. Deploy e produção não foram avaliados nem autorizados.

Correção local posterior no commit
`3d738fdc3ed65d9c767858e0377d3c2b62eabffc`: cada áudio agora recebe um
diretório temporário atômico exclusivo criado por `fs.mkdtempSync`. O RED
determinístico com duas conversões no mesmo milissegundo reproduziu conteúdo e
remoção cruzados; o GREEN passou `3/3`, e a bateria C-01 diretamente afetada
passou `118/118`, com checks de sintaxe/diff verdes e zero resíduos. O candidato
ainda aguardava nova revisão independente naquele ponto.

O fechamento final ocorreu no candidato
`0188570edcc96d3dd95afb4207fb08746feb80c5`. A revisão independente confirmou
o último delta e fechou o risco do fixture fixo, sem novo `BLOCKER`, `HIGH`,
`MEDIUM` ou `LOW` material. No candidato exato, os gates locais foram: `5/5`
focados, `120/120` afetados, `npm test` `1036/1036`, runner hermético válido com
`1156` testes e zero falhas, rede externa bloqueada, auditoria npm offline sem
vulnerabilidades e zero resíduos. Resultado: `GO local integral da C-01`.
Deploy e produção não foram avaliados.

## Adendo de remediação — C-03 / WGL-02 — 2026-07-21

A ausência de revogação OAuth individual foi fechada localmente no HEAD
`be8eb6e850b3d51a012238d78053b6602cf9cba8`. O lifecycle impeditivo aplica
tombstone local, cria job versionado com claim/lease exclusivo, bloqueia
reconexão enquanto houver material pendente e executa recovery limitado por
política persistida. A revisão independente do intervalo `bf7d291..be8eb6e`
confirmou os arquivos exigidos e deu `GO` local sem `BLOCKER`, `HIGH` ou
`MEDIUM`; a análise foi estática e não avaliou deploy ou Google real.

Este adendo fecha somente `C-03/WGL-02`. Ele não fecha o componente de
compartilhamento Drive do achado agregado `AUTH-03`, nem `WGL-03/WGL-04` sobre
replay e compensação da saga Google.

## Estado consolidado das remediações — 2026-07-21

Esta tabela preserva a severidade e a identidade dos achados originais, mas
separa o estado posterior das correções. `Parcial` não reduz severidade nem
autoriza deploy: indica apenas que uma parte causal possui evidência local.

| ID | Sev. | Estado posterior | Limite atual |
| --- | --- | --- | --- |
| AUTH-01 | P1 | Resolvido | autorização por nome removida e validação produtiva concluída |
| FLOW-01 | P1 | Resolvido | efeitos de áudio após os gates e temporários isolados por execução; C-01 com GO local integral |
| DATA-01 | P1 | Aberto | indisponibilidade Google ainda pode virar resultado financeiro vazio/falso |
| DATA-02 | P1 | Aberto | fronteira genérica `USER_ENTERED` ainda não neutraliza todo texto |
| AUTH-02 | P1 | Parcial | C-02 impede reativação por lifecycle, mas replay e planilha órfã permanecem |
| AUTH-03 | P1 | Parcial | C-03 revoga OAuth individual; membership/permissão Drive permanece |
| FLOW-03 | P1 | Aberto | scheduler central e writes pessoais ainda divergem |
| STATE-01 | P1 | Aberto | não há serialização geral por remetente |
| STATE-02 | P1 | Resolvido | mesmo message ID não é retranscrito na mesma instância/TTL; C-01 com GO local integral |
| PRIV-01 | P1 | Aberto | escapes de log e identificadores crus ainda não foram fechados globalmente |
| AUTH-04 | P2 | Aberto | token de dashboard não é invalidado imediatamente pelo bloqueio |
| FLOW-02 | P2 | Aberto | caminhos de OCR/receipts/import/export anteriores ao rate limit não foram fechados |
| FLOW-04 | P2 | Aberto | jobs gerais do scheduler ainda não possuem outbox/retry durável por usuário |
| STATE-03 | P2 | Aberto | shutdown Redis ainda não prova espera do último flush |
| STATE-04 | P2 | Aberto | snapshot e permissão produtiva ainda não foram corrigidos |
| COV-01 | P2 | Aberto | gate padrão ainda não incorpora formalmente toda a bateria hermética |
| OPS-01 | P2 | Aberto | runtime e `.env.example` continuam sem sincronização integral |

Contagem vigente: três P1 resolvidos; sete P1 residuais, sendo dois parciais e
cinco abertos; sete P2 abertos. As seções e tabelas anteriores continuam como
registro do objeto original, não como quadro vigente de remediação.

## Achados prioritários originais

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

1. **concluído:** remover admin por nome e criar vínculo explícito seguro de
   `@lid`;
2. **concluído:** isolar temporários de áudio por execução e fechar a C-01 com
   revisão independente e gates locais integrais;
3. **gate imediato:** preservar indisponibilidade de leitura até dashboard,
   análise e scheduler (`DATA-01`);
4. neutralizar textos na fronteira genérica do Sheets;
5. tratar separadamente replay/uso único e compensação OAuth (`WGL-03/WGL-04`);
6. remover membership/permissão Drive quando o lifecycle exigir;
7. serializar mensagens por remetente;
8. alinhar scheduler à planilha pessoal e adicionar outbox durável;
9. fechar escapes de log e proteger o snapshot;
10. transformar a bateria Open Finance local em gate padrão de release;
11. sincronizar schema de ambiente e `.env.example`;
12. reauditar cada fatia antes de promoção.

## Gate de retorno obrigatório

A auditoria documental, estática, local e operacional está concluída. O ciclo
natural posterior ocorreu sem ser forçado e recebeu `GO`: tree equivalente,
PM2/health/WhatsApp verdes, `writes=0`, journal real vazio, preview estável,
retenção válida e outbox sem itens pendentes/in-flight. A trava de retorno foi
satisfeita. `AUTH-01` foi corrigida em fatia explícita posterior. A C-01 recebeu
`GO local integral`: `FLOW-01`, o contrato original restrito de `STATE-02` e a
colisão de temporários estão fechados, com revisão independente e gates locais
verdes no candidato `0188570...`. Deploy e produção não foram avaliados. A
próxima correção causal é `DATA-01`.
