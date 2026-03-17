const { readDataFromSheet, updateRowInSheet, batchUpdateRowsInSheet } = require('./google');
const { getAllUsers } = require('./userService');
const { creditCardConfig, userMap } = require('../config/constants');
const logger = require('../utils/logger');

function normalizeForCompare(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function toColumnLetter(columnIndexOneBased) {
    let n = columnIndexOneBased;
    let col = '';
    while (n > 0) {
        const mod = (n - 1) % 26;
        col = String.fromCharCode(65 + mod) + col;
        n = Math.floor((n - mod) / 26);
    }
    return col;
}

function buildUserLookup(users) {
    const byName = new Map();
    const byWhatsApp = new Map();

    users.forEach((u) => {
        const userId = String(u.user_id || '').trim();
        if (!userId) return;

        const display = normalizeForCompare(u.display_name);
        if (display) byName.set(display, userId);

        const phoneDigits = String(u.whatsapp_id || '').replace('@c.us', '').replace(/\D/g, '');
        if (phoneDigits) byWhatsApp.set(phoneDigits, userId);
    });

    users.forEach((u) => {
        const userId = String(u.user_id || '').trim();
        if (!userId) return;
        const friendlyName = userMap[u.whatsapp_id];
        const normalizedFriendly = normalizeForCompare(friendlyName);
        if (normalizedFriendly) {
            byName.set(normalizedFriendly, userId);
        }
    });

    return { byName, byWhatsApp };
}

function resolveOwnerToUserId(ownerRaw, userLookup) {
    const owner = normalizeForCompare(ownerRaw);
    if (!owner) return null;
    if (owner === 'ambos') return null;
    if (userLookup.byName.has(owner)) return userLookup.byName.get(owner);

    for (const [nameKey, userId] of userLookup.byName.entries()) {
        if (owner.includes(nameKey) || nameKey.includes(owner)) {
            return userId;
        }
    }
    return null;
}

function inferUserByCardSheetName(sheetName, userLookup) {
    const normalized = normalizeForCompare(sheetName);
    if (normalized.includes('daniel')) return userLookup.byName.get('daniel') || null;
    if (normalized.includes('thais')) return userLookup.byName.get('thais') || null;
    if (normalized.includes('cristina')) return userLookup.byName.get('cristina') || null;
    return null;
}

function inferUserId({ row, ownerIndex, sheetName, userLookup, singleUserId }) {
    if (ownerIndex >= 0) {
        const fromOwner = resolveOwnerToUserId(row[ownerIndex] || '', userLookup);
        if (fromOwner) return fromOwner;
    }

    const byCardName = inferUserByCardSheetName(sheetName, userLookup);
    if (byCardName) return byCardName;

    if (singleUserId) return singleUserId;
    return null;
}

function getTrackedSheets() {
    return [
        { sheetName: 'Saídas', range: 'A:J', userIndex: 9, ownerIndex: 5 },
        { sheetName: 'Entradas', range: 'A:I', userIndex: 8, ownerIndex: 4 },
        { sheetName: 'Dívidas', range: 'A:R', userIndex: 17, ownerIndex: 11 },
        { sheetName: 'Metas', range: 'A:I', userIndex: 8, ownerIndex: -1 },
        ...Object.values(creditCardConfig).map((card) => ({
            sheetName: card.sheetName,
            range: 'A:G',
            userIndex: 6,
            ownerIndex: -1
        }))
    ];
}

async function validateUserIdIntegrity() {
    const tracked = getTrackedSheets();
    const report = {
        generatedAt: new Date().toISOString(),
        totalRows: 0,
        missingUserId: 0,
        bySheet: {}
    };

    for (const config of tracked) {
        const rows = await readDataFromSheet(`${config.sheetName}!${config.range}`);
        let sheetMissing = 0;
        let sheetRows = 0;
        if (rows && rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                sheetRows += 1;
                const row = rows[i];
                const userId = String(row[config.userIndex] || '').trim();
                if (!userId) sheetMissing += 1;
            }
        }

        report.totalRows += sheetRows;
        report.missingUserId += sheetMissing;
        report.bySheet[config.sheetName] = {
            rows: sheetRows,
            missingUserId: sheetMissing
        };
    }

    return report;
}

async function backfillMissingUserIds({ allowSingleUserFallback = false } = {}) {
    const users = await getAllUsers();
    const tracked = getTrackedSheets();
    const userLookup = buildUserLookup(users);
    const singleUserId = allowSingleUserFallback && users.length === 1 ? users[0].user_id : null;

    const result = {
        updated: 0,
        unresolved: 0,
        bySheet: {}
    };

    for (const config of tracked) {
        const rows = await readDataFromSheet(`${config.sheetName}!${config.range}`);
        let sheetUpdated = 0;
        let sheetUnresolved = 0;
        const pendingBatch = [];
        if (!rows || rows.length <= 1) {
            result.bySheet[config.sheetName] = { updated: 0, unresolved: 0 };
            continue;
        }

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const currentUserId = String(row[config.userIndex] || '').trim();
            if (currentUserId) continue;

            const inferredUserId = inferUserId({
                row,
                ownerIndex: config.ownerIndex,
                sheetName: config.sheetName,
                userLookup,
                singleUserId
            });

            if (!inferredUserId) {
                sheetUnresolved += 1;
                continue;
            }

            const rowNumber = i + 1;
            const colLetter = toColumnLetter(config.userIndex + 1);
            pendingBatch.push({
                range: `${config.sheetName}!${colLetter}${rowNumber}`,
                values: [[inferredUserId]]
            });
            sheetUpdated += 1;
        }

        if (pendingBatch.length > 0) {
            try {
                await batchUpdateRowsInSheet(pendingBatch);
            } catch (error) {
                // fallback defensivo para não perder todo o lote em caso de erro transitório
                for (const item of pendingBatch) {
                    await updateRowInSheet(item.range, item.values[0]);
                }
            }
        }

        result.updated += sheetUpdated;
        result.unresolved += sheetUnresolved;
        result.bySheet[config.sheetName] = { updated: sheetUpdated, unresolved: sheetUnresolved };
    }

    logger.info(`[user_id_backfill] ${JSON.stringify(result)}`);
    return result;
}

module.exports = {
    validateUserIdIntegrity,
    backfillMissingUserIds
};
