---
name: audit-immutable-gate
description: Auditar de forma independente um gate ou correção do FinancasBot usando commit sanitizado e imutável, evidência local, GitHub e Chat quando apropriado. Usar ao preparar auditoria final, pedir GO/NO-GO, revisar commit/hash, consolidar evidências ou verificar se uma correção pode ser encerrada. Não usar como substituto dos testes locais nem para autorizar deploy implicitamente.
---

# Auditar gate imutável

## Pré-condições

1. Confirmar que o candidato tem escopo fechado e testes locais proporcionais.
2. Revisar o diff e excluir segredos, dados pessoais, sessões, links sensíveis e mudanças alheias ao gate.
3. Criar/publicar um commit somente quando autorizado e necessário à auditoria.
4. Registrar hash completo, pai/base, caminhos exatos e comandos/resultados relevantes.

## Fontes independentes

Nunca aceitar uma única fonte como prova total. Combinar, conforme o gate, código/testes locais, execução focal/afetada/hermética, Git e commit imutável, Chat em conversa limpa, documentação oficial e produção somente quando autorizada.

Rotular com precisão revisão estática, teste executado, inferência e prova de produção.

## Auditoria pelo Chat

1. Preferir conversa limpa e prompt curto, defensivo e sem segredos.
2. Fornecer URLs imutáveis, hash completo e arquivos necessários; exigir confirmação do hash e dos arquivos lidos.
3. Fazer no máximo uma tentativa automática por gate/hash.
4. Se houver bloqueio de segurança observado pelo Codex ou relatado por Daniel, não insistir. Explicar que o bloqueio não é conclusão sobre o projeto, fornecer prompt manual minimalista e parar.
5. Informar sempre as duas capacidades: `Chat → Modelo → Esforço → auditoria solicitada` e `Codex → Modelo → Esforço → validação da resposta recebida`.
6. Se o Chat não abrir os arquivos imutáveis, seu parecer é apenas revisão lógica do relato e não sustenta GO independente.

## Veredito

Confrontar a resposta externa com código, testes e escopo. O executor não aprova sozinho seu próprio trabalho, e o auditor não implementa correções durante o mesmo gate de revisão.

Registrar achados por severidade, lacunas, GO/NO-GO e alcance, o que não foi validado e a próxima ação única.

Um GO local não autoriza automaticamente push adicional, deploy, EC2, WhatsApp, Google, dados reais ou mudança de flags.
