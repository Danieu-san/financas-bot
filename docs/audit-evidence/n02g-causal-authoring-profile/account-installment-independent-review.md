# Contas/parcelas — decisão documental independente

Recebido de Daniel em 2026-09-30, após ele reenviar em capacidade Alta.
Candidato: `041da0dfefe8602b85d0168582da722cf74f9a53`.
Pai: `629a6871ffbdaa581fb64bd59165589bae04c92a`.
Corpus-base: `207ca56b87381d69a922224332fcdda3a629d822`.
Veredito: **APTO DOCUMENTAL no recorte dos onze perfis**.

O auditor confirmou o ZIP SHA-256
`7d804057d3c3af7c12b552fa183d7206756665f6183f364f4df1a54ba9b66154`,
autenticou 19 fontes/37 objetos/76 grafos e executou os dois helpers originais
com exit 0. Recompôs os onze perfis em Python sem reutilizar composer():
11/11 equivalentes; 65/65 grafos fora do alvo e 76/76 proofs idênticos.
Confirmou origem normativa anterior à execução, sem actual/oracle/trace
observado na composição. Nenhum achado C/A/M; ressalva operacional:
executou Node 22.16.0, não Node 24, além da reconstrução independente Python.

Confronto executor: identidades, SHA do ZIP e outputs correspondem ao pacote
reproduzido localmente e às fontes Git publicadas. A inspeção pública dos
quatro arquivos do candidato complementa o Git parcial do pacote. O parecer
é suficiente para implementar a proposta congelada, não para aprovar código.

Limites preservados: não aprova evaluator/recorder/host, não aplica corpus,
não concede GO N02-G/NEXT-02/NEXT-03, deploy ou produção.

Daniel informou que o envio automático ficou em Instantânea apesar da
indicação anterior de Alta. Essa indicação não era prova do modo efetivo.
Nos próximos envios, verificar o controle efetivo Alta imediatamente antes
de enviar; não usar o rótulo anterior nem a configuração do Codex como prova.
Não reenviar este candidato: o parecer em Alta já foi fornecido por Daniel.
Monitor de oito minutos pausado; monitor separado de cinco horas preservado.

Implementação isolada no SSD, branch
`codex/n02g-account-installment-20260930`, base
`42a16c8516373d1c5fc49a3836f0eba54e61d4c5`. A worktree anterior e suas
alterações de host/pais não foram copiadas, sobrescritas nem publicadas.
Coletor de calibração local consultado: configurado, mas não saudável nem
rodando. Métricas deste bloco: NAO_DISPONIVEL; não ampliar coleta por isso.
