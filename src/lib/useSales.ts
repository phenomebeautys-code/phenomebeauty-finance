import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { demoSales } from './demoData'
import type { FinanceSaleWithLines } from './types'

const isConnected = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
)

export function useSales() {
  const [sales, setSales] = useState<FinanceSaleWithLines[]>([])
  const [loading, setLoading] = useState(true)
  const [usingDemoData, setUsingDemoData] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (!isConnected) {
      setSales(demoSales)
      setUsingDemoData(true)
      setLoading(false)
      return
    }

    const { data, error: fetchError } = await supabase
      .from('finance_sales')
      .select('*, finance_sale_lines(*)')
      .order('sale_date', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
      setSales(demoSales)
      setUsingDemoData(true)
    } else {
      setSales((data as FinanceSaleWithLines[]) ?? [])
      setUsingDemoData(false)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { sales, loading, error, usingDemoData, refresh: load }
}
