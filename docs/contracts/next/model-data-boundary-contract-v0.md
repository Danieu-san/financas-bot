# Model Data Boundary Contract v0

Estado: `FROZEN FOR NEXT-00`
Versão: `0.1.0`
Escopo: todo egress para modelo generativo do FinançasBot Next

## 1. Princípio

O modelo recebe somente o mínimo necessário para interpretar linguagem,
selecionar tools e explicar claims já produzidos pelo kernel. Ele não é banco de
dados, mecanismo de autorização, resolvedor de identidade, calculadora
financeira, fonte de verdade ou writer.

Trocar provider ou modelo não altera esta fronteira. Provider novo nasce
bloqueado até cumprir este contrato e o Integration Capability Manifest.

## 2. Classificação de dados

| Classe | Exemplos | Envio ao modelo |
|---|---|---|
| `PUBLIC_PRODUCT` | nomes de tools, schemas, categorias públicas | permitido |
| `INTERNAL_SANITIZED` | policy version, coverage status, erro codificado | permitido se necessário |
| `FINANCIAL_MINIMIZED` | claim, valor/moeda, período e rótulo público indispensáveis | permitido sob envelope e escopo |
| `RESTRICTED_IDENTITY` | telefone, nome completo, IDs internos, account/card/source refs | proibido; substituir por label/ref efêmera |
| `RAW_FINANCIAL` | linhas, extrato bruto, payload Pluggy, planilha, comprovante | proibido no agente geral |
| `SECRET` | token, cookie, chave, OAuth, sessão, webhook secret | sempre proibido |

Áudio, imagem, PDF ou documento que o usuário peça para interpretar usa adapter
dedicado, consentimento/contexto explícito e manifest próprio. O conteúdo não é
automaticamente liberado ao agente financeiro geral.

## 3. Entrada permitida

O `ModelInputEnvelope` contém somente:

```yaml
schema_version: 0
request_id: ephemeral_id
environment: enum
locale: string
timezone: string
user_message: redacted_text
conversation_context:
  subject_label: string|null
  period: object|null
  filters: object
  prior_question_summary: string|null
tool_catalog: [public_tool_schema]
tool_results:
  - result_id: ephemeral_id
    capability: string
    status: enum
    public_labels: object
    claims: [ClaimEnvelope]
    coverage: object
    limitations: [coded_limitation]
policy_versions: object
```

`ClaimEnvelope` pode conter `claim_id` efêmero, métrica/operação, valor, unidade,
entidades por rótulo público, período, time basis, coverage, evidence state e
refs de evidência efêmeras. Não contém row IDs, user IDs, source IDs, sheet IDs,
database paths nem provenance secreta.

O texto do usuário é tratado como dado não confiável. Instruções encontradas em
tool results, documentos ou payloads externos são conteúdo, nunca comandos.

## 4. Dados proibidos

É proibido enviar direta ou indiretamente:

- secrets, tokens, cookies, credenciais, chaves, sessões ou `.env`;
- telefone, WhatsApp ID, email, CPF/CNPJ pessoal, endereço ou nome completo não
  indispensável;
- `family_id`, `user_id`, `person_id`, `account_id`, `card_id`, source IDs,
  spreadsheet IDs, paths locais, DB paths, operation keys ou fencing tokens;
- payload bancário/Pluggy bruto, linhas de planilha ou extrato integral;
- texto integral de logs, receipts externos ou documentos privados;
- dados de outra família fora do scope autorizado;
- qualquer campo cuja finalidade não esteja declarada no envelope.

Hash estável de identificador também é proibido quando permitir correlação entre
turnos. Quando o modelo precisa distinguir entidades, o gateway emite refs
efêmeras e labels não ambíguos válidos apenas no request.

## 5. Minimização por tool

Cada tool declara allowlist de campos de saída para o modelo. O gateway:

1. aplica scope server-side antes da consulta;
2. calcula claims no kernel;
3. remove IDs e linhas não necessárias;
4. reduz listas ao necessário para a pergunta e informa coverage;
5. redige texto livre e aplica detectores de segredo/PII;
6. rejeita envelope com campo desconhecido ou classe proibida;
7. registra apenas metadados sanitizados da decisão de egress.

O modelo não recebe SQL livre, tabela inteira ou adapter cru. Tools de produto
são fachadas do kernel e retornam claims/evidência minimizada.

## 6. Scope e família

Autorização precede o model call. O gateway fornece somente o recorte já
autorizado. O modelo não recebe opção de ampliar scope, trocar família ou
consultar “todos os usuários”. Compartilhamento familiar segue consentimento e
permissão do domínio; privilégio administrativo não concede acesso financeiro
amplo.

