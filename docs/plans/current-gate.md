# Gate ativo — categorias existentes antes de criar nova

Atualizado em: 2026-07-30

Base:
`b25ff51b59054483a66a16e926534068e6c074f5`.

## Estado

`CARACTERIZAÇÃO LOCAL VERDE; AUDITORIA DE ALCANCE PENDENTE`.

## Objetivo

Quando houver dúvida de categoria na revisão da proposta Open Finance,
apresentar uma seleção útil de categorias já existentes antes de oferecer a
criação de uma nova.

## Escopo

- origem e deduplicação do catálogo autorizado;
- quantidade e ordenação das categorias exibidas;
- comportamento diante de baixa confiança ou dúvida;
- escolha numerada de categoria existente;
- fronteira explícita para criação de nova categoria.

## Não escopo

- alterar taxonomia sem evidência;
- criar categoria automaticamente;
- ativar flags, integração real, escrita financeira, deploy ou produção;
- ampliar acesso além do casal autorizado.

## Invariantes

1. Categorias existentes autorizadas têm precedência sobre criação.
2. A sugestão não inventa categoria nem trata ausência como lista vazia.
3. A escolha persiste identidade, categoria e subcategoria do catálogo.
4. A criação de nova categoria exige ação explícita e não ocorre por fallback.
5. A revalidação final continua confirmando que a escolha permanece autorizada.

## Etapas

1. [concluída] Mapear catálogo, menu e tratamento de dúvida.
2. [concluída] Confirmar o comportamento existente no fluxo financeiro geral.
3. [em andamento] Auditar se a proposta proativa alcança o mesmo contrato.
4. [pendente] Implementar somente a menor correção necessária.
5. [pendente] Executar provas causais e regressão proporcional.
6. [pendente] Publicar recovery e reauditar, se houver lacuna.
7. [pendente] Registrar o fechamento e avançar na fila.

## Critérios de GO

- mais categorias existentes aparecem antes da criação;
- seleção numerada atravessa store e revalidação reais;
- ausência de fonte falha fechada;
- nenhum achado independente bloqueante.

## Condições de parada

- criação implícita ou automática;
- categoria fora do catálogo autorizado;
- divergência entre conversa e finalização;
- necessidade de integração real, flag, deploy ou produção;
- achado independente bloqueante.

## Próxima ação exata

Publicar a caracterização e auditar o alcance do caminho proativo por hash
imutável.

## Capacidade

`Codex → Sol → Alto → auditar o alcance da precedência de categorias existentes.`
