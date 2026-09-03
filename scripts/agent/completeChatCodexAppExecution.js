'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseState, stateHash } = require('./manageChatCodexOrchestration');

function completeChatCodexAppExecution(context, deps) {
    const stateFile = path.join(context.repoPath, ...context.statePath.split('/'));
    const stat = fs.lstatSync(stateFile);
    if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error('estado local deve ser arquivo regular');
    }
    const localState = parseState(fs.readFileSync(stateFile, 'utf8'));
    if (localState.orchestration_state !== 'CHAT_READY') return null;
    if (localState.task_id !== context.initialState.task_id) {
        throw new Error('CHAT_READY local pertence a outra tarefa');
    }

    let task;
    let finalState;
    let finalHash;
    try {
        task = deps.loadTaskDefinition(
            context.repoPath, context.initialState.task_file, context.initialState.task_id
        );
        if (localState.result_file !== task.result_file) {
            throw new Error('CHAT_READY local aponta para resultado inesperado');
        }
        deps.publishLocalResult({ ...context, task });
        const finalRaw = deps.fetchRemoteState(
            context.repoPath, context.branch, context.statePath, context.gitDeps
        );
        finalState = parseState(finalRaw);
        finalHash = stateHash(finalRaw);
        if (finalState.orchestration_state !== 'CHAT_READY'
            || finalState.task_id !== context.initialState.task_id
            || finalState.result_file !== task.result_file) {
            throw new Error('push concluído sem CHAT_READY remoto verificável');
        }
    } catch (error) {
        deps.saveCache(context.cachePath, {
            ...context.cache,
            launch_status: 'failed:publish_error'
        }, deps.now?.() || new Date());
        throw error;
    }

    deps.saveCache(context.cachePath, {
        ...context.cache,
        observed_hash: finalHash,
        observed_state: 'CHAT_READY',
        launch_status: 'succeeded'
    }, deps.now?.() || new Date());
    return {
        action: 'app_result_published',
        hash: finalHash,
        state: 'CHAT_READY'
    };
}

module.exports = { completeChatCodexAppExecution };
