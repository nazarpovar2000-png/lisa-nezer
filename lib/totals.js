// The single source of truth for money. Implements 03-spec.md section 2 exactly.
// Money is integer cents. Rates are decimal strings with up to 4 decimals ("0.0825").

import { normalizeSelection, indexItems, RATE_PATTERN } from './catalog.js';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents) {
  return usd.format(cents / 100);
}

// "0.0825" -> 825 (units of 1e-4). Throws on malformed input.
export function rateUnits(rate) {
  if (typeof rate !== 'string' || !RATE_PATTERN.test(rate)) {
    throw new Error(`invalid rate: ${rate}`);
  }
  const [whole, fraction = ''] = rate.split('.');
  return Number(whole) * 10000 + Number(fraction.padEnd(4, '0'));
}

// round(n / d), halves rounded up. Valid for non-negative integers.
export function divRoundHalfUp(n, d) {
  return Math.floor((2 * n + d) / (2 * d));
}

export function computeTotals(catalog, selection) {
  const items = indexItems(catalog);
  const lines = [];
  let laborSubtotal = 0;
  let materialsSubtotal = 0;
  for (const entry of normalizeSelection(catalog, selection)) {
    if (!entry.included) continue;
    const level = items.get(entry.itemId).levels[entry.level];
    laborSubtotal += level.labor;
    materialsSubtotal += level.materials;
    lines.push({ itemId: entry.itemId, level: entry.level, labor: level.labor, materials: level.materials });
  }
  const subtotal = laborSubtotal + materialsSubtotal;
  const tax = divRoundHalfUp(laborSubtotal * rateUnits(catalog.taxRate), 10000);
  const contingency = divRoundHalfUp(subtotal * rateUnits(catalog.contingencyRate), 10000);
  const total = subtotal + tax + contingency;
  return { lines, laborSubtotal, materialsSubtotal, subtotal, tax, contingency, total };
}
