'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const checks = [
    ['AGENTS.md', 22 * 1024, ['Superfície → Modelo → Esforço → Próxima tarefa', 'current.md', '$execute-financasbot-gate', 'ADR-002', 'Escada obrigatória de validação', 'syncPortableRepository.ps1', 'Calibração prospectiva de uso do Codex', 'Manage-CodexUsageTelemetry.ps1']],
    ['docs/agent-memory/README.md', 12 * 1024, ['current.md', 'current-gate.md', 'validateAgentWorkflow.js', 'Escada obrigatória de validação']],
    ['docs/agent-memory/START-HERE.md', 14 * 1024, ['resumePortableWork.ps1', 'resume_target', 'syncPortableRepository.ps1', 'OPEN-THIS.json', 'financas_bot_oci_ed25519_20260722', 'financasBot.pem', 'last-safe-handoff.json', 'política global versionada']],
    ['docs/agent-memory/current.md', 16 * 1024, ['## Objetivo ativo', '## Git e workspace', '## Próxima ação exata', '## Capacidade para retomar']],
    ['docs/plans/current-gate.md', 24 * 1024, ['## Objetivo', '## Escopo', '## Não escopo', '## Critérios de GO', '## Condições de parada']],
    ['docs/agent-workflow/global-AGENTS.md', 18 * 1024, ['Superfície → Modelo → Esforço → Próxima tarefa', 'Não trocar ou reduzir', 'não usar subagentes por padrão', '$handoff-portable-work', 'Antes de ação em servidor', 'Escada obrigatória de validação e orçamento de contexto', 'raiz canônica']],
    ['docs/agent-memory/workstreams/index.md', 8 * 1024, ['wgl-03-wgl-04', 'aws-oracle-migration', 'codex-usage-calibration', 'chat-codex-orchestration']],
    ['docs/agent-memory/workstreams/codex-usage-calibration.md', 8 * 1024, ['CODEX-USAGE-CAL-01', 'NAO_DISPONIVEL', 'codexTelemetryCollector.js']],
    ['docs/plans/workstreams/codex-usage-calibration.md', 12 * 1024, ['CODEX-USAGE-CAL-01', 'receptor OTLP/HTTP somente em loopback', 'auditoria independente']],
    ['docs/agent-memory/workstreams/chat-codex-orchestration.md', 10 * 1024, ['ORCH-01', 'chat-codex-orchestration.state.json', 'CHAT_WORKING', 'CODEX_READY', 'HUMAN_APPROVAL_REQUIRED']],
    ['docs/plans/workstreams/chat-codex-orchestration.md', 12 * 1024, ['ORCH-01', 'estado mecânico', 'CHAT_WORKING -> CODEX_READY -> CODEX_RUNNING -> CHAT_READY -> CHAT_WORKING', 'Critérios de GO']],
    ['docs/agent-memory/workstreams/chat-codex-orchestration.state.json', 4 * 1024, ['financasbot-chat-codex-orchestration-v1', 'CHAT_WORKING', 'next_executor', 'expected_base_sha']],
    ['scripts/agent/manageChatCodexOrchestration.js', 24 * 1024, ['financasbot-chat-codex-orchestration-v1', 'CHAT_WORKING', 'CODEX_READY', 'writeAtomically', 'stateHash']],
    ['docs/agent-memory/workstreams/aws-oracle-migration.md', 12 * 1024, ['## Objetivo conhecido', '## Próxima ação obrigatória']],
    ['docs/plans/workstreams/aws-oracle-migration.md', 16 * 1024, ['## Objetivo', '## Não autorizado por este stub', '## Invariantes mínimas']],
    ['.agents/skills/execute-financasbot-gate/SKILL.md', 14 * 1024, ['name: execute-financasbot-gate', '## Preparar', '## Validar e encerrar', 'escada obrigatória de validação']],
    ['.agents/skills/audit-immutable-gate/SKILL.md', 12 * 1024, ['name: audit-immutable-gate', '## Fontes independentes', '## Auditoria pelo Chat']],
    ['.agents/skills/handoff-portable-work/SKILL.md', 14 * 1024, ['name: handoff-portable-work', '## Gatilho automático', '## Parar sem perder trabalho', 'preparePortableHandoff.ps1', 'syncPortableRepository.ps1', 'OPEN-THIS.json', '## Retomar em outro computador']],
    ['scripts/agent/preparePortableHandoff.ps1', 24 * 1024, ['financasbot-safe-handoff-v3', 'canonical_repo_root', 'git_common_dir', 'content_copied = $false', 'validateAgentWorkflow.js', 'START-HERE.md', 'key_references', 'resume_target']],
    ['scripts/agent/resumePortableWork.ps1', 28 * 1024, ['financasbot-portable-resume-v3', 'last-safe-handoff.json', 'canonical_repo_root', 'git_common_dir', 'resume_target', 'matches_current_worktree', 'START-HERE.md', 'key_references', "['content_read'] = $false", 'installPortableWorkflow.js', 'installed_with_backup', "'fetch', '--prune'", 'Raiz efetiva']],
    ['scripts/agent/syncPortableRepository.ps1', 20 * 1024, ['PortableFinancasBotRoot', 'origin/$branch', 'financas-bot-handoff-', 'OPEN-THIS.json', 'A pasta antiga do SSD']],
    ['scripts/agent/Invoke-SafePortableHandoffAfterClose.ps1', 12 * 1024, ['Test-ExclusiveRead', 'preparePortableHandoff.ps1', 'Nenhum conteúdo privado do Codex foi copiado']],
    ['scripts/agent/codexTelemetryCollector.js', 40 * 1024, ['127.0.0.1', 'SAFE_ATTRIBUTE_KEYS', 'collector_host_deve_ser_loopback', 'objective-intervals.jsonl', 'resolvePhysicalPath', 'event_id']],
    ['scripts/agent/Manage-CodexUsageTelemetry.ps1', 28 * 1024, ['log_user_prompt = false', '127.0.0.1:4318', 'before-financasbot-otel', '-WindowStyle Hidden', "'Uninstall'", 'storage-check', 'objective-intervals.jsonl']]
];

