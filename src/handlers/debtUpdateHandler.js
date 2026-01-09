// src/handlers/debtUpdateHandler.js

const userStateManager = require('../state/userStateManager');
const { readDataFromSheet, updateRowInSheet } = require('../services/google');
const { normalizeText, parseAmount } = require('../utils/helpers');

function parseHumanAmount(raw) {
  // suporta: 70, 70,50, 1.234,56, 70k, 1.2k, 2m, 2.5m
  const s = String(raw || '').trim().toLowerCase();

  // pega a PRIMEIRA ocorrência “numérica” (com opcional k/m)
  const m = s.match(/(?:r\$\s*)?(\d+(?:\.\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)(\s*[km])?/i);
  if (!m) return null;

  let num = m[1];
  const suffix = (m[2] || '').trim();

  // normaliza: se tem vírgula, ela é decimal e ponto é milhar
  if (num.includes(',')) {
    num = num.replace(/\./g, '').replace(',', '.');
  } else {
    // se não tem vírgula, ponto pode ser decimal
    num = num.replace(/\./g, '.');
  }

  let v = Number(num);
  if (!Number.isFinite(v)) return null;

  if (suffix === 'k') v *= 1000;
  if (suffix === 'm') v *= 1000000;

  return v;
}

function extractOldNewAmountFromText(raw) {
  // tenta entender:
  // - "de 100 para 70"
  // - "de 100 reais pra 70"
  // - "para 70k"
  const text = String(raw || '');
  const norm = normalizeText(text);

  const idxPara = norm.lastIndexOf(' para ');
  const idxPra = norm.lastIndexOf(' pra ');
  const cutIdx = Math.max(idxPara, idxPra);

  let newSaldo = null;
  let oldSaldo = null;

  if (cutIdx >= 0) {
    const after = text.slice(cutIdx + 4); // " para"/" pra" tem 4 chars incluindo espaço inicial
    newSaldo = parseHumanAmount(after);

    // pega algo antes do "para/pra" e tenta achar "de <valor>"
    const before = text.slice(0, cutIdx);
    const beforeNorm = normalizeText(before);

    const idxDe = beforeNorm.lastIndexOf(' de ');
    if (idxDe >= 0) {
      const afterDe = before.slice(idxDe + 3);
      oldSaldo = parseHumanAmount(afterDe);
    }
  }

  // fallback: se não achou via "para/pra", tenta pegar último número como novo saldo
  if (newSaldo === null) {
    // pega todas as ocorrências e usa a última
    const all = [...String(text).matchAll(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)(\s*[km])?/ig)];
    if (all.length > 0) {
      const last = all[all.length - 1][0];
      newSaldo = parseHumanAmount(last);
    }
  }

  return { oldSaldo, newSaldo };
}

