'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
const valueAfter = flag => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : '';
};

const source = path.resolve(__dirname, '..', '..', 'docs', 'agent-workflow', 'global-AGENTS.md');
const codexHome = path.resolve(valueAfter('--codex-home') || process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const destination = path.join(codexHome, 'AGENTS.md');
const replace = args.includes('--replace');
const checkOnly = args.includes('--check');

if (!fs.existsSync(source)) throw new Error(`Template portátil ausente: ${source}`);
const desired = fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n');
const current = fs.existsSync(destination)
    ? fs.readFileSync(destination, 'utf8').replace(/\r\n/g, '\n')
    : '';

if (current === desired) {
    console.log(`workflow global já está atualizado: ${destination}`);
    process.exit(0);
}

if (checkOnly) {
    console.error(`workflow global ausente ou divergente: ${destination}`);
    process.exit(1);
}

if (current && !replace) {
    console.error(`AGENTS global existente não foi sobrescrito: ${destination}`);
    console.error('Revise-o e execute novamente com --replace para criar backup e instalar o template.');
    process.exit(2);
}

fs.mkdirSync(codexHome, { recursive: true });
if (current) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(codexHome, `AGENTS.md.bak-${stamp}`);
    fs.copyFileSync(destination, backup);
    console.log(`backup criado: ${backup}`);
}

const temporary = `${destination}.tmp-${process.pid}`;
fs.writeFileSync(temporary, desired, { encoding: 'utf8', flag: 'wx' });
fs.renameSync(temporary, destination);
console.log(`workflow global instalado: ${destination}`);
console.log('config.toml, autenticação e histórico não foram alterados.');
