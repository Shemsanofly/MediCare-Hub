import { v4 as uuidv4 } from 'uuid';

export function generateId() {
  return uuidv4();
}

export function nowISO() {
  return new Date().toISOString();
}

export function formatDecimal(value, decimals = 2) {
  const num = Number(value);
  if (Number.isNaN(num)) return '0.00';
  return num.toFixed(decimals);
}

export function toBoolean(value) {
  return value === 1 || value === true || value === '1' || value === 'true';
}

export function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString();
}
