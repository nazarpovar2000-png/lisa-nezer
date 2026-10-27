// Plain-text summary of a selection, sent by the client to the contractor.
// Written in Russian because the recipient reads Russian.
import { indexItems } from './catalog.js';
import { computeTotals, formatCents } from './totals.js';

const pick = (field) => field?.ru ?? field?.en ?? '';

export function buildSummary(catalog, entries, notes = []) {
  const items = indexItems(catalog);
  const roomOf = new Map();
  for (const room of catalog.rooms) for (const item of room.items) roomOf.set(item.id, room);
  const totals = computeTotals(catalog, entries);

  const lines = totals.lines.map((line) => {
    const item = items.get(line.itemId);
    const level = item.levels[line.level];
    return `- ${pick(roomOf.get(line.itemId).title)} / ${pick(item.title)} (${pick(level.label)}): работа ${formatCents(line.labor)}, материалы ${formatCents(line.materials)}`;
  });
  const noteLines = notes
    .filter((note) => items.has(note.itemId))
    .map((note) => `- ${pick(items.get(note.itemId).title)}: ${note.text}`);
  const tax = catalog.taxRate === '0' ? 'уточняется' : formatCents(totals.tax);

  return [
    catalog._demo ? 'ДЕМО-данные: числа-заглушки, это не предложение.' : null,
    `Смета: ${pick(catalog.title)}`,
    `Версия данных: ${catalog.catalogVersion}`,
    '',
    'Выбрано:',
    ...(lines.length ? lines : ['(ничего)']),
    '',
    `Работа: ${formatCents(totals.laborSubtotal)}`,
    `Материалы: ${formatCents(totals.materialsSubtotal)}`,
    `Налог на работу: ${tax}`,
    `Резерв (${Math.round(Number(catalog.contingencyRate) * 100)}%): ${formatCents(totals.contingency)}`,
    `Итого: ${formatCents(totals.total)}`,
    '',
    'Вопросы:',
    ...(noteLines.length ? noteLines : ['(нет)']),
  ]
    .filter((line) => line !== null)
    .join('\n');
}
