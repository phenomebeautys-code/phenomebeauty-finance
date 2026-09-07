// src/components/ToggleGroup.tsx
// A small segmented two-option toggle. Both buttons share a fixed min-width
// so multiple toggles line up symmetrically next to each other.
export function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [T, T]
  value: T
  onChange: (next: T) => void
}) {
  return (
    <span style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={value === opt ? 'primary-button' : 'secondary-button'}
          style={{
            fontSize: 12,
            padding: '4px 10px',
            minWidth: 72,
            borderRadius: 0,
            border: 'none',
            margin: 0,
          }}
        >
          {opt}
        </button>
      ))}
    </span>
  )
}
