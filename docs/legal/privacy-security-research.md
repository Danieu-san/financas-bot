# Pesquisa Legal e Privacidade - FinancasBot

Data: 2026-05-19
Status: rascunho operacional, nao e parecer juridico.

## Conclusao
O FinancasBot trata dados financeiros pessoais e deve operar com postura de dado de alto impacto: minimizacao, consentimento claro, segregacao por usuario, logs limpos, IA com contexto minimo e acesso admin extremamente limitado.

## Produtos revisados
- Mobills: termos e aviso de privacidade; linguagem amigavel; dados pessoais/financeiros; comunicacao digital.
- Organizze: termos simples; ferramenta de gestao financeira; responsabilidade do usuario; armazenamento e seguranca.
- Minhas Economias: termos e privacidade com referencia a LGPD; coleta, uso e retencao.
- YNAB: forte limitacao de responsabilidade; usuario deve conferir dados e calculos.
- Monarch Money: privacidade forte; nao vender dados financeiros; seguranca; retencao; direitos.
- Copilot Money: termos e privacidade com IA/agregacao de dados financeiros.
- Rocket Money: gestao/organizacao financeira, nao decisao financeira definitiva.
- Quicken Simplifi: ideia de modo privacidade para ocultar valores sensiveis.

## Padroes adotados
- Separar Termos de Uso e Politica de Privacidade.
- Mostrar resumo curto no onboarding e links completos.
- Deixar claro que nao e banco, contador, consultor financeiro, consultor de investimentos, seguradora ou Open Finance.
- Declarar que calculos/classificacoes podem conter erro e devem ser revisados.
- Declarar que dados financeiros nao serao vendidos.
- Explicar terceiros: Google Drive/Sheets/Calendar, Gemini, WhatsApp, AWS/EC2.
- Explicar IA separadamente e minimizar contexto enviado.
- Exigir consentimento especifico para Google OAuth, vinculo familiar/casal e suporte.
- Oferecer exclusao, exportacao, revogacao e canal de contato.
- Remover acesso admin amplo antes de ampliar beta.

## Riscos prioritarios
1. Acesso admin amplo a dados financeiros.
2. Uso de IA com dados financeiros.
3. Logs com dados sensiveis.
4. Dashboard via link com token compartilhavel.
5. Importacao CSV/OFX com dados bancarios brutos.
6. Vinculo familiar/casal sem consentimento/auditoria robusta.
7. WhatsApp Web como risco operacional temporario.

## Fontes principais
- LGPD - Lei 13.709/2018: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/Lei/L13709compilado.htm
- ANPD Comunicacao de Incidente: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis
- Google API Services User Data Policy: https://developers.google.com/terms/api-services-user-data-policy
- Google OAuth Sensitive Scope Verification: https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- Gemini API Terms: https://ai.google.dev/gemini-api/terms
- WhatsApp Business Messaging Policy: https://whatsappbusiness.com/policy/
- OWASP API Security Top 10: https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- OWASP LLM Top 10: https://genai.owasp.org/llm-top-10/
