# Open Finance — recovery da reserva de destinatário após transporte ambíguo

Data: 2026-08-03

## NO-GO independente anterior

O Chat leu integralmente os 14 arquivos solicitados do commit imutável
`ed4326759c9108a81b4903abf7e14dc171f7feb7` e emitiu `NO-GO` para
`OF-ALERT-BIND-01`.

Achados: `ALTO=1`, `MÉDIO=0`, `BAIXO=0`.

O vínculo exato, a inelegibilidade de falha ambígua, a classificação e o zero
write estavam corretos. A lacuna era intra-ciclo: se a primeira tentativa de
proposta terminasse em `ambiguous_transport_failure`, a mensagem poderia ter
chegado, mas o destinatário continuava disponível no conjunto de seleção. O
laço poderia então reclamar e tentar uma segunda proposta interativa para o
mesmo telefone antes do ciclo seguinte.

O parecer não tratou as contagens locais como execução própria e não autorizou
deploy, flag, integração ou produção.

## Recovery

`bindOpenFinanceProposalConversation` agora separa duas decisões:

1. se o transporte da proposta pode ter enviado a mensagem —
   `delivered_confirmed` ou `accepted_unconfirmed` — o principal destinatário é
   imediatamente reservado no conjunto de exclusão do restante do ciclo;
2. somente entrega confirmada ou transporte resolvido sem id e marcado como
   `conversation_bindable=true` cria estado conversacional para resposta.

Assim, uma falha ambígua continua inelegível para `sim`, não cria estado, não é
reenviada automaticamente e também não permite que outra proposta alcance o
mesmo telefone naquele ciclo. Falha definitiva anterior ao envio continua
liberando retry e não reserva o destinatário.

O principal destinatário passa a ser obrigatório antes da reserva. Ausência ou
inconsistência falha fechado.

## Prova causal

O novo teste adversarial usa o `OpenFinanceAlertOutbox` real com duas propostas
pendentes para o mesmo principal:

- a primeira é reclamada e terminalizada como
  `ambiguous_transport_failure`;
- o recovery reserva o destinatário sem criar conversa;
- a segunda permanece pendente;
- `claimNext` com o conjunto usado pelo runtime retorna `null`;
- o outbox registra exatamente uma aceitação não confirmada e zero escrita.

Evidência local:

- `tests/openFinanceCanaryRuntime.test.js`: `10/10`;
- quatro suítes diretamente afetadas: `51/51` antes da prova adicional;
- bateria causal afetada final: `193/193`;
- suíte hermética final: `1.432` testes, `1.427` aprovados, zero falha e cinco
  skips funcionais esperados;
- cobertura: linhas `90,56%`, branches `72,85%`, funções `90,13%`.

As contagens são execução local do Codex, não execução do auditor externo.

## Invariantes e limites

- proposta `prompt`, escrita `off`, aprovação falsa e `financial_writes=0`;
- classes e limites de alerta permanecem os do candidato anterior;
- evento ausente no provedor continua não sendo sintetizado;
- propostas de salvamento para entrada, transferência e demais classes não são
  adicionadas por este recovery;
- nenhuma flag, integração, dado real ou produção foi alterado.

## Estado

`RECOVERY CANDIDATO LOCAL; AGUARDANDO NOVA AUDITORIA INDEPENDENTE; NO-GO PARA
DEPLOY`.

Somente `GO TÉCNICO LOCAL` do novo hash autoriza release OCI por artefato
imutável, mantendo write `off`. `confirm` continua bloqueado.
