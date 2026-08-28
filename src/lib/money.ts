export function formatRands(cents: number): string {
  const rands = cents / 100
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(rands)
}

export function randsToCents(rands: string | number): number {
  const value = typeof rands === 'string' ? parseFloat(rands.replace(/[^0-9.-]/g, '')) : rands
  if (Number.isNaN(value)) return 0
  return Math.round(value * 100)
}
