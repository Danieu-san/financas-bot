// src/utils/dateTimeNormalizer.js
const DEFAULT_TZ = 'America/Sao_Paulo';
// Brasil sem DST atualmente; usamos -03:00 como referência estável para conversão pt-BR -> UTC
const SP_OFFSET_HOURS = 3;

function normalizeConnectorAs(raw) {
  return String(raw || '')
    .trim()
    // transforma "10/01/2026 às 10:00" -> "10/01/2026 10:00"
    .replace(/\s*(?:às|as)\s*/gi, ' ');
}

function parsePtBrDateOnly(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;

  const [, dd, mm, yyyy] = m;
  const startDate = `${yyyy}-${mm}-${dd}`;

  // valida data (ex.: 32/01/2026 deve falhar)
  const startObj = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(startObj.getTime())) return null;

  const endObj = new Date(startObj);
  endObj.setDate(endObj.getDate() + 1);
  const endDate = endObj.toISOString().slice(0, 10);

  return { startDate, endDate };
}

function parsePtBrDateTimeToIso(raw) {
  const s = normalizeConnectorAs(raw);

  // DD/MM/AAAA HH:MM
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;

  const [, dd, mm, yyyy, hh, min] = m;
  const H = Number(hh);
  const M = Number(min);

  if (Number.isNaN(H) || Number.isNaN(M) || H < 0 || H > 23 || M < 0 || M > 59) return null;

  // Converte "horário SP" -> UTC ISO fixo (independe do timezone da máquina)
  const utcMillis = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), H + SP_OFFSET_HOURS, M, 0, 0);
  const d = new Date(utcMillis);
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString();
}

function parseIsoLikeToIso(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;

  // ISO sem timezone explícito -> assume São Paulo (-03:00)
  // ex.: 2026-01-07T09:00:00.000  -> 2026-01-07T09:00:00.000-03:00
  const looksIsoNoTz = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/.test(s);
  const candidate = looksIsoNoTz ? `${s}-03:00` : s;

  const ms = Date.parse(candidate);
  if (Number.isNaN(ms)) return null;

  return new Date(ms).toISOString();
}

function buildCalendarStartEnd(dataHora) {
  const raw = String(dataHora || '').trim();

  // 1) Date-only => all-day
  const dateOnly = parsePtBrDateOnly(raw);
  if (dateOnly) {
    return {
      start: { date: dateOnly.startDate },
      end: { date: dateOnly.endDate }
    };
  }

  // 2) pt-BR dateTime
  const isoFromPt = parsePtBrDateTimeToIso(raw);
  if (isoFromPt) {
    const startMillis = Date.parse(isoFromPt);
    const endIso = new Date(startMillis + 30 * 60 * 1000).toISOString();
    return {
      start: { dateTime: isoFromPt, timeZone: DEFAULT_TZ },
      end: { dateTime: endIso, timeZone: DEFAULT_TZ }
    };
  }

  // 3) ISO / parseável
  const iso = parseIsoLikeToIso(raw);
  if (iso) {
    const startMillis = Date.parse(iso);
    const endIso = new Date(startMillis + 30 * 60 * 1000).toISOString();
    return {
      start: { dateTime: iso, timeZone: DEFAULT_TZ },
      end: { dateTime: endIso, timeZone: DEFAULT_TZ }
    };
  }

  return null;
}

function normalizeRecurrenceToRrule(recurrenceRule) {
  if (!recurrenceRule) return null;

  const r = String(recurrenceRule).trim();
  if (!r) return null;

  if (/^RRULE:/i.test(r)) return r;
  if (/^FREQ=/i.test(r)) return `RRULE:${r}`;

  // fallback PT-BR (se a IA escorregar)
  const norm = r
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+as\s+\d{1,2}:\d{2}.*/g, '')
    .trim();

  if (['diariamente', 'todo dia', 'todos os dias', 'diario', 'diaria'].includes(norm)) return 'RRULE:FREQ=DAILY';
  if (['semanalmente', 'toda semana', 'semanal'].includes(norm)) return 'RRULE:FREQ=WEEKLY';
  if (['mensalmente', 'todo mes', 'todo mês', 'mensal'].includes(norm)) return 'RRULE:FREQ=MONTHLY';
  if (['anualmente', 'todo ano', 'anual'].includes(norm)) return 'RRULE:FREQ=YEARLY';

  return null;
}

module.exports = {
  buildCalendarStartEnd,
  normalizeRecurrenceToRrule
};