import { useCallback, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from './supabase'
import type {
  YocoPayment,
  YocoPayout,
  YocoSyncRun,
  ReconciliationMatch,
  FinanceBankImport,
  FinanceExpense,
  FinancePersonalAdvance,
  FinancePocket,
  FinancePocketSnapshot,
} from './types'

export interface FinanceOverviewData {
  yocoPayments: YocoPayment[]
  yocoPayouts: YocoPayout[]
  syncRuns: YocoSyncRun[]
  reconciliationMatches: ReconciliationMatch[]
  bankImports: FinanceBankImport[]
  expenses: FinanceExpense[]
  advances: FinancePersonalAdvance[]
  pockets: FinancePocket[]
  pocketSnapshots: FinancePocketSnapshot[]
}

const EMPTY: FinanceOverviewData = {
  yocoPayments: [],
  yocoPayouts: [],
  syncRuns: [],
  reconciliationMatches: [],
  bankImports: [],
  expenses: [],
  advances: [],
  pockets: [],
  pocketSnapshots: [],
}

/**
 * Reads the finance-wide tables beyond finance_sales: Yoco payments/payouts,
 * sync run history, reconciliation matches, FNB imports, expenses, advances,
 * and savings pockets. Read-only — Finance never writes to source systems.
 */
export function useFinanceData() {
  const [data, setData] = useState<FinanceOverviewData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (!isSupabaseConfigured) {
      setData(EMPTY)
      setLoading(false)
      return
    }

    const [
      yocoPayments,
      yocoPayouts,
      syncRuns,
      reconciliationMatches,
      bankImports,
      expenses,
      advances,
      pockets,
      pocketSnapshots,
    ] = await Promise.all([
      supabase.from('yoco_payments').select('*').order('yoco_created_at', { ascending: false }).limit(200),
      supabase.from('yoco_payouts').select('*').order('payout_date', { ascending: false }).limit(100),
      supabase.from('yoco_sync_runs').select('*').order('started_at', { ascending: false }).limit(20),
      supabase.from('finance_reconciliation_matches').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('finance_bank_imports').select('*').order('imported_at', { ascending: false }).limit(20),
      supabase.from('finance_expenses').select('*').order('expense_date', { ascending: false }).limit(200),
      supabase.from('finance_personal_advances').select('*').order('advance_date', { ascending: false }).limit(200),
      supabase.from('finance_pockets').select('*'),
      supabase.from('finance_pocket_snapshots').select('*').order('snapshot_at', { ascending: false }).limit(50),
    ])

    const firstError = [
      yocoPayments,
      yocoPayouts,
      syncRuns,
      reconciliationMatches,
      bankImports,
      expenses,
      advances,
      pockets,
      pocketSnapshots,
    ].find((r) => r.error)?.error

    if (firstError) {
      setError(firstError.message)
    }

    setData({
      yocoPayments: (yocoPayments.data as YocoPayment[]) ?? [],
      yocoPayouts: (yocoPayouts.data as YocoPayout[]) ?? [],
      syncRuns: (syncRuns.data as YocoSyncRun[]) ?? [],
      reconciliationMatches: (reconciliationMatches.data as ReconciliationMatch[]) ?? [],
      bankImports: (bankImports.data as FinanceBankImport[]) ?? [],
      expenses: (expenses.data as FinanceExpense[]) ?? [],
      advances: (advances.data as FinancePersonalAdvance[]) ?? [],
      pockets: (pockets.data as FinancePocket[]) ?? [],
      pocketSnapshots: (pocketSnapshots.data as FinancePocketSnapshot[]) ?? [],
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { ...data, loading, error, refresh: load }
}
