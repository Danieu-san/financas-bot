# ARQ-01 — recovery da auditoria independente — candidato

Data: 2026-08-22

## Parecer de origem

- hash auditado: `544078e2fce30758c8744d907eb0d161b1aa7910`;
- auditor: Chat em conversa limpa, revisão estática e somente leitura;
- acesso: arquivos e diff confirmados integralmente;
- veredito: `NO-GO`;
- severidade: `BLOCKER 0`, `HIGH 0`, `MEDIUM 3`.

## Achados e fechamento local

### MEDIUM-01 — plano não executado em caminho de falha

`derivePlanFromTool` aceitava `plan.args.plan` mesmo quando `toolResult.ok` não
era verdadeiro. Agora o plano direto só existe após sucesso da tool; falha gera
`executedPlan=null`. O teste focal exige essa ausência.

### MEDIUM-02 — evidência crua no full-debug

O caminho preexistente de `FINANCIAL_AGENT_LOG_FULL` serializava `answer` e
`toolResult`. Agora ele serializa apenas ação/tool allowlisted, verificação e a
projeção mínima da trajetória. O teste causal injeta resposta e linha privadas e
exige sua ausência no payload.

### MEDIUM-03 — rastreabilidade e força do baseline

O artefato 297 agora é a saída efetiva do builder do gate, não uma transcrição
manual. Ele inclui fingerprint SHA-256 de uma projeção sanitizada dos 265
resultados e validação explícita de:

- total exato `265`;
- aceitação igual ao total e zero gap;
- zero trajetória ausente;
- `readOnly` igual ao total;
- zero nome de tool fora da allowlist read-only;
- `15/15` casos críticos;
- fingerprint válido.

Isso não transforma allowlist estrutural em prova de execução de writers. A
afirmação limitada é: nenhuma tool de escrita foi selecionada no corpus e o
código do ARQ-01 não adiciona writer, flag ou acesso a produção.

## Evidência local do recovery

- contrato hermético: `7/7`;
- agente/full-debug: `87/87`;
- baseline regenerado: `265/265`, críticos `15/15`, validação verde;
- suíte ampla final: `1.754` aprovados, `0` falhas, `10` ignorados em `1.764`;
- cobertura: linhas `91,64%`, branches `74,53%`, funções `91,18%`;
- workflow portátil: `agent-workflow: OK`;
- produção, flags e writers: não acessados nem promovidos.

## Estado

`RECOVERY LOCAL VALIDADO — AGUARDA HASH IMUTÁVEL E REAUDITORIA INDEPENDENTE`.

Somente um GO independente no novo hash pode encerrar ARQ-01 e autorizar o
início de ARQ-02. Não há autorização de deploy, canário ou retirada de legado.
