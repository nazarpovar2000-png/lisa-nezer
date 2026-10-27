// Client estimate page (v1, static). No API, no login. Data comes from data/catalog.json.
// Selection is kept on the client's own device (localStorage). "Send" hands the summary to the system share sheet.
import { computeTotals, formatCents } from './lib/totals.js';
import { normalizeSelection } from './lib/catalog.js';
import { buildSummary } from './lib/summary.js';

const app = document.getElementById('app');
const STRINGS = {
  en: {
    labor: 'Labor', materials: 'Materials', tax: 'Tax on labor', taxPending: 'Tax: to be confirmed',
    contingency: 'Contingency', total: 'Total', send: 'Send my selection', sent: 'Sent.',
    copied: 'Copied. Paste it into a message to Nazar.', sendFail: 'Could not send. Copy the text below and send it to Nazar.',
    include: 'Include', level: 'Level', notes: 'Notes or questions', notesPlaceholder: 'Ask a question about this item',
    disclaimer: 'This is an estimate, not a contract.', nothingChosen: 'Nothing selected yet.',
    language: 'Русский', zoomHint: 'Tap a photo to zoom', demo: 'DEMO: placeholder prices, not an offer.',
    loadFail: 'Could not load the estimate. Please try again later.',
  },
  ru: {
    labor: 'Работа', materials: 'Материалы', tax: 'Налог на работу', taxPending: 'Налог: уточняется',
    contingency: 'Резерв', total: 'Итого', send: 'Отправить выбор', sent: 'Отправлено.',
    copied: 'Скопировано. Вставьте в сообщение Назару.', sendFail: 'Не удалось отправить. Скопируйте текст ниже и отправьте Назару.',
    include: 'Включить', level: 'Уровень', notes: 'Заметки или вопросы', notesPlaceholder: 'Задайте вопрос по этой позиции',
    disclaimer: 'Это смета, а не договор.', nothingChosen: 'Пока ничего не выбрано.',
    language: 'English', zoomHint: 'Нажмите на фото, чтобы увеличить', demo: 'ДЕМО: числа-заглушки, это не предложение.',
    loadFail: 'Не удалось загрузить смету. Попробуйте позже.',
  },
};

const LANG_KEY = 'lisa-lang';
const SELECTION_KEY = 'lisa-estimate-selection';
let lang = localStorage.getItem(LANG_KEY) || (navigator.language?.startsWith('ru') ? 'ru' : 'en');
let catalog = null;
const selection = new Map();
const notes = new Map();
let totalsEl = null;
let statusEl = null;

const t = (key) => STRINGS[lang][key] ?? STRINGS.en[key];
const pick = (field) => field?.[lang] ?? field?.en ?? '';
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

async function load() {
  const res = await fetch('data/catalog.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  catalog = await res.json();
  restoreSelection();
  render();
}

function restoreSelection() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(SELECTION_KEY) || 'null');
  } catch {
    saved = null;
  }
  try {
    for (const entry of normalizeSelection(catalog, saved?.selection ?? [])) selection.set(entry.itemId, entry);
  } catch {
    // Saved choices no longer match the catalog (items renamed or removed): fall back to defaults.
    selection.clear();
    for (const entry of normalizeSelection(catalog)) selection.set(entry.itemId, entry);
  }
  for (const [itemId, text] of saved?.notes ?? []) {
    if (selection.has(itemId) && typeof text === 'string') notes.set(itemId, text);
  }
}

function persist() {
  localStorage.setItem(
    SELECTION_KEY,
    JSON.stringify({ selection: [...selection.values()], notes: [...notes] }),
  );
}

function render() {
  app.replaceChildren();
  app.append(renderHeader());
  if (catalog._demo) app.append(el('p', 'notice', t('demo')));
  for (const room of catalog.rooms) app.append(renderRoom(room));
  totalsEl = el('section', 'totals');
  app.append(totalsEl, renderSendForm());
  updateTotals();
}

function renderHeader() {
  const header = el('header', 'top');
  header.append(el('h1', '', pick(catalog.title)));
  const switcher = el('button', 'lang', t('language'));
  switcher.type = 'button';
  switcher.addEventListener('click', () => {
    lang = lang === 'en' ? 'ru' : 'en';
    localStorage.setItem(LANG_KEY, lang);
    render();
  });
  header.append(switcher);
  return header;
}

function renderRoom(room) {
  const section = el('section', 'room');
  section.append(el('h2', '', pick(room.title)));
  for (const item of room.items) section.append(renderItem(item));
  return section;
}

