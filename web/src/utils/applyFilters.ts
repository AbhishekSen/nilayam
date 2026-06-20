import { parseTypologies } from './parseTypologies';
import type {
  FilterSchema,
  FilterState,
  FilterValue,
  RangeValue,
  DateRangeValue,
} from '../types/filters';

function isEmpty(val: FilterValue | undefined): boolean {
  if (val == null) return true;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'string') return val === '';
  if (typeof val === 'object') {
    return Object.values(val).every((v) => v == null || v === '');
  }
  return false;
}

export function applyFilters<T extends object>(
  rows: T[],
  schema: FilterSchema,
  state: FilterState,
): T[] {
  return rows.filter((row) => {
    const r = row as unknown as Record<string, unknown>;
    for (const f of schema) {
      const val = state[f.field];
      if (isEmpty(val)) continue;

      switch (f.type) {
        case 'text': {
          const haystack = String(r[f.field] ?? '').toLowerCase();
          if (!haystack.includes(String(val).toLowerCase())) return false;
          break;
        }
        case 'multiSelect': {
          const arr = val as string[];
          if (!arr.includes(String(r[f.field]))) return false;
          break;
        }
        case 'multiTypology': {
          const arr = val as string[];
          const tys = parseTypologies(r[f.field]);
          if (!tys.some((t) => arr.includes(t))) return false;
          break;
        }
        case 'boolean': {
          if (val === 'any') continue;
          const flag = Number(r[f.field]) === 1;
          if (val === 'yes' && !flag) return false;
          if (val === 'no' && flag) return false;
          break;
        }
        case 'range': {
          const rv = val as RangeValue;
          const n = Number(r[f.field]);
          if (Number.isNaN(n)) return false;
          if (rv.min != null && n < rv.min) return false;
          if (rv.max != null && n > rv.max) return false;
          break;
        }
        case 'dateRange': {
          const rv = val as DateRangeValue;
          const t = new Date(r[f.field] as string).getTime();
          if (Number.isNaN(t)) return false;
          if (rv.from && t < new Date(rv.from).getTime()) return false;
          // include the entire `to` day (add 1 day - 1ms)
          if (rv.to && t > new Date(rv.to).getTime() + 86400000 - 1) return false;
          break;
        }
        default:
          break;
      }
    }
    return true;
  });
}
