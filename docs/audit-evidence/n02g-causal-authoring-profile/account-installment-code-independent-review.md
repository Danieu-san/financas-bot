# ACCOUNT-INSTALLMENT — recibo de revisão focal de código

Parecer final consultado em 2026-10-01 na conversa:
https://chatgpt.com/g/g-p-6aa305ab1f8c8191a3f89baff00cc701-next/c/6abe6546-3694-83e9-af1a-c2d4270235b8

**APROVÁVEL focalmente**, CRITICAL/HIGH/MEDIUM/LOW = 0.
Candidato: `6baf88dc8b33326f8e05245e38f9682cc722c0be`.
Parent único: `42a16c8516373d1c5fc49a3836f0eba54e61d4c5`.
Complemento de evidência: `488825d697e1a5e157e1b1b140fd994eaedeb786`.
Essas identidades foram confrontadas com os objetos Git locais.

A revisão concluiu que a closure ausente na tentativa anterior foi fechada.
O auditor autenticou o ZIP (SHA-256
`60ff874d12f940c11e3832048d21a16e8f75df6032b55a93d850147488e445cc`,
2.831.634 bytes), executou `verify-packet.cjs` (149 arquivos/185 objetos),
os checks de aplicação/evidência e reconstruiu o inventário de 52 documentos,
seis schemas, builder, perfil, golden oracle e lockfile.

Revisão estática: expected congelado antes da invocação; predicados somente
após seleção real; revogação/replay recusados; membership reconstruída pelo
comparator separadamente dos predicados. Um diagnóstico adversarial escolheu
a membership esperada por índices sem os reads funcionais: a seleção isolada
coincidiu, mas `comparePhaseCoverage` rejeitou a ausência da cadeia causal.

Limite da execução independente: Node 22.16.0. O comando integrado foi
tentado; 001/005 passaram e 002/003/004/006 ficaram sem AJV. A instalação das
três versões exatas falhou por rede. Os quatro corpos foram examinados num
diagnóstico que bypassava JSON Schema; isso não é reprodução oficial do 6/6.
O 6 PASS local com Node 22.17.0 permanece evidência relatada pelo executor.

A ampla do candidato continua **RED: 2413 PASS / 3 FAIL / 10 SKIP**.
Reprodução dos três FAIL na base limpa não os converte em PASS.
Não há GO global N02-G/NEXT-02, NEXT-03, deploy, produção ou dados reais.
