// src/config/constants.js

// Carrega os IDs dos administradores a partir do arquivo .env
// A variável vem como "id1,id2,id3", e o split(',') a transforma em um array [ "id1", "id2", "id3" ]
const adminIdsString = process.env.ADMIN_IDS || "";
const adminIds = new Set(adminIdsString.split(',')); // Usamos um Set para checagens mais rápidas

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

module.exports = {
    adminIds, // Exportamos a nova lista de administradores
    userMap,
    sheetCategoryMap,
};