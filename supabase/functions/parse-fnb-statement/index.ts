import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'npm:unpdf@0.11.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://phenomebeauty-finance.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

interface ParsedTransaction {
  rowIndex: number
  date: string
  description: string
  rawReference?: string
  amountCents: number
  runningBalanceCents?: number
  direction: 'credit' | 'debit'
  suggestedCategory: string
  confidenceScore: number
  parseWarning?: string
  rawExtractedText: Record<string, unknown>
  userCorrected: boolean
  includeInImport: boolean
}

interface FNBStatement {
  accountNumber: string
  branchNumber: string
  statementNumber: string
  periodStart: string
  periodEnd: string
  statementDate: string
  openingBalanceCents: number
  closingBalanceCents: number
  totalCreditsCents: number
  totalDebitsCents: number
  creditTransactionCount: number
  debitTransactionCount: number
}

interface ParseResult {
  success: boolean
  error?: string
  statement?: FNBStatement
  transactions: ParsedTransaction[]
  balanceCheck: {
    calculatedClosingCents: number
    varianceCents: number
    balanced: boolean
  }
}

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'

// A transaction line: "DD Mon <description> <amount>(Cr|Dr)? <balance>(Cr|Dr)?"
// Amount and balance are the two trailing monetary tokens on the line. FNB
// statements render both with a Cr/Dr suffix (sometimes glued directly to the
// number with no space, e.g. "1,234.56Cr").
const TRANSACTION_LINE = new RegExp(
  `^(\\d{2}\\s+(?:${MONTHS}))\\s+(.+?)\\s+([\\d,]+\\.\\d{2})\\s?(Cr|Dr)?\\s+([\\d,]+\\.\\d{2})\\s?(Cr|Dr)?\\s*$`
)

function parseAmount(amountStr: string): { cents: number; direction: 'credit' | 'debit' } | null {
  const trimmed = amountStr.trim()
  const isCredit = /Cr$/i.test(trimmed)
  const isDebit = /Dr$/i.test(trimmed)
  const numericPart = trimmed.replace(/Cr|Dr/i, '').replace(/,/g, '').trim()
  const amount = parseFloat(numericPart)
  if (isNaN(amount)) return null
  return { cents: Math.round(amount * 100), direction: isDebit ? 'debit' : isCredit ? 'credit' : 'credit' }
}

