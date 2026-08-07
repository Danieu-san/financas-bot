# Gate 34 - promocao operacional do fluxo numerico Open Finance

ID: `OF-NUMERIC-SAVE-OCI-01`

Estado: `fronteira A em NO-GO operacional; artefato local valido, OCI inacessivel`.

Commit de partida documental:
`fa81aa2523291b035977996b048a52dfa842a463`.

Commit de produto auditado a empacotar:
`ea803c5c29919daa582355046536bd22bf8f88a1`.

Os commits entre os dois hashes alteram somente os quatro documentos de
fechamento do gate 33. Nenhum arquivo de produto mudou depois do hash auditado.

## Objetivo

Promover na producao Oracle/OCI, por artefato imutavel, o fluxo numerico de
compras encerrado nos gates 32 e 33 e executar um smoke familiar controlado com
Daniel presente. O gate mantem proposta em `prompt`, escrita em `off`, aprovacao
em `false` e confirma zero escrita financeira.

## Escopo

- construir e verificar localmente o artefato do hash auditado;
- redescobrir de forma sanitizada a infraestrutura vigente antes de qualquer
  acao remota;
- confirmar processo, script/hash ativo, health, WhatsApp, flags e stores;
- verificar backup/restore v3 e rollback antes da promocao;
- preparar slot isolado, planejar e promover somente por OPS-03;
- observar um polling natural posterior ao deploy, sem o antecipar;
- provar lote numerico familiar, cutoff, reserva unica e zero escrita;
- manter o slot e script anteriores disponiveis durante a observacao.

## Nao escopo

- executar `git pull`, `git reset`, `git checkout` ou `git revert` na OCI;
- usar AWS como deploy ou rollback;
- forcar polling, atualizar Item Pluggy ou fabricar transacao;
- ativar `confirm`, `OPEN_FINANCE_WRITE_APPROVED=true` ou qualquer escrita;
- revisar ou salvar RX historico ambiguo;
- iniciar gates 35 a 38;
- imprimir telefone, ID, referencia, descricao, valor, token ou caminho de
  segredo.

## Invariantes

1. Producao deve ser redescoberta como `oracle_oci`; raiz, usuario, chave,
   processo e script ativo nao sao inferidos do historico.
2. O pacote e o instalador sao vinculados ao hash completo auditado e passam
   pelos checksums externo e interno.
3. Existe exatamente um PM2 `financas-bot`, no `cwd` vigente, antes e depois da
   promocao.
4. `OPEN_FINANCE_ALERT_MODE=canary`, reconciliacao e preview em `canary`,
   proposta em `prompt`, escrita em `off` e aprovacao em `false`.
5. Staging, journal, preview, outbox, ancora terminal e state store cifrado
   existem, permanecem privados e integram backup/rollback.
6. Nenhum evento anterior a `2026-07-28` pode ser reclamado ou reenviado.
7. `accepted_unconfirmed` permanece terminal; restart e rollback nao reabrem
   entrega ambigua.
8. O smoke nao grava Sheets, ledger nem qualquer destino financeiro:
   `financial_writes=0`.
9. Qualquer divergencia interrompe o gate e preserva ou restaura o release
   anterior.

## Fronteiras de autorizacao

Em 2026-08-07, Daniel concedeu autorizacao permanente somente para construir e
verificar localmente o artefato imutavel deste gate e para redescobrir a OCI por
consultas sanitizadas estritamente read-only. Essa autorizacao permanente nao
inclui upload, preparacao remota, backup novo, alteracao de `.env`, restart,
troca de script, flag, mensagem, polling, promocao ou smoke.

### A. Preparacao local e descoberta remota somente leitura

O build local e a descoberta sanitizada read-only estao autorizados de forma
permanente para este gate. Permitem:

- construir e verificar o artefato local;
- descobrir provedor, host, usuario, chave, raiz e processo vigentes sem os
  registrar em Git;
- consultar somente metadados sanitizados de PM2, health, flags e permissoes;
- executar o plano read-only dos controladores;
- gerar o plano read-only dos controladores.

Transferir os quatro arquivos e preparar o slot exigem nova confirmacao
explicita. A autorizacao permanente nao permite restart, alteracao de `.env`,
troca de script ou mensagem.

### B. Promocao, restart e smoke

Exige segunda autorizacao explicita depois de Daniel conferir o plano, o hash,
o script anterior e o rollback. Somente entao permite promover o slot, reiniciar
o PM2 e observar o smoke descrito abaixo.

## Sequencia operacional

1. Confirmar arvore limpa, hash auditado e diff posterior exclusivamente
   documental.
2. Executar os gates locais de release, incluindo workflow, suite proporcional
   vigente, audit de dependencias aplicavel, build e verify do artefato.
3. Redescobrir a infraestrutura vigente e confirmar que AWS permanece parada.
4. Fazer preflight remoto sanitizado: processo unico, script/hash ativo, health
   local e publico, WhatsApp pronto, Google/read-model/SQLite saudaveis, flags
   seguras, stores e permissoes privadas.
