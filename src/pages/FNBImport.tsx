import { useEffect, useState } from 'react'
import { parseFNBStatementFromFile } from '../lib/fnbParser'
import { uploadFNBPDF, saveParsedRows, confirmFNBImport, finalizeFNBImport, listFNBImports, deleteFNBImport, type FNBImportSummary } from '../lib/fnb'
import type { FNBParseResult, ParsedTransaction } from '../lib/types-fnb'

export default function FNBImport() {
  const [step, setStep] = useState<'upload' | 'parsing' | 'preview' | 'importing' | 'complete'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [importId, setImportId] = useState<string>('')
  const [parseResult, setParseResult] = useState<FNBParseResult | null>(null)
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([])
  const [error, setError] = useState<string>('')
  const [imports, setImports] = useState<FNBImportSummary[]>([])
  const [importsLoading, setImportsLoading] = useState(true)
  const [importsError, setImportsError] = useState('')
  const [deletingId, setDeletingId] = useState<string>('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string>('')

  async function refreshImports() {
    setImportsLoading(true)
    setImportsError('')
    try {
      const rows = await listFNBImports()
      setImports(rows)
    } catch (err) {
      setImportsError(err instanceof Error ? err.message : 'Could not load imported statements.')
    } finally {
      setImportsLoading(false)
    }
  }

  useEffect(() => {
    refreshImports()
  }, [])

  async function handleDelete(row: FNBImportSummary) {
    setDeletingId(row.id)
    try {
      await deleteFNBImport(row.id, row.storagePath)
      setConfirmDeleteId('')
      await refreshImports()
    } catch (err) {
      setImportsError(err instanceof Error ? err.message : 'Could not delete this import.')
    } finally {
      setDeletingId('')
    }
  }

  // Flag imports sharing the same statement period as a real, prior
  // *successful* import (transactionCount > 0) as duplicates -- a
  // pending/failed retry with 0 transactions for the same period isn't a
  // meaningful duplicate on its own, but two successful imports of the same
  // period would double-count every transaction.
  const periodKey = (row: FNBImportSummary) => `${row.statementStartDate ?? ''}::${row.statementEndDate ?? ''}`
  const successfulPeriods = new Map<string, number>()
  for (const row of imports) {
    if (row.transactionCount > 0 && row.statementStartDate) {
      const key = periodKey(row)
      successfulPeriods.set(key, (successfulPeriods.get(key) ?? 0) + 1)
    }
  }
  const isDuplicatePeriod = (row: FNBImportSummary) =>
    row.statementStartDate !== null && (successfulPeriods.get(periodKey(row)) ?? 0) > 1

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const uploadedFile = e.target.files?.[0]
    if (!uploadedFile) return
    if (!uploadedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a PDF file.')
      return
    }
    setFile(uploadedFile)
    setError('')
  }

  async function handleUpload() {
    if (!file) return
    setStep('parsing')
    setError('')
    try {
      const { importId: newImportId } = await uploadFNBPDF(file)
      setImportId(newImportId)
      
      const result = await parseFNBStatementFromFile(file)
      
      if (!result.success) throw new Error(result.error || 'Parsing failed')
      setParseResult(result)
      setTransactions(result.transactions)
      await saveParsedRows(newImportId, result)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setStep('upload')
    }
  }

  async function handleConfirmImport() {
    if (!importId || !parseResult) return
    setStep('importing')
    setError('')
    try {
      await confirmFNBImport(importId, parseResult)
      await finalizeFNBImport(importId)
      setStep('complete')
      await refreshImports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setStep('preview')
    }
  }

  function formatMoney(cents: number) {
    return `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">FNB Statement Import</h1>
      {error && (<div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>)}
      
      {step === 'upload' && (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" id="file-upload" />
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="text-gray-500 mb-2">📄</div>
              <div className="font-medium">Click to upload or drag and drop</div>
              <div className="text-sm text-gray-500">PDF files only</div>
            </label>
            {file && (<div className="mt-4 text-sm text-gray-600">Selected: {file.name} ({Math.round(file.size / 1024)} KB)</div>)}
          </div>
          <button onClick={handleUpload} disabled={!file} className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700">Upload and Parse</button>
        </div>
      )}
      
      {step === 'parsing' && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-lg font-medium">Extracting text from PDF...</div>
          <div className="text-gray-500 mt-2">This may take a moment</div>
        </div>
      )}
      
      {step === 'preview' && parseResult && (
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h2 className="font-semibold mb-3">Statement Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><div className="text-gray-500">Account</div><div className="font-medium">{parseResult.statement?.accountNumber}</div></div>
              <div><div className="text-gray-500">Period</div><div className="font-medium">{parseResult.statement?.periodStart} to {parseResult.statement?.periodEnd}</div></div>
              <div><div className="text-gray-500">Opening</div><div className="font-medium">{formatMoney(parseResult.statement?.openingBalanceCents || 0)}</div></div>
              <div><div className="text-gray-500">Closing</div><div className="font-medium">{formatMoney(parseResult.statement?.closingBalanceCents || 0)}</div></div>
              <div><div className="text-gray-500">Credits</div><div className="font-medium text-green-600">{formatMoney(parseResult.statement?.totalCreditsCents || 0)} ({parseResult.statement?.creditTransactionCount})</div></div>
              <div><div className="text-gray-500">Debits</div><div className="font-medium text-red-600">{formatMoney(parseResult.statement?.totalDebitsCents || 0)} ({parseResult.statement?.debitTransactionCount})</div></div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <h2 className="font-semibold mb-3">Balance Validation</h2>
            <div className="font-mono text-sm space-y-1">
              <div>Opening: {formatMoney(parseResult.statement?.openingBalanceCents || 0)}</div>
              <div>+ Credits: {formatMoney(parseResult.statement?.totalCreditsCents || 0)}</div>
              <div>- Debits: {formatMoney(parseResult.statement?.totalDebitsCents || 0)}</div>
              <div className="border-t pt-1">= Calculated: {formatMoney(parseResult.balanceCheck.calculatedClosingCents)}</div>
              <div>Statement: {formatMoney(parseResult.statement?.closingBalanceCents || 0)}</div>
              <div className={`font-bold ${parseResult.balanceCheck.balanced ? 'text-green-600' : 'text-red-600'}`}>Variance: {formatMoney(parseResult.balanceCheck.varianceCents)} {parseResult.balanceCheck.balanced ? '✓' : '✗'}</div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <h2 className="font-semibold mb-3">Transactions ({transactions.length})</h2>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm"><thead className="bg-gray-100 sticky top-0"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-center">Confidence</th></tr></thead>
                <tbody>
                  {transactions.slice(0, 20).map((t, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-2">{t.date}</td>
                      <td className="px-3 py-2 truncate max-w-xs">{t.description}</td>
                      <td className={`px-3 py-2 text-right font-medium ${t.direction === 'credit' ? 'text-green-600' : 'text-red-600'}`}>{formatMoney(t.amountCents)}</td>
                      <td className="px-3 py-2">{t.suggestedCategory}</td>
                      <td className="px-3 py-2 text-center"><span className={`inline-block px-2 py-0.5 rounded text-xs ${t.confidenceScore > 0.8 ? 'bg-green-100 text-green-800' : t.confidenceScore > 0.5 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{Math.round(t.confidenceScore * 100)}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {transactions.length > 20 && (<div className="text-center text-gray-500 py-2">... and {transactions.length - 20} more</div>)}
            </div>
          </div>
          <div className="flex gap-4">
            <button onClick={handleConfirmImport} disabled={!parseResult.balanceCheck.balanced} className="flex-1 py-3 px-4 bg-green-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700">Confirm Import</button>
            <button onClick={() => { setStep('upload'); setFile(null); setParseResult(null); setTransactions([]); }} className="py-3 px-4 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}
      
      {step === 'importing' && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <div className="text-lg font-medium">Importing...</div>
          <div className="text-gray-500 mt-2">Creating bank transaction records</div>
        </div>
      )}
      
      {step === 'complete' && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">✓</div>
          <div className="text-lg font-medium">Import Complete</div>
          <div className="text-gray-500 mt-2">Statement imported successfully</div>
          <button onClick={() => { setStep('upload'); setFile(null); setParseResult(null); setTransactions([]); }} className="mt-6 py-3 px-6 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Import Another</button>
        </div>
      )}

      <div className="mt-10 pt-8 border-t border-gray-200">
        <h2 className="text-lg font-semibold mb-3">Imported statements</h2>
        {importsError && (<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{importsError}</div>)}
        {importsLoading ? (
          <div className="text-gray-500 text-sm">Loading...</div>
        ) : imports.length === 0 ? (
          <div className="text-gray-500 text-sm">No FNB statements have been uploaded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left">Period</th>
                  <th className="px-3 py-2 text-left">File</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Transactions</th>
                  <th className="px-3 py-2 text-right">Variance</th>
                  <th className="px-3 py-2 text-left">Uploaded</th>
                  <th className="px-3 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((row) => {
                  const duplicate = isDuplicatePeriod(row)
                  return (
                    <tr key={row.id} className={`border-t ${duplicate ? 'bg-amber-50' : ''}`}>
                      <td className="px-3 py-2">
                        {row.statementStartDate && row.statementEndDate
                          ? `${row.statementStartDate} to ${row.statementEndDate}`
                          : <span className="text-gray-400">Not parsed</span>}
                        {duplicate && (
                          <span className="ml-2 inline-block px-2 py-0.5 rounded text-xs bg-amber-200 text-amber-900">Possible duplicate</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500 truncate max-w-[160px]" title={row.sourceFilename ?? ''}>{row.sourceFilename}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                          row.parseStatus === 'parsed' && row.transactionCount > 0 ? 'bg-green-100 text-green-800'
                          : row.parseStatus === 'needs_review' ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-700'
                        }`}>
                          {row.transactionCount > 0 ? 'Imported' : row.parseStatus ?? 'pending'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{row.transactionCount}</td>
                      <td className="px-3 py-2 text-right">
                        {row.balanceVarianceCents !== null ? formatMoney(row.balanceVarianceCents) : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-500">{new Date(row.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="px-3 py-2 text-center">
                        {confirmDeleteId === row.id ? (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleDelete(row)}
                              disabled={deletingId === row.id}
                              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              {deletingId === row.id ? 'Deleting...' : 'Confirm delete'}
                            </button>
                            <button onClick={() => setConfirmDeleteId('')} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(row.id)}
                            className="px-2 py-1 text-xs border border-red-300 text-red-700 rounded hover:bg-red-50"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
