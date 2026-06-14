// src/config/constants.js

let adminIds = new Set();
let adminIdsSource = null;
const userMap = {};
let userMapSource = null;

function parseUserMap(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return {};

    if (raw.startsWith('{')) {
        try {
            const parsed = JSON.parse(raw);
            return Object.fromEntries(
                Object.entries(parsed)
                    .map(([id, name]) => [String(id).trim(), String(name || '').trim()])
                    .filter(([id, name]) => id && name)
            );
        } catch (error) {
            return {};
        }
    }

    return raw.split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .reduce((acc, entry) => {
            const [id, ...nameParts] = entry.split(':');
            const normalizedId = String(id || '').trim();
            const name = nameParts.join(':').trim();
            if (normalizedId && name) {
                acc[normalizedId] = name;
            }
            return acc;
        }, {});
}

function initializeUserMap({ force = false } = {}) {
    const rawUserMap = process.env.LEGACY_USER_MAP || process.env.USER_MAP || '';
    if (!force && userMapSource === rawUserMap) {
        return userMap;
    }

    userMapSource = rawUserMap;
    Object.keys(userMap).forEach((key) => delete userMap[key]);
    Object.assign(userMap, parseUserMap(rawUserMap));
    return userMap;
}

function initializeConstants({ force = false } = {}) {
    const adminIdsString = process.env.ADMIN_IDS || '';
    initializeUserMap({ force });

    if (!force && adminIdsSource === adminIdsString) {
        return adminIds;
    }

    adminIdsSource = adminIdsString;
    adminIds = new Set(
        adminIdsString
            .split(',')
            .map((id) => id.trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, ''))
            .filter(Boolean)
    );
    return adminIds;
}

function getAdminIds() {
    return initializeConstants();
}

const sheetCategoryMap = {
    gasto: 'Saídas',
    saida: 'Saídas',
    'saídas': 'Saídas',
    entrada: 'Entradas',
    divida: 'Dívidas',
    'dívida': 'Dívidas',
    meta: 'Metas'
};

const creditCardConfig = {
    'nubank daniel': {
        sheetName: 'Cartão Nubank - Daniel',
        closingDay: 8
    },
    'nubank thais': {
        sheetName: 'Cartão Nubank - Thais',
        closingDay: 29
    },
    'nubank cristina': {
        sheetName: 'Cartão Nubank - Cristina',
        closingDay: 11
    },
    atacadao: {
        sheetName: 'Cartão Atacadão',
        closingDay: 8
    }
};

initializeUserMap();

module.exports = {
    get adminIds() {
        return getAdminIds();
    },
    getAdminIds,
    userMap,
    sheetCategoryMap,
    creditCardConfig,
    initializeConstants,
    initializeUserMap
};
