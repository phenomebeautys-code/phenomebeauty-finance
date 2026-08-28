interface IconProps {
  active?: boolean
}

const stroke = 1.6

export function LedgerIcon({ active }: IconProps) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="3.5" width="16" height="17" rx="2" stroke={active ? 'var(--rose)' : 'currentColor'} strokeWidth={stroke} />
      <path d="M8 8.5H16" stroke={active ? 'var(--rose)' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" />
      <path d="M8 12H16" stroke={active ? 'var(--rose)' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" />
      <path d="M8 15.5H12.5" stroke={active ? 'var(--rose)' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" />
    </svg>
  )
}

export function PlusCircleIcon({ active }: IconProps) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke={active ? 'var(--rose)' : 'currentColor'} strokeWidth={stroke} />
      <path d="M12 8.5V15.5" stroke={active ? 'var(--rose)' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" />
      <path d="M8.5 12H15.5" stroke={active ? 'var(--rose)' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" />
    </svg>
  )
}

export function ListIcon({ active }: IconProps) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
      <path d="M9 6.5H19" stroke={active ? 'var(--rose)' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" />
      <path d="M9 12H19" stroke={active ? 'var(--rose)' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" />
      <path d="M9 17.5H19" stroke={active ? 'var(--rose)' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" />
      <circle cx="5.3" cy="6.5" r="1.15" fill={active ? 'var(--rose)' : 'currentColor'} />
      <circle cx="5.3" cy="12" r="1.15" fill={active ? 'var(--rose)' : 'currentColor'} />
      <circle cx="5.3" cy="17.5" r="1.15" fill={active ? 'var(--rose)' : 'currentColor'} />
    </svg>
  )
}
