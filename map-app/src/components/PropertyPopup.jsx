const SKIP_KEYS = new Set(['latitude', 'longitude', 'slug', 'image', 'alt']);

function formatLabel(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase());
}

export default function PropertyPopup({ property }) {
  return (
    <div style={{ maxWidth: 300, maxHeight: 300, overflow: 'auto' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>
        {property.name || 'Unnamed Property'}
      </h3>
      {property.image && (
        <img
          src={property.image}
          alt={property.alt || property.name}
          style={{ width: '100%', borderRadius: 4, marginBottom: 8 }}
        />
      )}
      <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {Object.entries(property)
            .filter(([key, val]) => !SKIP_KEYS.has(key) && val != null && val !== '')
            .map(([key, val]) => (
              <tr key={key}>
                <td style={{ fontWeight: 600, padding: '2px 8px 2px 0', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  {formatLabel(key)}
                </td>
                <td style={{ padding: '2px 0' }}>{String(val)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
