# Fase 6D - OCR de PDF/imagem somente em staging

Data: 2026-07-14

## Contrato

- OCR exige mídia e legenda explícita de importação;
- PDF, JPEG, PNG e WebP passam por tipo, assinatura e limite de 5 MiB;
- conteúdo do documento é dado não confiável; instruções visuais são ignoradas;
- Gemini retorna somente JSON e não possui ferramenta de escrita;
- schema, confiança mínima, fórmulas e limite de 100 linhas são impostos
  localmente;
- campos adicionais são descartados;
- linhas aceitas usam o normalizador, reconciliador, escolha conta/cartão,
  preview e confirmação de CSV/OFX;
- arquivo e resposta bruta não são persistidos ou registrados;
- OCR nunca grava antes do fluxo normal de confirmação.

Decisão de segurança: `docs/decisions/ADR-003-financial-document-ocr-staging.md`.

## Rollout

- padrão `FINANCIAL_DOCUMENT_OCR_MODE=off`;
- canário por correspondência exata em `FINANCIAL_DOCUMENT_OCR_USER_IDS`;
- produção ficou em canário para exatamente um usuário;
- rollback pelo configurador com `FINANCIAL_DOCUMENT_OCR_CANARY_ACTION=disable`.

## Evidência

- TDD RED por módulo ausente;
- gate local e remoto `5/5`;
- normalizador/importador combinado `38/38` durante desenvolvimento;
- suite integral `851/851`; audit high zero; sintaxe/diff verdes;
- primeiro E2E real falhou fechado com HTTP 400 por schema avançado
  incompatível, zero escrita e zero temporário;
- requisição foi simplificada para JSON; validações continuaram locais;
- E2E local e remoto finais: `documents=1`, `rows=1`, `writes=zero`,
  `cleanup=zero`, `privacy=true`;
- commit `6099a35f7dd1e923b6eae67d35441d27bde28f90` implantado por
  fast-forward; backup `.env.pre-6d-6099a35-20260714T071500Z`;
- PM2 online, WhatsApp pronto, health `{"ok":true,"sqlite":true}`, hash
  remoto exato e worktree rastreado limpo.

## Decisão

`GO de produção`. A 6D está encerrada e a 6E - undo por recibo/auditoria -
está autorizada. OCR permanece em canário e não cria transação automaticamente.
