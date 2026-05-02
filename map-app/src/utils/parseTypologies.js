export function parseTypologies(val) {
  if (val == null) return [];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val !== 'string') return [];
  const trimmed = val.trim();
  if (!trimmed) return [];
  try {
    const arr = JSON.parse(trimmed.replace(/'/g, '"'));
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}
