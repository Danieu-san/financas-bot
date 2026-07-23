# STATE-04 — recuperação da terceira revisão

Atualizado em: 2026-07-23

## Escopo

Este registro documenta a revisão independente iniciada sobre o commit imutável
`3e1941ce665fe74b284b09f84d2f4be5e9fa0b72`, baseado em
`fd7146c3604fe41bb2ae44de695099254fb30aa4`.

O Chat confirmou o hash final, a cadeia de três commits, os 17 arquivos do
candidato e o delta final de sete arquivos. Também confirmou por inspeção
estática o digest canônico do journal, a ordem durável e as provas adversariais
de replay, interrupção, compactação e preservação de modo.

A sessão foi interrompida antes do veredito final. Portanto, este documento não
registra `GO` nem atribui ao Chat um `NO-GO` não emitido.

## Achados reproduzidos

Antes da interrupção, a revisão identificou duas lacunas:

1. um `STATE_STORE_DRIVER` inválido era registrado como falha, mas o módulo ainda
   podia tentar carregar o snapshot local durante o `require`, antes da
   asserção explícita de configuração;
2. `STATE_STORE_MAX_RETENTION_SECONDS` aceitava decimal positivo, embora o
   journal exija `expiresAt` inteiro, permitindo produzir retenção incompatível.

## Correção incremental

- o carregamento automático do arquivo agora só ocorre quando não há falha de
  inicialização e o driver configurado é exatamente `file`;
- a retenção configurada agora exige inteiro seguro, positivo e dentro do teto;
- um subprocesso adversarial comprova que driver inválido falha antes de tocar
  um snapshot sentinela existente;
- o contrato de startup rejeita retenção fracionária com código constante.

## Evidência executada

- teste dedicado de segurança do snapshot: `14/14`;
- bateria causal/afetada: `345/345`;
- runner hermético final: `1.238` testes, `1.233` aprovados, zero falhas e cinco
  skips funcionais previstos;
- cobertura do runner: linhas `89,76%`, branches `71,86%`, funções `89,62%`;
- rede externa bloqueada;
- `git diff --check` verde antes do registro.

Uma primeira tentativa do runner no sandbox falhou transversalmente porque a
junção de `node_modules` entre o worktree e o SSD não podia ser atravessada.
Essa execução ambiental não foi tratada como evidência de produto. A repetição
com acesso somente às dependências autorizadas produziu o resultado verde
acima.

## Estado

`QUARTO CANDIDATO LOCAL; AUDITORIA IMUTÁVEL INDEPENDENTE PENDENTE`.

Não houve leitura de snapshot real, produção, Google, WhatsApp ou deploy. O
gate só poderá receber `GO TÉCNICO LOCAL` depois de novo commit publicado e
novo parecer independente pelo hash final.
