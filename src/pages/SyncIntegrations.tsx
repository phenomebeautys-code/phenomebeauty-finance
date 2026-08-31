import type { YocoSyncRun } from '../lib/types'
import { SectionCard, SourceBadge } from '../components/SectionCard'
import { Pill } from '../components/Pill'
import { relativeTime } from '../lib/time'

const RUN_STATUS_TONE: Record<YocoSyncRun['status'], { tone: 'good' | 'warn' | 'clay' | 'neutral'; label: string }> = {
  completed: { tone: 'good', label: 'Completed' },
  completed_with_errors: { tone: 'clay', label: 'Completed with errors' },
  running: { tone: 'clay', label: 'Running' },
  failed: { tone: 'warn', label: 'Failed' },
}

export function SyncIntegrations({ syncRuns }: { syncRuns: YocoSyncRun[] }) {
  const lastYocoRun = syncRuns[0]
  const yocoHealthy = Boolean(
    lastYocoRun && lastYocoRun.status === 'completed' &&
      Date.now() - new Date(lastYocoRun.completed_at ?? lastYocoRun.started_at).getTime() < 1000 * 60 * 60 * 48
  )

  const SOURCES: { key: string; label: string; connected: boolean }[] = [
    { key: 'yoco', label: 'Yoco', connected: yocoHealthy },
    { key: 'nextslot', label: 'NextSlot', connected: true },
    { key: 'shop_admin', label: 'Shop Admin', connected: true },
    { key: 'fnb', label: 'FNB', connected: false },
    { key: 'google_drive', label: 'Google Drive', connected: false },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 4px' }}>
          Sync &amp; Integrations
        </h2>
        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 14 }}>
          Finance reads from these sources. It never writes back to them.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {SOURCES.map((s) => (
          <SectionCard
            key={s.key}
            eyebrow={s.label}
            status={<SourceBadge state={s.connected ? 'live' : 'not_connected'} />}
          >
            {s.key === 'yoco' && lastYocoRun ? (
              <div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Last sync {relativeTime(lastYocoRun.completed_at ?? lastYocoRun.started_at)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                  {lastYocoRun.records_read} read · {lastYocoRun.records_inserted} inserted ·{' '}
                  {lastYocoRun.records_updated} updated
                  {lastYocoRun.records_failed > 0 && ` · ${lastYocoRun.records_failed} failed`}
                </div>
              </div>
            ) : s.connected ? (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>
                Connected via read-only sync.
              </p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Not connected yet.</p>
            )}
          </SectionCard>
        ))}
      </div>

      <SectionCard eyebrow="Yoco sync history" title="Recent runs">
        {syncRuns.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>No sync runs recorded yet.</p>
        ) : (
          <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
            {syncRuns.map((run, i) => (
              <div
                key={run.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5 }}>
                    {run.sync_scope} · {run.sync_mode}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                    Started {relativeTime(run.started_at)}
                    {run.error_summary && ` · ${run.error_summary}`}
                  </div>
                </div>
                <Pill label={RUN_STATUS_TONE[run.status].label} tone={RUN_STATUS_TONE[run.status].tone} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