function categorizeTransaction(description: string): { category: string; confidence: number } {
  const lower = description.toLowerCase()

  if (lower.includes('magtape credit yoco')) return { category: 'yoco_payout', confidence: 0.95 }
  if (lower.includes('payshap credit yoco pockets')) return { category: 'yoco_pocket_transfer', confidence: 0.95 }
  if (lower.includes('payshap')) return { category: 'payshap_candidate', confidence: 0.7 }
  if (lower.includes('pos purchase yoco')) return { category: 'business_expense', confidence: 0.85 }
  if (lower.includes('fuel purchase')) return { category: 'fuel', confidence: 0.9 }
  if (lower.includes('electricity prepaid')) return { category: 'utilities', confidence: 0.9 }
  if (lower.includes('fnb app payment to foazia')) return { category: 'owner_advance', confidence: 0.8 }
  if (lower.includes('fnb app transfer from arshad')) return { category: 'owner_transfer', confidence: 0.85 }
  if (lower.includes('fnb app rtc pmt to car')) return { category: 'vehicle_finance', confidence: 0.85 }
  if (lower.includes('debicheck internal')) return { category: 'direct_debit', confidence: 0.8 }
  if (lower.includes('collection attempt') || lower.includes('ction attempt')) return { category: 'collection', confidence: 0.8 }
  if (lower.includes('pos purchase dischem')) return { category: 'health_pharmacy', confidence: 0.85 }
  if (lower.includes('pos purchase checkers') || lower.includes('pos purchase spar')) return { category: 'groceries', confidence: 0.85 }
  if (lower.includes('service fees')) return { category: 'bank_fees', confidence: 0.9 }
  if (lower.includes('other fees')) return { category: 'bank_fees', confidence: 0.85 }

  return { category: 'other', confidence: 0.5 }
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes)
  const { text } = await extractText(pdf, { mergePages: false })
  // extractText with mergePages:false returns one string per page. Join with
  // newlines so page breaks don't accidentally merge two transaction rows
  // together, then normalise any non-breaking/odd whitespace pdf.js can emit.
  const pages = Array.isArray(text) ? text : [text]
  return pages
    .map((pageText) =>
      pageText
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
    )
    .join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405, headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ success: false, error: 'Missing Supabase configuration.' }, { status: 500, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { storagePath } = body as { storagePath: string }

    if (!storagePath) {
      return Response.json({ success: false, error: 'Missing storagePath parameter.' }, { status: 400, headers: corsHeaders })
    }

    const db = createClient(supabaseUrl, serviceRoleKey)

    const { data: pdfData, error: downloadError } = await db.storage
      .from('fnb-statements')
      .download(storagePath)

    if (downloadError || !pdfData) {
      return Response.json({ success: false, error: 'Failed to download PDF from storage.' }, { status: 500, headers: corsHeaders })
    }

    // Proper PDF text extraction (pdf.js under the hood) instead of treating
    // the raw PDF bytes as UTF-8 text -- the previous approach silently
    // corrupted/garbled descriptions and column spacing because PDFs are
    // structured binary with compressed content streams, not plain text.
    const bytes = new Uint8Array(await pdfData.arrayBuffer())
    let text: string
    try {
      text = await extractPdfText(bytes)
    } catch (pdfErr) {
      const message = pdfErr instanceof Error ? pdfErr.message : 'Unknown PDF extraction error.'
      return Response.json({ success: false, error: `Failed to extract text from PDF: ${message}` }, { status: 500, headers: corsHeaders })
    }

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

    const statement: Partial<FNBStatement> = {}
    let openingBalance = 0
    let closingBalance = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line.includes('FNB Aspire Current Account')) {
        const accountMatch = line.match(/:\s*(\d+)/)
        if (accountMatch) statement.accountNumber = accountMatch[1]
      }
      if (line.includes('Statement Number')) {
        const numMatch = line.match(/:\s*(\d+)/)
        if (numMatch) statement.statementNumber = numMatch[1]
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
        const inlineMatch = line.match(/Opening Balance\D*([\d,]+\.\d{2})\s?(Cr|Dr)?/i)
        const parsed = inlineMatch
          ? parseAmount(inlineMatch[1] + (inlineMatch[2] ?? ''))
          : parseAmount(lines[i + 1]?.trim() ?? '')
        if (parsed) openingBalance = parsed.direction === 'debit' ? -parsed.cents : parsed.cents
      }
      if (line.includes('Closing Balance')) {
        const inlineMatch = line.match(/Closing Balance\D*([\d,]+\.\d{2})\s?(Cr|Dr)?/i)
        const parsed = inlineMatch
          ? parseAmount(inlineMatch[1] + (inlineMatch[2] ?? ''))
          : parseAmount(lines[i + 1]?.trim() ?? '')
        if (parsed) closingBalance = parsed.direction === 'debit' ? -parsed.cents : parsed.cents
      }
    }

    // Pass 1: match every line against the strict transaction pattern,
    // scanning the WHOLE document rather than toggling an in/out-of-table
    // flag on section header text. Statements that paginate can repeat or
    // omit those header/footer strings per page, which was silently
    // dropping legitimate rows near page boundaries.
    type RawRow = {
      date: string
      description: string
      amountToken: string
      balanceToken: string
      rawLine: string
    }
    const rawRows: RawRow[] = []

    for (const line of lines) {
      const match = line.match(TRANSACTION_LINE)
      if (!match) continue
      const [, dateStr, description, amountNum, amountSuffix, balanceNum, balanceSuffix] = match
      rawRows.push({
        date: dateStr,
        description: description.trim(),
        amountToken: amountNum + (amountSuffix ?? ''),
        balanceToken: balanceNum + (balanceSuffix ?? ''),
        rawLine: line,
      })
    }

    // Pass 2: walk rows in document order, using the running balance as the
    // source of truth. The balance column is a single trailing token and far
    // less prone to mis-extraction than the amount column, which sits next
    // to a variable-length description. Whenever the parsed amount doesn't
    // reconcile against the balance delta, we trust the balance and derive
    // the amount from it, flagging the row for human review instead of
    // letting a garbled row silently blow out the statement totals.
    const transactions: ParsedTransaction[] = []
    let runningBalance = openingBalance
    let creditCount = 0
    let debitCount = 0
    let totalCredits = 0
    let totalDebits = 0

    rawRows.forEach((row, idx) => {
      const parsedAmount = parseAmount(row.amountToken)
      const parsedBalance = parseAmount(row.balanceToken)
      if (!parsedAmount || !parsedBalance) return

      const parsedBalanceCents = parsedBalance.direction === 'debit' ? -parsedBalance.cents : parsedBalance.cents
      const expectedBalance =
        runningBalance + (parsedAmount.direction === 'credit' ? parsedAmount.cents : -parsedAmount.cents)
      const variance = expectedBalance - parsedBalanceCents

      let amountCents = parsedAmount.cents
      let direction = parsedAmount.direction
      const category = categorizeTransaction(row.description)
      let confidence = category.confidence
      let parseWarning: string | undefined

      if (Math.abs(variance) > 1) {
        // Amount/description column didn't reconcile against the balance
        // column - rederive the amount from the balance delta instead.
        const derivedDelta = parsedBalanceCents - runningBalance
        amountCents = Math.abs(derivedDelta)
        direction = derivedDelta >= 0 ? 'credit' : 'debit'
        confidence = Math.min(confidence, 0.4)
        parseWarning = `Amount corrected from running-balance delta (raw parse read ${(parsedAmount.cents / 100).toFixed(2)} ${parsedAmount.direction}, expected balance ${(expectedBalance / 100).toFixed(2)} vs statement balance ${(parsedBalanceCents / 100).toFixed(2)}). Please verify.`
      }

      transactions.push({
        rowIndex: idx,
        date: row.date,
        description: row.description || 'Bank charge',
        amountCents,
        runningBalanceCents: parsedBalanceCents,
        direction,
        suggestedCategory: category.category,
        confidenceScore: confidence,
        parseWarning,
        rawExtractedText: { line: row.rawLine },
        userCorrected: false,
        includeInImport: true,
      })

      if (direction === 'credit') {
        creditCount++
        totalCredits += amountCents
      } else {
        debitCount++
        totalDebits += amountCents
      }

      runningBalance = parsedBalanceCents
    })

    const calculatedClosing = openingBalance + totalCredits - totalDebits
    const variance = calculatedClosing - closingBalance
    const balanced = Math.abs(variance) < 1

    const result: ParseResult = {
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

    return Response.json(result, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF parsing failed.'
    return Response.json({ success: false, error: message }, { status: 500, headers: corsHeaders })
  }
})
