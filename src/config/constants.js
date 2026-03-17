// src/config/constants.js

const adminIdsString = process.env.ADMIN_IDS || '';
const adminIds = new Set(
    adminIdsString
        .split(',')
        .map((id) => id.trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, ''))
        .filter(Boolean)
);

const userMap = {
    '5521970112407@c.us': 'Daniel',
    '5521964270368@c.us': 'Thais'
};

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

module.exports = {
    adminIds,
    userMap,
    sheetCategoryMap,
    creditCardConfig
};
