import { useState } from 'react'
import { useSupabaseClient } from '../lib/supabase'
import { extractTextFromPDF, parseFNBStatementText } from '../lib/fnbParser'
import { uploadFNBPDF, saveParsedRows, confirmFNBImport, finalizeFNBImport } from '../lib/fnb'
import type { FNBParseResult, ParsedTransaction } from '../lib/types-fnb'

export default function FNBImport() {
  const supabase = useSupabaseClient()
  const [step, setStep] = useState<'upload' | 'parsing' | 'preview' | 'importing' | 'complete'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [importId, setImportId] = useState<string>('')
  const [parseResult, setParseResult] = useState<FNBParseResult | null>(null)
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([])
  const [error, setError] = useState<string>('')

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
      
      const text = await extractTextFromPDF(file)
      const result = parseFNBStatementText(text)
      
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
      const { imported, skipped } = await finalizeFNBImport(importId)
      setStep('complete')
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
    </div>
  )
}
