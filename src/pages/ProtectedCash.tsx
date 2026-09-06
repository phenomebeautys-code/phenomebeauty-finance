import type { FinancePocket, FinancePocketSnapshot } from '../lib/types'
import type { YocoPocketTransfer } from '../lib/useFinanceData'
import { formatRands } from '../lib/money'
import { SectionCard, SourceBadge, FigureRow, NotConnectedNote } from '../components/SectionCard'

export function ProtectedCash({
  pockets,
  snapshots,
  pocketTransfers,
}: {
  pockets: FinancePocket[]
  snapshots: FinancePocketSnapshot[]
  pocketTransfers: YocoPocketTransfer[]
}) {
  const latestSnapshot = snapshots[0]
  const totalWithdrawnCents = pocketTransfers.reduce((sum, t) => sum + t.signed_amount_cents, 0)

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
            Yoco's API doesn't publish a Savings/Pockets balance endpoint, so a running total
            can't be pulled automatically — a manual snapshot is the only way to record the actual
            balance here. See "Pocket transfers from bank statements" below for real, automatically
            synced activity in the meantime.
          </NotConnectedNote>
        )}
      </SectionCard>

      <SectionCard
        eyebrow="Pocket transfers from bank statements"
        title={pocketTransfers.length > 0 ? `${pocketTransfers.length} transfer${pocketTransfers.length === 1 ? '' : 's'} found` : undefined}
        status={<SourceBadge state={pocketTransfers.length > 0 ? 'live' : 'not_connected'} />}
      >
        {pocketTransfers.length > 0 ? (
          <>
            <FigureRow label="Total moved from Savings to main account" value={formatRands(totalWithdrawnCents)} emphasis />
            {pocketTransfers.slice(0, 10).map((t) => (
              <FigureRow key={t.id} label={`${t.transaction_date} — ${t.description}`} value={formatRands(t.signed_amount_cents)} muted />
            ))}
            <NotConnectedNote>
              These are FNB statement lines ("Payshap Credit Yoco Pockets...") showing money moving
              from Yoco Savings back into the main account — real and automatically synced whenever
              an FNB statement is imported. This only shows withdrawals: top-ups into a pocket happen
              inside Yoco's own systems and never touch FNB, so this can't reconstruct a full running
              Savings balance on its own.
            </NotConnectedNote>
          </>
        ) : (
          <NotConnectedNote>
            No Yoco Pockets transfer activity found in imported FNB statements yet.
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