5. Executar backup/restore v3 isolado e confirmar que nenhuma revogacao ou
   mutacao usa stores reais.
6. Enviar os quatro arquivos para `incoming`, verificar checksums e preparar o
   slot sem tocar no PM2.
7. Gerar o plano OPS-03 e confrontar provider, `cwd`, novo script, script
   anterior e processo unico.
8. Parar para a autorizacao B. Sem resposta de Daniel, nao promover.
9. Promover pelo controlador OCI com janela de health de 60 tentativas; rollback
   automatico em falha de start ou health.
10. Se a proposta ainda nao estiver em `prompt`, planejar e aplicar somente o
    estagio `prompt`; nunca usar `confirm`. Se ja estiver correta, nao reescrever
    `.env` nem reiniciar novamente.
11. Executar health completo e iniciar a observacao do proximo polling natural.
12. Executar o smoke familiar e decidir GO/NO-GO antes de remover o hold do
    slot anterior.

## Smoke familiar com Daniel presente

O smoke espera um evento genuinamente novo e elegivel depois do corte; nao
forca polling nem cria compra para acelerar o teste.

1. Os dois telefones autorizados recebem um unico lote numerado coerente, com
   no maximo quatro itens por destinatario e sem expor seu conteudo ao Codex.
2. Daniel seleciona um item pela opcao numerica apresentada pelo bot.
3. Thais tenta selecionar o mesmo item e deve receber estado indisponivel ou ja
   reservado, sem abrir uma segunda revisao.
4. Itens diferentes permanecem selecionaveis de forma independente nos dois
   telefones.
5. A revisao guiada pode avancar somente ate a fronteira permitida por
   `write=off`; nenhuma confirmacao financeira e executada.
6. Logs sanitizados, outbox, preview e journal confirmam cutoff, reserva unica,
   ausencia de backlog ressuscitado e `financial_writes=0`.
7. PM2, health, WhatsApp, Google, read-model, SQLite e dashboard permanecem
   verdes, sem resposta duplicada nem reinicio crescente.

Daniel deve receber, no momento do smoke, cada mensagem exata a enviar, o que
ela valida e o resultado esperado. Nenhuma pergunta e enviada automaticamente.

## Criterios de GO

- artefato e instalador validados pelo hash auditado;
- preflight, backup/restore v3, prepare e plano verdes;
- promocao aponta para o slot correto e preserva rollback OCI valido;
- flags permanecem `canary/canary/canary/prompt/off/false`;
- um unico PM2, health completo e WhatsApp pronto;
- somente eventos novos posteriores ao cutoff entram no lote;
- reserva familiar e retomada apos restart permanecem fail-closed;
- nenhum backlog antigo ou `accepted_unconfirmed` reaparece;
- `financial_writes=0` e nenhuma superficie financeira e alterada;
- observacao natural e smoke familiar concluidos com Daniel presente.

## Condicoes de NO-GO e rollback

- infraestrutura vigente nao puder ser identificada sem ambiguidade;
- hash, checksum, manifesto, pacote, slot ou script anterior divergirem;
- processo duplicado, AWS ativa ou sessao WhatsApp concorrente;
- store ausente, permissao privada incorreta ou backup/restore v3 falhar;
- flag fora do contrato seguro ou qualquer capacidade de escrita aparecer;
- health, WhatsApp, Google, read-model, SQLite ou dashboard degradar;
- evento anterior ao cutoff, duplicidade, reserva dupla ou backlog ressuscitar;
- descricao/ID/telefone/valor privado aparecer em evidencia;
- Daniel nao estiver presente para promocao e smoke.

Em falha de promocao ou health, usar o rollback automatico de OPS-03. Em falha
posterior, registrar o incidente e promover o slot OCI anterior pelo mesmo
controlador. Nunca ligar a AWS nem editar estado para fazer o release iniciar.

## Proximo passo autorizado

O build/verifier local terminou verde, mas a redescoberta read-only encontrou
duas VMs relacionadas em `Running`, nenhuma acessivel por 22/80/443 e nenhum DNS
conhecido apontando para elas. Security list permite essas tres portas. O
registro sanitizado e
`docs/audit/157-open-finance-numeric-save-oci-frontier-a-preflight-2026-08-07.md`.

O gate fica em `NO-GO` antes de upload. Uma regra SSH `/32` temporaria,
explicitamente autorizada, provou que a VM Ubuntu e sua chave de host respondem,
mas a chave local disponivel nao esta autorizada no servidor. Nenhum comando
interno foi executado e a regra temporaria foi removida e conferida.

O proximo trabalho permitido e somente criar, com autorizacao propria, uma
conexao serial efemera na VM Ubuntu e rodar diagnostico interno read-only. A
rota, o internet gateway e as regras web estao presentes, e ambas as VMs possuem
metricas recentes. Troca de chave, reboot, reparo, nova regra de rede,
desligamento de VM, upload, prepare, restart, flag, promocao e smoke exigem
autorizacao explicita separada.