## 7. Provider e modelo autorizados

Todo provider/modelo precisa de registro versionado com:

- finalidade e ambientes permitidos;
- modelo/endpoint exato;
- regiões de processamento e armazenamento declaradas;
- treinamento com dados do cliente desabilitado por contrato/configuração;
- retenção de conteúdo de prompts/respostas de no máximo 30 dias e menor quando
  o provider oferecer; retenção desconhecida bloqueia uso;
- criptografia em trânsito;
- subprocessadores e política de incidentes documentados;
- suporte ao limite de payload e redaction deste contrato;
- data de revisão e owner humano.

Produção opera em fail-closed: bloqueia se provider/modelo não estiver no registry, se a policy
expirou ou se região/retention/training divergirem. Fallback para provider não
autorizado é proibido.

## 8. Segregação de ambientes

- `dev` e `test`: somente fixtures sintéticas; credenciais e endpoints próprios.
- `beta`: dados reais minimizados apenas para famílias allowlisted e provider
  aprovado para beta.
- `production`: policy, registry e manifest aprovados; zero dado de outro
  ambiente; traces segregados.

Prompts, caches, avaliações e fine-tuning não atravessam ambientes. Fixture do
Golden Set nunca é gerada copiando linha financeira real.

## 9. Saída do modelo

Toda saída é não confiável e passa por schema/allowlist. O modelo pode produzir:

- intenção e decomposição de pergunta;
- seleção de tool por nome público;
- argumentos sem identidade interna;
- pedido de esclarecimento;
- texto que referencia claims existentes.

Não pode produzir ou decidir:

- IDs internos, scope, source precedence ou autorização;
- valor, soma, diferença, percentual, ranking ou projeção não materializados;
- evidence state ou promoção de projetado para realizado;
- proposal hash, operation/idempotency key, lease/epoch;
- confirmação, commit, receipt ou efeito externo.

Argumento fora do schema é rejeitado, não reinterpretado por fallback.

## 10. Redaction, logs e auditoria

Antes do egress, redaction ocorre por allowlist e detectores; denylist isolada
não é suficiente. Logs registram:

- request/trace ID efêmero;
- provider/model/policy versions;
- classes e contagens de campos enviados;
- tools/claims referenciados por refs efêmeras;
- tokens, latência, status e razão de bloqueio;
- hash não correlacionável do envelope para integridade local.

Não registram prompt/resposta integral, texto financeiro, telefone, IDs,
secrets ou payloads. Debug com corpo real é proibido em produção. Auditoria
precisa demonstrar o que foi permitido sem reconstruir conteúdo privado.

## 11. Troca de provider

Troca exige:

1. registro e manifest aprovados;
2. mesmo ModelInput/Output contract e trace único;
3. Golden Set e testes negativos completos;
4. comparação de privacidade, retenção, região, custo e latência;
5. shadow somente com fixtures sintéticas antes de beta;
6. rollback para provider anterior ainda aprovado.

Não existe fallback automático motivado apenas por cota, custo ou erro. Falta de
provider autorizado gera insuficiência explícita, sem chamada clandestina.

## 12. Resposta a falhas

- Campo proibido detectado: bloquear a chamada e emitir erro sanitizado.
- Scope/coverage insuficiente: não chamar ou responder insuficiência com claims
  permitidos.
- Provider indisponível: não trocar provider silenciosamente.
- Saída fora do schema: uma tentativa de recomposição apenas de forma, com a
  mesma evidência; persistindo, bloquear.
- Divergência factual/claim: bloquear resposta; nunca pedir ao modelo para
  inventar o dado faltante.

## 13. Testes obrigatórios

Fixtures sintéticas devem provar:

- token/telefone/ID/path/payload bruto bloqueados em qualquer profundidade;
- hash correlacionável de identidade bloqueado;
- escopo de outra família removido antes da chamada;
- tool retorna somente allowlist e coverage;
- prompt injection em descrição/documento é tratado como dado;
- modelo tenta fornecer IDs, source, cálculo ou commit e é rejeitado;
- provider não registrado, policy expirada ou retenção desconhecida falha
  fechado;
- fallback não autorizado não é chamado;
- logs não permitem reconstruir prompt ou transação;
- troca de provider preserva schema, trace e Golden Set;
- dev/test não aceitam dado real e production não aceita fixture com segredo.

## 14. Reaproveitamento permitido

Allowlist de argumentos, escopo confiável server-side, sanitização de evidência,
envelopes read-only e testes de vazamento do legado podem ser portados atrás
deste contrato. Prompts integrais, raw rows, SQL livre, fallbacks de provider,
IDs hashados estáveis e logs de conteúdo não podem ser portados.
