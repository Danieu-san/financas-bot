# Gate encerrado — COV-01

Atualizado em: 2026-07-23

Base:
`130d86306ef54d57a3345acb52e83e02f0f20c47`.

Candidato final:
`c96d801f6f5c683634dbc8b3a2997eb576a9e3f5`.

## Estado

`GO TÉCNICO LOCAL` após dois `NO-GO` independentes e correções incrementais.
O parecer final confirmou a cadeia linear de três commits, os oito arquivos e
nenhum achado `CRITICAL`, `HIGH`, `MEDIUM` ou `LOW` dentro do modelo de ameaça
aprovado.

Este gate não autoriza deploy ou acesso a integrações reais.

## Objetivo encerrado

Transformar a bateria local/mockada exaustiva no gate padrão de teste e release,
sem executar o E2E WhatsApp real ou integrações externas.

## Modelo de ameaça

- bot familiar privado de duas pessoas que compartilham os dados;
- código e testes versionados são confiáveis;
- prevenir omissões silenciosas e efeitos externos acidentais;
- não oferecer sandbox universal contra código deliberadamente hostil.

## Contrato final

1. `npm test` delega a `test:release`;
2. o runner descobre todos os `tests/*.test.js`;
3. somente `tests/whatsapp-real-e2e.test.js` é excluído;
4. 18 testes agregados usam manifesto compartilhado e validado;
5. o inventário reconhece a descoberta dinâmica;
6. o ambiente filho usa allowlist e valores fictícios;
7. descendentes Node herdam o tripwire protegido;
8. shell, executáveis não-Node e `fork.execPath` alternativo são rejeitados;
9. skips precisam corresponder à allowlist exata e TODO precisa ser zero;
10. o relatório declara o escopo limitado da proteção de rede.

## Evidência

- contrato adversarial: `11/11`;
- multiprocessos OAuth/snapshot: `56/56`;
- agregador Open Finance: `103/103`;
- `npm test`: `1.241` testes, `1.236` aprovados, zero falhas, cinco skips
  permitidos e zero TODO;
- `114` arquivos descobertos, `96` entradas diretas e `18` agregadas;
- sintaxe e `git diff --check`: verdes;
- nenhuma produção, Google, WhatsApp ou Pluggy real.

## Limitações aceitas

O tripwire permite loopback e não é sandbox do sistema operacional. APIs fora
do escopo declarado, addons nativos, `process.binding` e código deliberadamente
hostil não fazem parte do contrato. Isso é proporcional ao bot familiar e ao
uso de testes versionados confiáveis.

## Próxima ação exata

Abrir `OPS-01` em workstream isolado e reconciliar os nomes/contratos de
ambiente do runtime com o artefato versionado, sem ler valores reais nem acessar
produção.

## Capacidade

`Codex → Sol → Alto → caracterizar e corrigir OPS-01, sem produção.`
