/**
 * Numeric input that works with both decimal separators.
 * iOS shows a "," key on the decimal keypad in many regions (Spain, most of Europe/LatAm), and
 * <input type="number"> silently rejects it. This is a text input with the decimal keypad that
 * turns "," into ".", drops anything that isn't a digit or a single separator, and passes the
 * cleaned value to onChange as a normal event, so callers stay unchanged.
 */
export function normalizeDecimal(raw) {
  let s = String(raw ?? '').replace(/,/g, '.').replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  return s;
}

export default function DecimalInput({ value, onChange, integer = false, min, max, step, type, ...rest }) {
  return (
    <input
      {...rest}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={value ?? ''}
      onChange={(e) => {
        let v = normalizeDecimal(e.target.value);
        if (integer) v = v.replace(/\..*$/, '');
        onChange?.({ ...e, target: { ...e.target, value: v } });
      }}
    />
  );
}
