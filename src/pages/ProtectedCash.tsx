import type { FinancePocket, FinancePocketSnapshot } from '../lib/types'
import { formatRands } from '../lib/money'
import { SectionCard, SourceBadge, FigureRow, NotConnectedNote } from '../components/SectionCard'

export function ProtectedCash({
  pockets,
  snapshots,
}: {
  pockets: FinancePocket[]
  snapshots: FinancePocketSnapshot[]
}) {
  const latestSnapshot = snapshots[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 4px' }}>
          Protected Cash
        </h2>
        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 14 }}>
          Yoco Savings pockets and reserve targets — cash that is set aside, not for daily
          spending.
        </p>
      </header>

      <SectionCard
        eyebrow="Yoco Savings"
        title="Latest snapshot"
        status={<SourceBadge state={latestSnapshot ? 'live' : 'not_connected'} />}
      >
        {latestSnapshot ? (
          <>
            <FigureRow label="Total savings" value={formatRands(latestSnapshot.total_savings_cents)} emphasis />
            {latestSnapshot.savings_rate_percent != null && (
              <FigureRow label="Savings rate" value={`${latestSnapshot.savings_rate_percent}%`} />
            )}
          </>
        ) : (
          <NotConnectedNote>
            No Yoco Savings snapshot has been captured yet. Manual snapshots are the source until
            a verified Yoco Savings API is available.
          </NotConnectedNote>
        )}
      </SectionCard>

      <SectionCard eyebrow="Reserve pockets" title={pockets.length > 0 ? undefined : 'None set up yet'}>
        {pockets.length === 0 ? (
          <NotConnectedNote>
            No reserve pockets configured. Set up pockets for fuel buffer, operating floor, and
            vehicle settlement under Settings → Reserves.
          </NotConnectedNote>
        ) : (
          pockets.map((p) => (
            <FigureRow
              key={p.id}
              label={p.name}
              value={p.target_amount_cents != null ? `Target ${formatRands(p.target_amount_cents)}` : 'No target set'}
            />
          ))
        )}
      </SectionCard>
    </div>
  )
}
