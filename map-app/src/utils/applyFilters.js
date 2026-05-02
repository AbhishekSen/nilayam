import { parseTypologies } from './parseTypologies';

function isEmpty(val) {
  if (val == null) return true;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'string') return val === '';
  if (typeof val === 'object') {
    return Object.values(val).every((v) => v == null || v === '');
  }
  return false;
}

export function applyFilters(rows, schema, state) {
  return rows.filter((row) => {
    for (const f of schema) {
      const val = state[f.field];
      if (isEmpty(val)) continue;

      switch (f.type) {
        case 'text': {
          const haystack = String(row[f.field] ?? '').toLowerCase();
          if (!haystack.includes(String(val).toLowerCase())) return false;
          break;
        }
        case 'multiSelect': {
          if (!val.includes(String(row[f.field]))) return false;
          break;
        }
        case 'multiTypology': {
          const tys = parseTypologies(row[f.field]);
          if (!tys.some((t) => val.includes(t))) return false;
          break;
        }
        case 'boolean': {
          if (val === 'any') continue;
          const flag = Number(row[f.field]) === 1;
          if (val === 'yes' && !flag) return false;
          if (val === 'no' && flag) return false;
          break;
        }
        case 'range': {
          const n = Number(row[f.field]);
          if (Number.isNaN(n)) return false;
          if (val.min != null && n < val.min) return false;
          if (val.max != null && n > val.max) return false;
          break;
        }
        case 'dateRange': {
          const t = new Date(row[f.field]).getTime();
          if (Number.isNaN(t)) return false;
          if (val.from && t < new Date(val.from).getTime()) return false;
          // include the entire `to` day (add 1 day - 1ms)
          if (val.to && t > new Date(val.to).getTime() + 86400000 - 1) return false;
          break;
        }
        default:
          break;
      }
    }
    return true;
  });
}
