# CODEX-USAGE-CAL-01 — recovery causal do coletor privado

Data: 2026-08-03

## Estado local

`RECOVERY LOCAL APOS NO-GO; NOVA AUDITORIA INDEPENDENTE PENDENTE`.

O candidato anterior `682fd9546a9eeee1d15a4f6e15165b2a6e303cc9`
recebeu NO-GO por tres classes de lacuna: strings tecnicas ainda podiam reter
identidade, eventos atrasados podiam mudar de objetivo e duplicar, e a
instalacao nao tinha rollback executavel nem resolucao fisica de junctions.

## Recovery de privacidade

- nomes de eventos pertencem a um conjunto fixo `codex.*`;
- identificadores de conversa, thread, turno e tarefa viram SHA-256 antes da
  persistencia;
- modelo, effort, status, ferramenta, origem de sessao e demais categorias usam
  conjuntos publicos fixos; valor desconhecido vira `other` ou e descartado;
- `originator`, `source`, `role` e `failure_reason` nao sao persistidos;
- numeros so sobrevivem em chaves quantitativas e dentro de limites definidos;
- timestamp OTel invalido vira `null`, nunca texto bruto.

## Recovery temporal e de deduplicacao

O `event_id` nao inclui `objective_id` nem `received_at`. A mesma emissao
retransmitida sob outro objetivo ou apos reinicio conserva a mesma identidade.
Cada objetivo registra inicio e termino em nanossegundos em journal local. O
receptor atribui pelo timestamp observado, nao pelo objetivo ativo no momento
do POST. Timestamp ausente, intervalo invalido ou sobreposto falha fechado como
nao atribuido.

Se houver queda depois de gravar o intervalo terminal e antes de limpar o estado
ativo, o journal terminal prevalece: eventos posteriores nao permanecem presos
ao objetivo antigo, e o comando seguinte reconcilia o estado sem duplicar o
intervalo.

## Recovery de armazenamento e configuracao

O caminho fisico do ancestral existente e resolvido com `realpath`; caminhos
diretos ou via symlink/junction para dentro do repositorio sao recusados antes
de qualquer escrita. O manager chama esse gate antes de criar armazenamento.

`Install` cria backup e estado atomico. Uma instalacao anterior identica pode
ser adotada somente quando existe um unico backup cujo conteudo coincide com o
prefixo original. `Uninstall` exige estado gerenciado, bloco final intacto,
backup existente, hash e conteudo original identicos; cria backup pre-rollback
e restaura os bytes originais. Qualquer divergencia recusa a alteracao.

## Evidencia local

- RED: cinco falhas correspondentes aos achados independentes;
- focal do recovery: `13/13` verde;
- replay no mesmo processo e depois de restart: um unico evento;
- evento tardio: atribuido ao intervalo original, nao ao objetivo atual;
- estado ativo obsoleto apos terminalizacao: fora da janela fica nao atribuido;
- junction para o repositorio: recusada;
- Install/Uninstall real em configuracao temporaria: bytes originais identicos;
- configuracao alterada depois da instalacao: rollback recusado sem mutacao;
- coletor real: configurado, running e health verdes;
- emissao real observada: nove eventos nao atribuidos, zero ID bruto, somente
  nomes e chaves sanitizados; nenhuma tarefa de calibracao foi iniciada.

## Alcance

O recovery permanece local. Nao altera FinancasBot, OCI, WhatsApp, Pluggy,
planilhas ou producao. `RX-HIST-SEG-01` continua bloqueado ate GO independente.
