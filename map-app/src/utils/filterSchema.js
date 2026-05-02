import { parseTypologies } from './parseTypologies';

const SKIP_FIELDS = new Set([
  'id', 'slug', 'image', 'alt', 'latitude', 'longitude',
  'developerId', 'micromarketId',
]);

const SEARCH_FIELDS = new Set(['name']);
const DATE_FIELDS = new Set(['possessionDate']);
const BOOLEAN_FIELDS = new Set([
  'petPark', 'squash', 'pharmacy', 'basketball', 'heatedPool',
]);

const FIELD_LABELS = {
  minPrice: 'Min Price (₹)',
  maxPrice: 'Max Price (₹)',
  minSaleableArea: 'Min Saleable Area (sqft)',
  maxSaleableArea: 'Max Saleable Area (sqft)',
  propscore: 'PropScore',
  metroProximity: 'Metro Proximity (km)',
  micromarketPriceAverage: 'Micromarket Avg Price (₹/sqft)',
  unitDensity: 'Unit Density',
  landArea: 'Land Area (acres)',
  petPark: 'Pet Park',
  heatedPool: 'Heated Pool',
  developerGrade: 'Developer Grade',
  developerName: 'Developer',
  projectStatus: 'Project Status',
  possessionDate: 'Possession Date',
};

const TYPE_RANK = {
  text: 0,
  multiSelect: 1,
  multiTypology: 1,
  boolean: 2,
  range: 3,
  dateRange: 4,
};

function formatLabel(key) {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase());
}

function nonEmptyValues(rows, field) {
  const out = [];
  for (const r of rows) {
    const v = r[field];
    if (v === null || v === undefined || v === '') continue;
    out.push(v);
  }
  return out;
}

export function inferFilterSchema(rows) {
  if (!rows.length) return [];

  const fields = Object.keys(rows[0]);
  const filters = [];

  for (const field of fields) {
    if (SKIP_FIELDS.has(field)) continue;

    if (SEARCH_FIELDS.has(field)) {
      filters.push({ field, label: formatLabel(field), type: 'text' });
      continue;
    }

    if (DATE_FIELDS.has(field)) {
      filters.push({ field, label: formatLabel(field), type: 'dateRange' });
      continue;
    }

    if (BOOLEAN_FIELDS.has(field)) {
      filters.push({ field, label: formatLabel(field), type: 'boolean' });
      continue;
    }

    if (field === 'typologies') {
      const all = new Set();
      for (const r of rows) {
        for (const t of parseTypologies(r[field])) all.add(t);
      }
      if (all.size > 1) {
        filters.push({
          field, label: formatLabel(field), type: 'multiTypology',
          options: [...all].sort(),
        });
      }
      continue;
    }

    const values = nonEmptyValues(rows, field);
    if (values.length === 0) continue;

    const allNumeric = values.every(
      (v) => typeof v === 'number' || (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)))
    );

    if (allNumeric) {
      const nums = values.map(Number);
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      if (min === max) continue;
      const allInt = nums.every((n) => Number.isInteger(n));
      filters.push({
        field, label: formatLabel(field), type: 'range',
        min, max, step: allInt ? 1 : 0.01,
      });
      continue;
    }

    const unique = [...new Set(values.map(String))];
    if (unique.length <= 1) continue;
    if (unique.length <= 100) {
      filters.push({
        field, label: formatLabel(field), type: 'multiSelect',
        options: unique.sort(),
      });
    } else {
      filters.push({ field, label: formatLabel(field), type: 'text' });
    }
  }

  filters.sort((a, b) => (TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9));
  return filters;
}
