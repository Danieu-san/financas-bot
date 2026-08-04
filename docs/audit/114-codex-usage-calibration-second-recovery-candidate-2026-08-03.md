# CODEX-USAGE-CAL-01 — segundo recovery causal

Data: 2026-08-03

## Estado local

`SEGUNDO RECOVERY LOCAL; REAUDITORIA INDEPENDENTE PENDENTE`.

O primeiro recovery `a3c6134a8a861daa42e0de9d4cd34c538684f171`
recebeu NO-GO residual. O auditor confirmou os controles principais e isolou
tres bordas: sufixo livre em versoes, comparacao textual no rollback e
sobreposicoes do mesmo objetivo colapsadas pelo `Set`.

## Fechamento de strings

`service.version` e `app.version` foram removidos da allowlist porque nao sao
necessarios para medir custo por objetivo. Modelos permanecem em conjunto
publico exato; IDs opacos permanecem convertidos para SHA-256; categorias
desconhecidas viram `other` ou sao descartadas. Nomes de evento continuam em
conjunto fixo. Timestamp ausente ou invalido vira `null` e nao pode consultar
nem receber um objetivo.

## Fechamento de sobreposicao

A selecao temporal agora conta cada fonte candidata, em vez de deduplicar nomes
de objetivo. Duas janelas coincidentes falham fechadas como nao atribuidas mesmo
quando possuem o mesmo `objective_id`. O comportamento anterior para janela
unica, evento tardio, terminalizacao e replay permanece preservado.

## Fechamento binario do rollback

O manager converte o bloco gerenciado em bytes UTF-8 sem BOM e localiza seu
sufixo por comparacao byte a byte. A adocao aceita somente um backup cujos bytes
sejam identicos ao prefixo. O uninstall exige igualdade integral entre prefixo e
backup, alem do SHA-256 ja registrado. Diferenca apenas de BOM ou codificacao
recusa o rollback sem alterar o arquivo atual.

## Evidencia local

- RED: quatro falhas — versao privada, sobreposicao homonima, timestamp invalido
  e divergencia apenas de BOM;
- focal final: `16/16` verde;
- listener, CLI e manager reais exercitados;
- Install/Uninstall restaura bytes originais na trilha positiva;
- alteracao textual ou somente binaria recusa sem mutacao;
- coletor do segundo recovery: configured, running e health verdes;
- nenhuma tarefa de calibracao foi iniciada.

## Alcance

O segundo recovery permanece local e nao altera bot ou producao.
`RX-HIST-SEG-01` continua bloqueado ate GO independente.