function renderItem(item) {
  const state = selection.get(item.id);
  const card = el('article', 'item');
  card.classList.toggle('excluded', !state.included);

  const head = el('label', 'item-head');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = state.included;
  checkbox.setAttribute('aria-label', t('include'));
  checkbox.addEventListener('change', () => {
    state.included = checkbox.checked;
    card.classList.toggle('excluded', !state.included);
    updateTotals();
  });
  head.append(checkbox, el('span', 'title', pick(item.title)));
  card.append(head);

  if (item.description) card.append(el('p', 'desc', pick(item.description)));

  if (item.photos?.length) {
    const gallery = el('div', 'photos');
    for (const name of item.photos) {
      const img = document.createElement('img');
      img.src = `photos/${encodeURIComponent(name)}`;
      img.alt = pick(item.title);
      img.loading = 'lazy';
      img.addEventListener('click', () => img.classList.toggle('zoomed'));
      gallery.append(img);
    }
    card.append(gallery, el('p', 'hint', t('zoomHint')));
  }

  const levels = el('fieldset', 'levels');
  levels.append(el('legend', '', t('level')));
  for (const name of Object.keys(item.levels)) {
    const label = el('label', 'level');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `level-${item.id}`;
    radio.value = name;
    radio.checked = state.level === name;
    radio.addEventListener('change', () => {
      state.level = name;
      updateTotals();
    });
    label.append(radio, el('span', '', pick(item.levels[name].label)));
    levels.append(label);
  }
  const amounts = el('p', 'amounts', '');
  amounts.dataset.amounts = item.id;
  card.append(levels, amounts, renderNotes(item));
  return card;
}

function renderNotes(item) {
  const label = el('label', 'notes');
  label.append(el('span', '', t('notes')));
  const area = document.createElement('textarea');
  area.maxLength = 1000;
  area.rows = 2;
  area.placeholder = t('notesPlaceholder');
  area.value = notes.get(item.id) ?? '';
  area.addEventListener('input', () => {
    notes.set(item.id, area.value);
    persist();
  });
  label.append(area);
  return label;
}

function row(label, cents, className) {
  const line = el('div', `row ${className ?? ''}`.trim());
  line.append(el('span', '', label), el('span', 'value', formatCents(cents)));
  return line;
}

function updateTotals() {
  const entries = [...selection.values()];
  const totals = computeTotals(catalog, entries);
  const rate = Math.round(Number(catalog.contingencyRate) * 100);

  totalsEl.replaceChildren(
    row(t('labor'), totals.laborSubtotal),
    row(t('materials'), totals.materialsSubtotal),
    catalog.taxRate === '0' ? el('p', 'hint', t('taxPending')) : row(t('tax'), totals.tax),
    row(`${t('contingency')} (${rate}%)`, totals.contingency),
    row(t('total'), totals.total, 'total'),
    el('p', 'disclaimer', t('disclaimer')),
  );
  if (totals.lines.length === 0) totalsEl.append(el('p', 'hint', t('nothingChosen')));

  const items = catalog.rooms.flatMap((room) => room.items);
  for (const node of document.querySelectorAll('[data-amounts]')) {
    const entry = selection.get(node.dataset.amounts);
    const item = items.find((i) => i.id === entry.itemId);
    const level = item.levels[entry.level];
    node.textContent = entry.included
      ? `${t('labor')}: ${formatCents(level.labor)} · ${t('materials')}: ${formatCents(level.materials)}`
      : '';
  }
  persist();
}

function renderSendForm() {
  const form = el('form', 'send');
  const button = el('button', 'primary', t('send'));
  button.type = 'submit';
  statusEl = el('p', 'status', '');
  form.append(button, statusEl);
  form.addEventListener('submit', (event) => send(event));
  return form;
}

function currentSummary() {
  const entries = [...selection.values()];
  const notePairs = [...notes].filter(([, text]) => text.trim()).map(([itemId, text]) => ({ itemId, text: text.trim() }));
  return buildSummary(catalog, entries, notePairs);
}

async function send(event) {
  event.preventDefault();
  const text = currentSummary();
  if (navigator.share) {
    try {
      await navigator.share({ title: pick(catalog.title), text });
      statusEl.textContent = t('sent');
    } catch (err) {
      if (err?.name !== 'AbortError') showFallback(text);
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    statusEl.textContent = t('copied');
  } catch {
    showFallback(text);
  }
}

function showFallback(text) {
  statusEl.textContent = t('sendFail');
  const area = el('textarea', 'fallback', text);
  area.readOnly = true;
  area.rows = 12;
  statusEl.after(area);
  area.select();
}

load().catch(() => {
  app.textContent = STRINGS.en.loadFail + ' / ' + STRINGS.ru.loadFail;
});
