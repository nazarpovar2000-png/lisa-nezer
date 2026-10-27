// Pure catalog and selection rules. Shared by the browser UI, Pages Functions and tests.
// No DOM and no I/O in this file.

export const RATE_PATTERN = /^\d+(\.\d{1,4})?$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PHOTO_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}\.(jpg|jpeg|png|webp)$/;
const MAX_NOTES = 50;
const MAX_NOTE_LENGTH = 1000;

export class ValidationError extends Error {}

export function indexItems(catalog) {
  const items = new Map();
  for (const room of catalog.rooms) {
    for (const item of room.items) items.set(item.id, item);
  }
  return items;
}

// Returns a list of human-readable problems. Empty list means the catalog is valid.
export function validateCatalog(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== 'object') return ['catalog must be an object'];
  if (!ID_PATTERN.test(String(catalog.clientId))) errors.push('clientId must be a slug');
  if (catalog.title !== undefined && (!catalog.title.en || !catalog.title.ru)) errors.push('title needs en and ru');
  if (!RATE_PATTERN.test(String(catalog.taxRate))) errors.push('taxRate must be a decimal string');
  if (!RATE_PATTERN.test(String(catalog.contingencyRate))) errors.push('contingencyRate must be a decimal string');
  if (!Array.isArray(catalog.rooms) || catalog.rooms.length === 0) {
    errors.push('rooms must be a non-empty array');
    return errors;
  }
  const seen = new Set();
  for (const room of catalog.rooms) {
    if (!ID_PATTERN.test(String(room.id))) errors.push(`room id invalid: ${room.id}`);
    if (!room.title?.en || !room.title?.ru) errors.push(`room ${room.id}: title needs en and ru`);
    if (!Array.isArray(room.items)) {
      errors.push(`room ${room.id}: items must be an array`);
      continue;
    }
    for (const item of room.items) {
      if (!ID_PATTERN.test(String(item.id))) {
        errors.push(`item id invalid: ${item.id}`);
      } else if (seen.has(item.id)) {
        errors.push(`duplicate item id: ${item.id}`);
      }
      seen.add(item.id);
      if (!item.title?.en || !item.title?.ru) errors.push(`item ${item.id}: title needs en and ru`);
      const levels = item.levels && typeof item.levels === 'object' ? item.levels : {};
      const names = Object.keys(levels);
      if (names.length === 0) errors.push(`item ${item.id}: no levels`);
      for (const name of names) {
        const level = levels[name];
        if (!Number.isSafeInteger(level?.labor) || level.labor < 0) {
          errors.push(`item ${item.id}/${name}: labor must be integer cents >= 0`);
        }
        if (!Number.isSafeInteger(level?.materials) || level.materials < 0) {
          errors.push(`item ${item.id}/${name}: materials must be integer cents >= 0`);
        }
        if (!level?.label?.en || !level?.label?.ru) errors.push(`item ${item.id}/${name}: label needs en and ru`);
      }
      if (!Object.hasOwn(levels, item.defaultLevel)) errors.push(`item ${item.id}: defaultLevel missing`);
      if (typeof item.defaultIncluded !== 'boolean') errors.push(`item ${item.id}: defaultIncluded must be boolean`);
      if (item.photos !== undefined) {
        if (!Array.isArray(item.photos) || item.photos.some((name) => !PHOTO_PATTERN.test(String(name)))) {
          errors.push(`item ${item.id}: photos must be file names like kitchen-1.jpg`);
        }
      }
    }
  }
  return errors;
}

// Fills in defaults for items the client did not send and validates what was sent.
// Output has one entry per catalog item, in catalog order.
export function normalizeSelection(catalog, selection = []) {
  if (!Array.isArray(selection)) throw new ValidationError('selection must be an array');
  const items = indexItems(catalog);
  const given = new Map();
  for (const entry of selection) {
    if (!entry || typeof entry.itemId !== 'string') throw new ValidationError('selection entry needs itemId');
    const item = items.get(entry.itemId);
    if (!item) throw new ValidationError(`unknown item: ${entry.itemId}`);
    if (given.has(entry.itemId)) throw new ValidationError(`duplicate item: ${entry.itemId}`);
    if (typeof entry.included !== 'boolean') throw new ValidationError(`included must be boolean: ${entry.itemId}`);
    const level = entry.level ?? item.defaultLevel;
    if (!Object.hasOwn(item.levels, level)) throw new ValidationError(`unknown level ${level} for ${entry.itemId}`);
    given.set(entry.itemId, { itemId: entry.itemId, included: entry.included, level });
  }
  return [...items.keys()].map((itemId) => {
    const item = items.get(itemId);
    return given.get(itemId) ?? { itemId, included: item.defaultIncluded, level: item.defaultLevel };
  });
}

export function validateNotes(catalog, notes = []) {
  if (!Array.isArray(notes) || notes.length > MAX_NOTES) {
    throw new ValidationError(`notes must be an array of at most ${MAX_NOTES}`);
  }
  const items = indexItems(catalog);
  return notes
    .map((note) => {
      if (!note || !items.has(note.itemId)) throw new ValidationError('note refers to unknown item');
      if (typeof note.text !== 'string' || note.text.length > MAX_NOTE_LENGTH) {
        throw new ValidationError(`note text must be a string up to ${MAX_NOTE_LENGTH} characters`);
      }
      return { itemId: note.itemId, text: note.text.trim() };
    })
    .filter((note) => note.text.length > 0);
}