function parseDebtUpdateCommand(text) {
  const raw = String(text || '').trim();
  const norm = normalizeText(raw);

  // ✅ verbos típicos
  const hasUpdateVerb = /\b(atualiz\w*|alter\w*|mud\w*|ajust\w*|corrig\w*)\b/.test(norm);

  // ✅ termos relacionados a dívida (não exige "divida")
  const hasDebtKeyword = /\b(divida|dividas|financiamento|emprestimo|emprestimos|parcela|parcelas|juros|fatura)\b/.test(norm);

  if (!hasUpdateVerb || !hasDebtKeyword) return null;

  const { oldSaldo, newSaldo } = extractOldNewAmountFromText(raw);
  if (newSaldo === null || Number.isNaN(newSaldo) || newSaldo < 0) return null;

  // alvo = tudo que vem após o "tipo" (divida/financiamento/emprestimo/fatura) e antes de "de/para/pra"
  let alvo = raw;

  // remove prefixo "atualizar/alterar/mudar/ajustar ... (divida/financiamento/emprestimo/fatura)"
  alvo = alvo.replace(
    /^\s*(atualiz\w*|alter\w*|mud\w*|ajust\w*|corrig\w*)\s+(a\s+)?(d[ií]vida(s)?|financiamento|empr[eé]stimo(s)?|fatura|parcela(s)?)\s*/i,
    ''
  );

  // corta no primeiro " de " ou " para " ou " pra "
  alvo = alvo.split(/\s+(de|para|pra)\s+/i)[0].trim();
  // remove artigos/preposições no começo (ex.: "do Pedro" -> "Pedro")
    alvo = alvo
    .replace(/^[\s"'“”‘’]+/, '')
    .replace(/\s+$/, '');

    while (/^(do|da|de|dos|das|o|a|os|as)\s+/i.test(alvo)) {
    alvo = alvo.replace(/^(do|da|de|dos|das|o|a|os|as)\s+/i, '').trim();
    }
  return { alvo, newSaldo, oldSaldo };
}
function indexToColumnLetter(index) {
  // 0 -> A, 1 -> B, ... 25 -> Z, 26 -> AA...
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function tokenize(text) {
  const stop = new Set(['de','da','do','das','dos','a','o','e','para','pra','dívida','divida','atualizar','atualize','alterar','mudar','saldo','valor']);
  return normalizeText(text || '')
    .split(' ')
    .map(t => t.trim())
    .filter(Boolean)
    .filter(t => t.length >= 2 && !stop.has(t) && !/^\d+$/.test(t));
}

function getHeaderMap(allData) {
  const header = Array.isArray(allData?.[0]) ? allData[0] : [];
  const map = {};
  header.forEach((h, idx) => {
    const key = normalizeText(h || '');
    if (key) map[key] = idx;
  });
  return map;
}

function getColIndex(headerMap, candidates, fallbackIndex) {
  for (const c of candidates) {
    const key = normalizeText(c);
    if (headerMap[key] !== undefined) return headerMap[key];
  }
  return fallbackIndex;
}

function scoreRow(row, colNome, colCredor, tokens) {
  if (!Array.isArray(row)) return 0;
  const nome = normalizeText(row[colNome] || '');
  const credor = normalizeText(row[colCredor] || '');
  const hay = `${nome} ${credor}`.trim();
  if (!hay) return 0;

  let matches = 0;
  for (const t of tokens) {
    if (hay.includes(t)) matches += 1;
  }

  // regra: se o usuário deu 2+ tokens, exige pelo menos 2 matches para não errar feio
  if (tokens.length >= 2 && matches < 2) return 0;

  return matches;
}

async function startDebtUpdate(msg) {
    if (process.env.NODE_ENV === 'test') {
        console.log('[DebtUpdate] body=', msg.body);
        console.log('[DebtUpdate] parsed=', parseDebtUpdateCommand(msg.body));
    }
    const senderId = msg.author || msg.from;

  const parsed = parseDebtUpdateCommand(msg.body);
  if (!parsed) return false;

  const { alvo, newSaldo, oldSaldo } = parsed;

  const allData = await readDataFromSheet('Dívidas');
  if (!allData || allData.length <= 1) {
    await msg.reply('A aba "Dívidas" está vazia.');
    return true;
  }

  const headerMap = getHeaderMap(allData);

  // Colunas típicas (fallback): Nome(A=0), Credor(B=1), Saldo(E=4)
  const colNome = getColIndex(headerMap, ['nome da divida', 'nome da dívida', 'nome'], 0);
  const colCredor = getColIndex(headerMap, ['credor'], 1);
  const colSaldo = getColIndex(headerMap, ['saldo devedor atual', 'saldo', 'saldo devedor'], 4);

  const tokens = tokenize(alvo);

  // ✅ Se não veio alvo, mas veio "de X para Y", tentamos localizar por saldo antigo
  const allowSearchByOldSaldoOnly = tokens.length === 0 && oldSaldo !== null;

  if (tokens.length === 0 && !allowSearchByOldSaldoOnly) {
    await msg.reply('Qual dívida você quer atualizar? Ex: "Atualizar dívida do Pedro para 70".');
    return true;
  }

  const candidates = allData
    .map((row, index) => ({ row, index }))
    .filter(x => x.index !== 0 && Array.isArray(x.row))
    .map(x => {
      const nome = normalizeText(x.row[colNome] || '');
      const credor = normalizeText(x.row[colCredor] || '');
      const hay = `${nome} ${credor}`.trim();

    // score por tokens
    let tokenScore = 0;
    if (tokens.length > 0) {
        for (const t of tokens) {
          if (hay.includes(t)) tokenScore += 1;
        }
        // regra de segurança: se 2+ tokens, exige 2 matches
        if (tokens.length >= 2 && tokenScore < 2) tokenScore = 0;
    }

    // bônus por saldo antigo (se informado)
    let oldSaldoScore = 0;
    if (oldSaldo !== null) {
        const rowSaldo = parseHumanAmount(String(x.row[colSaldo] || ''));
        if (rowSaldo !== null && Math.abs(rowSaldo - oldSaldo) < 0.01) {
          oldSaldoScore = 100; // forte pra desambiguar
        }
    }

    // se só podemos buscar por oldSaldo, ignore tokenScore
    const score = allowSearchByOldSaldoOnly ? oldSaldoScore : (tokenScore * 10 + oldSaldoScore);

    return { ...x, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    await msg.reply(`Não encontrei nenhuma dívida correspondente a "${alvo || 'esse filtro'}".`);
    return true;
  }

  const bestScore = candidates[0].score;
  const strong = candidates.filter(c => c.score === bestScore).slice(0, 10);

  if (strong.length > 1) {
    userStateManager.setState(senderId, {
      action: 'confirming_debt_update',
      data: {
        newSaldo,
        colSaldo,
        matches: strong.map(x => ({
          sheetRowIndex: x.index,
          preview: {
            nome: x.row[colNome] || '',
            credor: x.row[colCredor] || '',
            saldoAtual: x.row[colSaldo] || ''
          }
        }))
      }
    });

    let msgList = `Encontrei ${strong.length} dívidas que batem com o pedido. Qual você quer atualizar para ${newSaldo}?\n\n`;
    strong.forEach((m, i) => {
      msgList += `*${i + 1}.* ${m.row[colNome] || ''} | ${m.row[colCredor] || ''} | saldo atual: ${m.row[colSaldo] || ''}\n`;
    });
    msgList += `\nResponda com o número (ex: 1). Ou digite "cancelar".`;

    await msg.reply(msgList);
    return true;
  }

  const match = strong[0];
  const rowNumber = match.index + 1;
  const colLetter = indexToColumnLetter(colSaldo);
  const range = `Dívidas!${colLetter}${rowNumber}`;

  await updateRowInSheet(range, [newSaldo]);
  await msg.reply(`✅ Dívida atualizada com sucesso. Novo saldo: ${newSaldo}.`);
  return true;
}

async function confirmDebtUpdateSelection(msg) {
  const senderId = msg.author || msg.from;
  const state = userStateManager.getState(senderId);
  if (!state || state.action !== 'confirming_debt_update') return false;

  const bodyNorm = normalizeText(msg.body || '');

  if (['cancelar', 'cancela', 'nao', 'não', 'n'].includes(bodyNorm)) {
    userStateManager.clearState(senderId);
    await msg.reply('Ok, atualização cancelada.');
    return true;
  }

  const selection = parseInt(String(msg.body || '').trim(), 10);
  if (Number.isNaN(selection) || selection < 1 || selection > state.data.matches.length) {
    await msg.reply('Seleção inválida. Responda com um número da lista ou "cancelar".');
    return true;
  }

  const chosen = state.data.matches[selection - 1];
  const rowNumber = chosen.sheetRowIndex + 1;
  const colLetter = indexToColumnLetter(state.data.colSaldo);
  const range = `Dívidas!${colLetter}${rowNumber}`;

  await updateRowInSheet(range, [state.data.newSaldo]);

  userStateManager.clearState(senderId);
  await msg.reply(`✅ Dívida atualizada com sucesso. Novo saldo: ${state.data.newSaldo}.`);
  return true;
}

module.exports = { startDebtUpdate, confirmDebtUpdateSelection };