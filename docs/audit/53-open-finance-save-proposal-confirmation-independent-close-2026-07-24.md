# 9P.1 — fechamento independente da confirmação local de proposta

Atualizado em: 2026-07-24

## Objeto

Commit imutável auditado:
`a2c15b6dd7e52ef7aff8dc3ac4a4050e9adbc445`.

Parent direto:
`3beef9309c5d8f857bc96a3de08965118fdb989b`.

Conversa independente:
`https://chatgpt.com/c/6a63ed9a-5e50-83e9-bb01-1008a96512c4`.

## Veredito

`GO TÉCNICO LOCAL`.

O auditor confirmou o hash, o parent e a leitura integral do manifesto 52, do
journal e dos dois arquivos de teste requeridos. Também consultou o
`openFinanceShadowPreviewStore.js`, diretamente citado pelo conjunto.

Achados:

- `CRITICAL`: 0;
- `HIGH`: 0;
- `MEDIUM`: 0.

## Fechamento causal

- exclusão, truncamento e rollback unilateral do journal são detectados pela
  identidade autenticada, contagem, última sequência e cabeça HMAC confrontadas
  com a âncora separada;
- perda, rollback ou adulteração unilateral da âncora falham fechados, e a
  âncora não é recriada quando os metadados do journal já existem;
- abertura e operações públicas validam a âncora antes de expor ou alterar
  estado;
- as provas usam as classes reais e exigem
  `aceitar → truncar → bloquear reingestão/nova preparação`, preservando o
  terminal `accepted`;
- restore que consulta o journal falha antes de obter terminais divergentes.

As contagens locais permaneceram corretamente classificadas como evidência
executada pelo Codex, não pelo auditor:

- journal focal: `6/6`;
- journal, confirmação e backup: `22/22`;
- Open Finance: `234/234`;
- runner hermético: `1.283/1.288`, zero falhas e cinco skips funcionais
  previstos;
- cobertura: linhas `90,04%`, branches `72,28%`, funções `89,88%`.

## Limite aceito

Rollback coordenado e consistente do journal, da âncora e dos demais
armazenamentos locais para o mesmo ponto antigo é uma impossibilidade inerente
ao contrato puramente local sem raiz monotônica externa. O auditor não o
classificou como lacuna `MEDIUM` indispensável do 9P.1.

## Alcance

O fechamento autoriza apenas registrar o `GO TÉCNICO LOCAL` e avançar ao próximo
gate local planejado. Não houve nem está autorizado:

- deploy;
- produção Oracle ou AWS;
- Pluggy real;
- mensagem WhatsApp real;
- escrita financeira;
- alteração de `OPEN_FINANCE_WRITE_MODE=off`.

## Próximo estado

9P.1 está encerrado. A próxima fatia deve seguir o contrato de produto já
registrado no roadmap: expor no WhatsApp a proposta já reconciliada para o
familiar autorizado e capturar confirmação/correção/cancelamento, mantendo
escrita financeira desligada até gate próprio posterior.
