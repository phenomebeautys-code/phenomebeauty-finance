import * as pdfjsLib from 'pdfjs-dist'
import type { ParsedTransaction, FNBStatement, FNBParseResult } from './types-fnb'

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

function parseAmount(amountStr: string): { cents: number; direction: 'credit' | 'debit' } | null {
  const trimmed = amountStr.trim()
  const isDebit = trimmed.endsWith('Dr')
  const numericPart = trimmed.replace(/Cr|Dr|,/g, '').trim()
  const amount = parseFloat(numericPart)
  if (isNaN(amount)) return null
  return { cents: Math.round(amount * 100), direction: isDebit ? 'debit' : 'credit' }
}

function categorizeTransaction(description: string): { category: string; confidence: number } {
  const lower = description.toLowerCase()
  if (lower.includes('magtape credit yoco')) return { category: 'yoco_payout', confidence: 0.95 }
  if (lower.includes('payshap credit yoco pockets')) return { category: 'yoco_pocket_transfer', confidence: 0.95 }
  if (lower.includes('pos purchase yoco')) return { category: 'business_expense', confidence: 0.85 }
  if (lower.includes('fuel purchase')) return { category: 'fuel', confidence: 0.9 }
  if (lower.includes('electricity prepaid')) return { category: 'utilities', confidence: 0.9 }
  if (lower.includes('fnb app payment to foazia')) return { category: 'owner_advance', confidence: 0.8 }
  if (lower.includes('fnb app transfer from arshad')) return { category: 'owner_transfer', confidence: 0.85 }
  if (lower.includes('fnb app rtc pmt to car')) return { category: 'vehicle_finance', confidence: 0.85 }
  if (lower.includes('debicheck internal')) return { category: 'direct_debit', confidence: 0.8 }
  if (lower.includes('edo collection attempt')) return { category: 'collection', confidence: 0.8 }
  if (lower.includes('pos purchase dischem')) return { category: 'health_pharmacy', confidence: 0.85 }
  if (lower.includes('pos purchase checkers') || lower.includes('pos purchase spar')) return { category: 'groceries', confidence: 0.85 }
  if (lower.includes('service fees')) return { category: 'bank_fees', confidence: 0.9 }
  return { category: 'other', confidence: 0.5 }
}

export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let fullText = ''
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map((item: any) => item.str).join(' ')
    fullText += pageText + '\n'
  }
  
  return fullText
}

export function parseFNBStatementText(text: string): FNBParseResult {
  const lines = text.split('\n').filter(line => line.trim())
  const statement: Partial<FNBStatement> = {}
  const transactions: ParsedTransaction[] = []
  
  let inTransactions = false
  let rowIndex = 0
  let creditCount = 0
  let debitCount = 0
  let totalCredits = 0
  let totalDebits = 0
  let openingBalance = 0
  let closingBalance = 0
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    if (line.includes('Statement Number')) {
      const numMatch = line.match(/:\s*(\d+)/)
      if (numMatch) statement.statementNumber = numMatch[1]
    }
    
    if (line.includes('FNB Aspire Current Account')) {
      const accountMatch = line.match(/:\s*(\d+)/)
      if (accountMatch) statement.accountNumber = accountMatch[1]
    }
    
    if (line.includes('Statement Period')) {
      const periodMatch = line.match(/:\s*(.+)/)
      if (periodMatch) {
        const period = periodMatch[1].trim()
        const parts = period.split(' to ')
        if (parts.length === 2) {
          statement.periodStart = parts[0].trim()
          statement.periodEnd = parts[1].trim()
        }
      }
    }
    
    if (line.includes('Opening Balance')) {
      const nextLine = lines[i + 1]?.trim()
      if (nextLine) {
        const parsed = parseAmount(nextLine)
        if (parsed) openingBalance = parsed.cents
      }
    }
    
    if (line.includes('Closing Balance')) {
      const nextLine = lines[i + 1]?.trim()
      if (nextLine) {
        const parsed = parseAmount(nextLine)
        if (parsed) closingBalance = parsed.cents
      }
    }
    
    if (line.includes('Transactions in RAND')) {
      inTransactions = true
      continue
    }
    
    if (line.includes('Turnover for Statement Period')) {
      inTransactions = false
      continue
    }
    
    if (inTransactions && line.match(/^\d{2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/)) {
      const parts = line.split(/\s+/)
      if (parts.length >= 3) {
        const dateStr = parts[0] + ' ' + parts[1]
        const description = parts.slice(2, -2).join(' ')
        const amountStr = parts[parts.length - 2]
        const balanceStr = parts[parts.length - 1]
        
        const amount = parseAmount(amountStr)
        const balance = parseAmount(balanceStr)
        
        if (amount) {
          const category = categorizeTransaction(description || 'Bank charge')
          transactions.push({
            rowIndex: rowIndex++,
            date: dateStr,
            description: description || 'Bank charge',
            amountCents: amount.cents,
            runningBalanceCents: balance?.cents,
            direction: amount.direction,
            suggestedCategory: category.category,
            confidenceScore: category.confidence,
            rawExtractedText: { line, parts },
            userCorrected: false,
            includeInImport: true,
          })
          
          if (amount.direction === 'credit') {
            creditCount++
            totalCredits += amount.cents
          } else {
            debitCount++
            totalDebits += amount.cents
          }
        }
      }
    }
  }
  
  const calculatedClosing = openingBalance + totalCredits - totalDebits
  const variance = calculatedClosing - closingBalance
  const balanced = Math.abs(variance) < 1
  
  return {
    success: true,
    statement: {
      accountNumber: statement.accountNumber || '',
      branchNumber: statement.branchNumber || '',
      statementNumber: statement.statementNumber || '',
      periodStart: statement.periodStart || '',
      periodEnd: statement.periodEnd || '',
      statementDate: statement.statementDate || '',
      openingBalanceCents: openingBalance,
      closingBalanceCents: closingBalance,
      totalCreditsCents: totalCredits,
      totalDebitsCents: totalDebits,
      creditTransactionCount: creditCount,
      debitTransactionCount: debitCount,
    },
    transactions,
    balanceCheck: {
      calculatedClosingCents: calculatedClosing,
      varianceCents: variance,
      balanced,
    },
  }
}
