# ADR-003: OCR de documentos financeiros somente em staging

## Status

Accepted

## Data

2026-07-14

## Contexto

PDFs e imagens podem conter extratos úteis, mas também dados ambíguos, texto
malicioso e instruções visuais destinadas a manipular o modelo. Uma extração
multimodal não possui autoridade para decidir permissão nem gravar fatos.

## Decisão

- OCR só inicia por comando explícito do usuário junto da mídia.
- O arquivo é validado por tipo, assinatura e tamanho antes da chamada externa.
- Todo conteúdo visual/textual do documento é tratado como dado não confiável.
- O modelo retorna apenas JSON no schema de linhas financeiras; explicações,
  comandos, URLs, fórmulas e campos adicionais são ignorados ou rejeitados.
- A saída passa pelo normalizador e reconciliador já usados por CSV/OFX.
- Preview completo, escolha de conta/cartão e confirmação continuam
  obrigatórios antes de qualquer escrita.
- Baixa confiança, ausência de linhas ou resposta malformada falham fechados.
- Arquivo e resposta bruta não são persistidos nem registrados em logs.
- Rollout nasce desligado e usa canário por `user_id` exato.

## Consequências

OCR pode reduzir digitação, mas não pode criar transação automaticamente. Uma
linha extraída possui a mesma autoridade de uma linha proposta de CSV: nenhuma
até passar por reconciliação, preview e confirmação humana.