const errors = [];
const loaded = new Map();

for (const [relativePath, maxBytes, requiredFragments] of checks) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
        errors.push(`${relativePath}: ausente`);
        continue;
    }
    const value = fs.readFileSync(absolutePath, 'utf8');
    const bytes = Buffer.byteLength(value, 'utf8');
    loaded.set(relativePath, { value, bytes });
    if (bytes > maxBytes) errors.push(`${relativePath}: ${bytes} bytes excedem ${maxBytes}`);
    if (/\[TODO|TODO:/.test(value)) errors.push(`${relativePath}: TODO residual`);
    for (const fragment of requiredFragments) {
        if (!value.includes(fragment)) errors.push(`${relativePath}: falta ${JSON.stringify(fragment)}`);
    }
}

const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bAIza[0-9A-Za-z_-]{20,}\b/,
    /\bgh[opsu]_[0-9A-Za-z]{20,}\b/,
    /\bsk-[0-9A-Za-z_-]{20,}\b/,
    /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}\b/
];

for (const [relativePath, { value }] of loaded) {
    if (secretPatterns.some(pattern => pattern.test(value))) {
        errors.push(`${relativePath}: possível segredo ou token`);
    }
}

for (const skill of ['execute-financasbot-gate', 'audit-immutable-gate', 'handoff-portable-work']) {
    const yamlPath = path.join(root, '.agents', 'skills', skill, 'agents', 'openai.yaml');
    if (!fs.existsSync(yamlPath)) {
        errors.push(`.agents/skills/${skill}/agents/openai.yaml: ausente`);
        continue;
    }
    const yaml = fs.readFileSync(yamlPath, 'utf8');
    if (!yaml.includes(`$${skill}`)) errors.push(`${skill}: default_prompt não invoca a skill`);
}

function git(args) {
    const candidates = [process.env.GIT_BIN, 'git'].filter(Boolean);
    let lastError;
    for (const executable of candidates) {
        try {
            return execFileSync(executable, args, { cwd: root, encoding: 'utf8' }).trim();
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

let gitSummary = 'indisponível';
try {
    const branch = git(['branch', '--show-current']) || '(detached)';
    const head = git(['rev-parse', 'HEAD']);
    const status = git(['status', '--porcelain=v1']);
    const entries = status ? status.split(/\r?\n/).length : 0;
    gitSummary = `${branch} ${head} (${entries} entrada(s) no status)`;
} catch (error) {
    errors.push('Git indisponível; defina GIT_BIN ou instale git no PATH');
}

const startupFiles = [
    'AGENTS.md',
    'docs/agent-memory/START-HERE.md',
    'docs/agent-memory/README.md',
    'docs/agent-memory/current.md',
    'docs/plans/current-gate.md'
];
const startupBytes = startupFiles.reduce((total, file) => total + (loaded.get(file)?.bytes || 0), 0);
const estimatedTokens = Math.ceil(startupBytes / 4);

console.log(`agent-workflow: ${errors.length ? 'FALHOU' : 'OK'}`);
console.log(`git: ${gitSummary}`);
console.log(`contexto inicial dirigido: ${startupBytes} bytes (~${estimatedTokens} tokens, estimativa grosseira)`);

if (errors.length) {
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
}
