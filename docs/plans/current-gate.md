# Gate ativo — STATE-04

Atualizado em: 2026-07-23

Commit funcional de partida:
`beb8e0ff7f2eccd74688aa347de6b7d79170d094`.

## Estado

`CARACTERIZAÇÃO DOCUMENTAL CONFIRMADA; RED LOCAL PENDENTE`. Este gate não
autoriza produção, deploy ou leitura do snapshot real.

## Objetivo

Fechar `STATE-04`: o snapshot conversacional local deve preservar somente o
estado estritamente necessário de forma confidencial, íntegra, privada e
limitada por retenção, sem depender do `umask` operacional.

## Escopo

- `src/state/userStateManager.js` e testes diretamente relacionados;
- conteúdo físico de `state_store.json` e seu temporário;
- modo privado explícito em criação, substituição e recuperação;
- inventário adversarial de identificadores, valores, datas, contas/cartões,
  pessoas, filenames, classificações e campos desconhecidos;
- retenção e compatibilidade de restore/restart;
- falha fechada quando a proteção exigida não puder ser aplicada.

## Não escopo

- shutdown Redis e último flush (`STATE-03`);
- outbox/retry do scheduler (`FLOW-04`);
- conteúdo de SQLite, OAuth, Open Finance, logs ou Google Sheets;
- snapshot real de produção antes de candidato local auditado;
- deploy, rotação de segredo ou migração destrutiva de estado real.

## Invariantes

1. arquivo final e temporário nunca ficam mais permissivos que `0600`;
2. plaintext privado não pode permanecer no snapshot apenas por usar chave
   desconhecida ou estrutura aninhada;
3. restore não transforma dado protegido/corrompido em fluxo autorizado;
4. escrita continua atômica e falha não substitui o último snapshot válido;
5. retenção é limitada e testável;
6. logs não revelam conteúdo, caminho privado, identificador ou segredo;
7. o desenho não reutiliza silenciosamente credencial de outro domínio.

## Riscos

- remover campos necessários e reabrir fluxos em estado incoerente;
- criptografar sem contrato de chave, rotação ou autenticação;
- aplicar `chmod` somente depois de uma janela de exposição;
- proteger o arquivo final e deixar o temporário permissivo;
- aceitar snapshot legado ou corrompido de forma permissiva;
- confundir proteção local com prova operacional em produção.

## Etapas

1. reproduzir RED de conteúdo e modo em diretório temporário;
2. mapear campos necessários ao restore e escolher minimização, envelope
   autenticado ou combinação mínima;
3. implementar proteção com menor diff e migração/falha fechada explícita;
4. executar sintaxe, testes focais, bateria afetada e uma suíte ampla final;
5. publicar commit sanitizado e pedir auditoria independente por hash;
6. somente com `GO` local e autorização remota separada, validar modo e retenção
   de forma sanitizada no servidor vigente.

## Testes previstos

- testes dedicados de `userStateManager` para modo, temporário, conteúdo,
  corrupção, restore e retenção;
- `tests/unit.test.js` apenas nos cenários de estado durante o RED;
- bateria afetada após estabilização;
- `npm test` uma vez no candidato final.

## Critérios de GO

1. RED demonstra conteúdo privado e/ou modo permissivo no código-base;
2. arquivo final e temporário ficam `0600` desde a criação;
3. inventário adversarial não encontra plaintext privado;
4. restart restaura somente estado válido e protegido;
5. corrupção, chave ausente ou proteção indisponível falham fechado;
6. retenção remove estado expirado sem ampliar efeitos;
7. testes, workflow, diff e segredos ficam verdes;
8. commit imutável recebe parecer independente sem achado bloqueante.

## Condições de parada

- necessidade comprovada de nova arquitetura de gestão de segredos que exceda
  `Alto`;
- conflito com `STATE-03`, Redis ou a migração Oracle;
- necessidade de abrir snapshot real, chave ou dado pessoal;
- qualquer ação remota antes do candidato local auditado.

## Capacidade

`Codex → Sol → Alto → caracterizar e corrigir STATE-04 localmente, sem deploy.`

## Próxima ação exata

Ler `src/state/userStateManager.js` e os testes de persistência indicados,
reproduzir em diretório temporário o modo e o conteúdo atuais e criar os REDs
mínimos sem acessar o snapshot real.
