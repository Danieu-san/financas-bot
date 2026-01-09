// src/config/constants.js

// Carrega os IDs dos administradores a partir do arquivo .env
// A variável vem como "id1,id2,id3", e o split(',') a transforma em um array [ "id1", "id2", "id3" ]
const adminIdsString = process.env.ADMIN_IDS || "";
const adminIds = new Set(
  adminIdsString.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
); // Usamos um Set para checagens mais rápidas

// O userMap continua útil para dar nomes amigáveis às pessoas, em vez de mostrar o número do ID.
const userMap = {
    '5521970112407@c.us': 'Daniel',
    '5521964270368@c.us': 'Thaís'
};

// Mapeia os termos usados pelo usuário para os nomes exatos das abas na planilha
const sheetCategoryMap = {
    'gasto': 'Saídas',
    'saida': 'Saídas',
    'saídas': 'Saídas',
    'entrada': 'Entradas',
    'divida': 'Dívidas',
    'dívida': 'Dívidas',
    'meta': 'Metas'
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
    'atacadao': {
        sheetName: 'Cartão Atacadão',
        closingDay: 8
    }
    // Adicione outros cartões aqui
};

module.exports = {
    adminIds,
    userMap,
    sheetCategoryMap,
    creditCardConfig
};