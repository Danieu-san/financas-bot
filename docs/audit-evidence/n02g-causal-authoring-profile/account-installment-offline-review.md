# Contas/parcelas — acesso offline às fontes imutáveis

2026-09-30. Transporte de prova, sem mudança normativa ou aprovação.

Candidato documental: `041da0dfefe8602b85d0168582da722cf74f9a53`.
Parent/proposta: `629a6871ffbdaa581fb64bd59165589bae04c92a`.
Corpus-base: `207ca56b87381d69a922224332fcdda3a629d822`.
Blob Git original de graphs-v2.json: `f95ab36b2d03962f51dc280f95a96947d2810738`.

A reauditoria ficou INCOMPLETA porque a interface não materializou o corpus
integral nem permitiu executar os helpers. O pacote trata essa lacuna de acesso,
mantendo os três commits e objetos Git originais. Os arquivos materializados são
exclusivamente fontes e evidências publicadas; nenhuma implementação parcial,
sessão, credencial, chave, configuração de conta ou história privada foi copiada.

## Gerar e reproduzir

Da worktree do N02-G, execute:

```text
node scripts/agent/prepareN02gAccountInstallmentAuditPacket.cjs
```

O script cria um diretório exclusivo e ZIP em .codex-temp, sem sobrescrever
pacotes anteriores. Copia apenas os blobs selecionados e as árvores/commits que
autenticam seus caminhos. Não inclui blobs não selecionados nem ancestrais;
o resultado é um Git parcial, não um clone para percorrer todo o histórico.
Nenhuma rede, pacote npm ou execução de evaluator é necessária para o replay.

Após extrair o ZIP, o auditor precisa de Node.js 24 e Git e deve executar:

```text
node verify-packet.cjs
node docs/audit-evidence/n02g-causal-authoring-profile/prepare-account-installment-observation-proposal.cjs --check
node docs/audit-evidence/n02g-causal-authoring-profile/prepare-account-installment-selection-witness.cjs --check
git show 207ca56b87381d69a922224332fcdda3a629d822:docs/contracts/next/provenance-v2/graphs-v2.json
```

O manifest é inventário, não autoridade por si só: o verificador recalcula OIDs
dos objetos brutos e confronta os bytes/caminhos resolvidos pelos commits.
O auditor deve revisar os helpers e fazer seus próprios confrontos estruturais
e normativos. Caso Node/Git continuem indisponíveis, registrar a limitação;
não converter o replay local relatado em execução independente.

## Recibo local de transporte

Arquivo: `.codex-temp/ai-041da0d-dh8xWu.zip`; 814.549 bytes.
SHA-256: `7d804057d3c3af7c12b552fa183d7206756665f6183f364f4df1a54ba9b66154`.
Verifier local PASS: 19 fontes, 37 objetos, 76 grafos. Composição local PASS:
11 registros/65 grafos não focais/76 proofs preservados/11 controles.
Witness local PASS: 11 registros, direct_missing=0. Não é parecer externo.

Primeira montagem falhou no limite de caminhos do Windows e está preservada.
A montagem final usa core.longpaths apenas no Git novo do pacote e nome curto;
nenhum helper original foi corrigido ou adaptado para passar nessa montagem.

## Solicitação focal com evidência nova

> Faça uma revisão independente DOCUMENTAL do candidato 041da0dfefe8602b85d0168582da722cf74f9a53. A pendência anterior foi acesso ao corpus integral e execução. O ZIP contém fontes Git originais; leia README.md, autentique os objetos e execute os dois helpers conforme indicado. Confira a composição dos onze perfis e preservação dos outros 65 grafos/76 proofs. Confirme os hashes/fontes efetivamente examinados, separe execução própria de relato e julgue a suficiência normativa antes de aplicação. Se a reprodução não for possível, mantenha a revisão incompleta. Não implementar nem aprovar código posterior, N02-G global, host ou produção.

Nenhum novo pedido havia sido enviado ao registrar este documento. A nova
tentativa se justifica pelo pacote integral acessível ao auditor, não por
repetição da mesma prova. O estado máximo permanece proposta aguardando parecer.
