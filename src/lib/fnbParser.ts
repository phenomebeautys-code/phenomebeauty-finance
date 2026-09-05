import * as pdfjsLib from 'pdfjs-dist'
import type { FNBParseResult, FNBStatement, ParsedTransaction } from './types-fnb'

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

// A transaction date cell, e.g. "07 Jul". FNB renders this as a single text
// run in the PDF content stream, distinct from the amount/balance columns.
const TRANSACTION_DATE_PATTERN = /^(\d{2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i

// Amount/balance cells render as a bare number with NO embedded Cr/Dr suffix
// -- FNB puts "Cr"/"Dr" in its own separate text run immediately after. Any
// parser that expects the suffix on the same token as the number (as the
// previous version did) will silently lose the direction for every single
// amount and balance in the statement.
const MONEY_PATTERN = /^(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/

const BALANCE_TOLERANCE_CENTS = 1

function normaliseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function isMoneyToken(token: string) {
  return MONEY_PATTERN.test(token)
}

function isMarkerToken(token: string) {
  return token === 'Cr' || token === 'Dr'
}

function toCents(token: string): number | null {
  const match = token.match(MONEY_PATTERN)
  if (!match) return null
  const whole = match[1].replace(/,/g, '')
  return Number.parseInt(whole, 10) * 100 + Number.parseInt(match[2], 10)
}

function parseStatementDate(value: string) {
  const match = normaliseWhitespace(value).match(
    /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{4})$/i
  )
  if (!match) return null
  const month = MONTHS[match[2].toLowerCase()]
  if (month === undefined) return null
  const day = Number.parseInt(match[1], 10)
  const year = Number.parseInt(match[3], 10)
  return new Date(Date.UTC(year, month, day))
}

function toIsoDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : ''
}

function parseTransactionDate(day: string, monthName: string, statementEndDate: Date) {
  const month = MONTHS[monthName.toLowerCase()]
  if (month === undefined) {
    throw new Error(`Unsupported FNB transaction month: ${monthName}`)
  }
  const statementYear = statementEndDate.getUTCFullYear()
  const statementEndMonth = statementEndDate.getUTCMonth()
  const transactionYear = month > statementEndMonth ? statementYear - 1 : statementYear
  return new Date(Date.UTC(transactionYear, month, Number.parseInt(day, 10)))
    .toISOString()
    .slice(0, 10)
}

function extractStatementPeriod(text: string) {
  const periodMatch = text.match(
    /Statement Period\s*:\s*(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})\s+to\s+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i
  )
  if (!periodMatch) return { start: null, end: null }
  return { start: parseStatementDate(periodMatch[1]), end: parseStatementDate(periodMatch[2]) }
}

function extractStatementDate(text: string) {
  const match = text.match(
    /Statement Date\s*:\s*(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i
  )
  if (!match) return ''
  return toIsoDate(parseStatementDate(match[1]))
}

function extractAccountNumber(text: string) {
  const accountMatch = text.match(/FNB Aspire Current Account\s*:\s*(\d+)/i)
  if (accountMatch) return accountMatch[1]
  const fallbackMatch = text.match(/Account Number\s*[\r\n]+\s*\d+\s*[\r\n]+\s*(\d{8,})/i)
  return fallbackMatch?.[1] ?? ''
}

function extractBranchNumber(text: string) {
  const branchMatch = text.match(/Branch Number\s*[\r\n]+\s*\S+\s*[\r\n]+\s*(\d{3,})/i)
  return branchMatch?.[1] ?? ''
}

function extractStatementNumber(text: string) {
  const statementMatch = text.match(/Tax Invoice\/Statement Number\s*:\s*(\d+)/i)
  return statementMatch?.[1] ?? ''
}

// Opening/Closing Balance appear in the header summary box with the Cr/Dr
// suffix embedded in the SAME token (e.g. "1,003.72 Cr"), unlike the
// transaction table further down -- so this needs its own, simpler pattern.
function extractHeaderBalanceCents(text: string, label: 'Opening Balance' | 'Closing Balance'): number {
  const pattern = new RegExp(`${label}\\D*?([\\d,]+\\.\\d{2})\\s*(Cr|Dr)?`, 'i')
  const match = text.match(pattern)
  if (!match) return 0
  const cents = Math.round(parseFloat(match[1].replace(/,/g, '')) * 100)
  return match[2]?.toLowerCase() === 'dr' ? -cents : cents
}

function categoriseDescription(description: string, isPhantom: boolean) {
  const lower = description.toLowerCase()

  if (isPhantom) {
    return {
      category: 'Informational (no balance impact)',
      confidenceScore: 0.9,
      parseWarning:
        'This entry shows an amount but the statement balance did not change across it (e.g. an unsuccessful/reversed collection attempt). Excluded from totals; kept for audit visibility.',
    }
  }

  if (description === '(no description)') {
    return {
      category: 'Bank fee',
      confidenceScore: 0.6,
      parseWarning: 'No description text could be extracted for this row (likely an internal FNB fee code rendered without selectable text). Amount and balance are still accurate.',
    }
  }

  if (lower.includes('magtape credit yoco')) {
    return { category: 'Yoco payout', confidenceScore: 0.98, parseWarning: '' }
  }
  if (lower.includes('payshap')) {
    return { category: 'Client payment', confidenceScore: 0.9, parseWarning: '' }
  }
  if (lower.includes('fuel purchase') || lower.includes('engen') || lower.includes('bp ') || lower.includes('total ')) {
    return { category: 'Fuel', confidenceScore: 0.95, parseWarning: '' }
  }
  if (lower.includes('electricity prepaid')) {
    return { category: 'Utilities', confidenceScore: 0.95, parseWarning: '' }
  }
  if (lower.includes('debicheck') || lower.includes('rtc pmt to car') || lower.includes('absa vf')) {
    return { category: 'Vehicle finance', confidenceScore: 0.9, parseWarning: '' }
  }
  if (
    lower.includes('collection attempt') ||
    lower.includes('ction attempt') ||
    lower.includes('cessful fee')
  ) {
    return {
      category: 'Collection / unpaid item fee',
      confidenceScore: 0.75,
      parseWarning: '',
    }
  }
  if (
    lower.includes('keiko') ||
    lower.includes('logica beauty') ||
    lower.includes('bright packaging') ||
    lower.includes('shop b47') ||
    lower.includes('shop a39')
  ) {
    return { category: 'Stock and supplies', confidenceScore: 0.85, parseWarning: '' }
  }
  if (lower.includes('fnb app transfer from') || lower.includes('transfer to pocket') || lower.includes('send money app')) {
    return { category: 'Transfer', confidenceScore: 0.8, parseWarning: '' }
  }
  if (
    lower.includes('checkers') || lower.includes('pnp') || lower.includes('pick n pay') ||
    lower.includes('spar') || lower.includes('woolworths') || lower.includes('kfc') ||
    lower.includes('pizza') || lower.includes('tikka')
  ) {
    return {
      category: 'Needs review',
      confidenceScore: 0.55,
      parseWarning: 'This merchant may be a business or personal expense. Review its classification.',
    }
  }

  return {
    category: 'Needs review',
    confidenceScore: 0.35,
    parseWarning: 'No automatic category match was found. Review this transaction.',
  }
}

type RawRow = {
  date: string
  description: string
  amountCents: number
  direction: 'credit' | 'debit'
  balanceCents: number
  rawTokens: string[]
}

// Group the flat, whitespace-stripped token stream into per-transaction
// blocks. Each block starts at a "DD Mon" date token and runs until the
// next one. This intentionally does NOT require a description token to be
// present -- some FNB rows (internal fee codes, mostly) render with no
// selectable description text at all, and dropping them was silently
// losing real transactions.
function extractRawRows(tokens: string[]): RawRow[] {
  const rows: RawRow[] = []
  let index = 0

  while (index < tokens.length) {
    if (!TRANSACTION_DATE_PATTERN.test(tokens[index])) {
      index += 1
      continue
    }

    const date = tokens[index]
    let cursor = index + 1
    const blockTokens: string[] = []
    while (cursor < tokens.length && !TRANSACTION_DATE_PATTERN.test(tokens[cursor])) {
      blockTokens.push(tokens[cursor])
      cursor += 1
    }
    index = cursor

    // Walk the block: leading non-money tokens are the description, then an
    // amount token, an optional Cr/Dr marker (separate token), then a
    // balance token, then an optional Cr/Dr marker for it.
    let k = 0
    const descParts: string[] = []
    while (k < blockTokens.length && !isMoneyToken(blockTokens[k])) {
      descParts.push(blockTokens[k])
      k += 1
    }
    if (k >= blockTokens.length) continue // no amount found -- not a real row

    const amountCents = toCents(blockTokens[k])
    k += 1
    if (amountCents === null) continue

    let amountMarker: string | null = null
    if (k < blockTokens.length && isMarkerToken(blockTokens[k])) {
      amountMarker = blockTokens[k]
      k += 1
    }

    if (k >= blockTokens.length || !isMoneyToken(blockTokens[k])) continue // no balance found
    const balanceCents = toCents(blockTokens[k])
    k += 1
    if (balanceCents === null) continue

    const description = descParts.join(' ').trim() || '(no description)'
    const direction: 'credit' | 'debit' = amountMarker === 'Cr' ? 'credit' : 'debit'

    rows.push({ date, description, amountCents, direction, balanceCents, rawTokens: blockTokens })
  }

  return rows
}

export async function extractTextFromPDF(file: File) {
  const fileBuffer = await file.arrayBuffer()
  const document = await pdfjsLib.getDocument({ data: fileBuffer }).promise
  const pageTexts: string[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join('\n')
    pageTexts.push(pageText)
  }

  return pageTexts.join('\n')
}

// This variant preserves each pdf.js text item as its own array entry
// (rather than collapsing to lines), because the amount/balance columns and
// their Cr/Dr markers arrive as separate adjacent items that need to be
// walked token-by-token, not line-by-line.
export async function extractTokensFromPDF(file: File): Promise<{ text: string; tokens: string[] }> {
  const fileBuffer = await file.arrayBuffer()
  const document = await pdfjsLib.getDocument({ data: fileBuffer }).promise
  const allTokens: string[] = []
  const pageTexts: string[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    for (const item of content.items) {
      const str = 'str' in item ? item.str : ''
      const trimmed = str.trim()
      if (trimmed) allTokens.push(trimmed)
    }
    const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join('\n')
    pageTexts.push(pageText)
  }

  return { text: pageTexts.join('\n'), tokens: allTokens }
}

export function parseFNBStatementTokens(text: string, tokens: string[]): FNBParseResult {
  try {
    if (tokens.length === 0) {
      return {
        success: false,
        error: 'No text could be extracted from this PDF.',
        statement: undefined,
        transactions: [],
        balanceCheck: { calculatedClosingCents: 0, varianceCents: 0, balanced: false },
      }
    }

    const period = extractStatementPeriod(text)
    const statementEndDate = period.end

    if (!statementEndDate || Number.isNaN(statementEndDate.getTime())) {
      return {
        success: false,
        error: 'The statement period could not be detected from this FNB PDF.',
        statement: undefined,
        transactions: [],
        balanceCheck: { calculatedClosingCents: 0, varianceCents: 0, balanced: false },
      }
    }

    const openingBalanceCents = extractHeaderBalanceCents(text, 'Opening Balance')
    const closingBalanceCents = extractHeaderBalanceCents(text, 'Closing Balance')

    const rawRows = extractRawRows(tokens)

    if (rawRows.length === 0) {
      return {
        success: false,
        error: 'The PDF text was extracted, but no FNB transaction rows could be recognised. Ensure the statement includes the Transactions in RAND section.',
        statement: undefined,
        transactions: [],
        balanceCheck: { calculatedClosingCents: 0, varianceCents: 0, balanced: false },
      }
    }

    // Walk rows in document order using the running balance as the source of
    // truth. Two situations need special handling beyond a plain
    // amount-matches-balance-delta check:
    //  1. "Phantom" rows: an unsuccessful/reversed collection attempt shows
    //     an amount with a Cr/Dr marker, but the balance is IDENTICAL to the
    //     previous row. These are real printed lines (audit trail) but have
    //     zero net effect and must be excluded from totals, or they inflate
    //     credits/debits that never actually happened.
    //  2. Genuine parse mismatches (amount doesn't reconcile against the
    //     balance delta, and the balance did move): trust the balance
    //     column and rederive the amount from the delta instead, flagging
    //     the row for review.
    let runningBalance = openingBalanceCents
    const transactions: ParsedTransaction[] = []

    rawRows.forEach((row, rowIndex) => {
      const expectedBalance =
        runningBalance + (row.direction === 'credit' ? row.amountCents : -row.amountCents)
      const reconciles = Math.abs(expectedBalance - row.balanceCents) <= BALANCE_TOLERANCE_CENTS
      const balanceUnchanged = Math.abs(row.balanceCents - runningBalance) <= BALANCE_TOLERANCE_CENTS

      let amountCents = row.amountCents
      let direction = row.direction
      let includeInImport = true
      let isPhantom = false
      let extraWarning = ''

      if (!reconciles) {
        if (balanceUnchanged) {
          isPhantom = true
          includeInImport = false
        } else {
          const derivedDelta = row.balanceCents - runningBalance
          amountCents = Math.abs(derivedDelta)
          direction = derivedDelta >= 0 ? 'credit' : 'debit'
          extraWarning = `Amount corrected from running-balance delta (raw parse read ${(row.amountCents / 100).toFixed(2)} ${row.direction}). Please verify.`
        }
      }

      const categorisation = categoriseDescription(row.description, isPhantom)

      transactions.push({
        rowIndex,
        date: parseTransactionDate(row.date.slice(0, 2), row.date.slice(3), statementEndDate),
        description: row.description,
        rawReference: '',
        amountCents,
        runningBalanceCents: row.balanceCents,
        direction,
        suggestedCategory: categorisation.category,
        confidenceScore: categorisation.confidenceScore,
        parseWarning: extraWarning || categorisation.parseWarning,
        rawExtractedText: { dateLine: row.date, tokens: row.rawTokens },
        userCorrected: false,
        includeInImport,
      })

      runningBalance = row.balanceCents
    })

    const included = transactions.filter((t) => t.includeInImport)
    const totalCreditsCents = included
      .filter((t) => t.direction === 'credit')
      .reduce((sum, t) => sum + t.amountCents, 0)
    const totalDebitsCents = included
      .filter((t) => t.direction === 'debit')
      .reduce((sum, t) => sum + t.amountCents, 0)

    const calculatedClosingCents = openingBalanceCents + totalCreditsCents - totalDebitsCents
    const varianceCents = calculatedClosingCents - closingBalanceCents

    const statement: FNBStatement = {
      statementNumber: extractStatementNumber(text),
      statementDate: extractStatementDate(text),
      accountNumber: extractAccountNumber(text),
      branchNumber: extractBranchNumber(text),
      periodStart: toIsoDate(period.start),
      periodEnd: toIsoDate(period.end),
      openingBalanceCents,
      closingBalanceCents,
      totalCreditsCents,
      totalDebitsCents,
      creditTransactionCount: included.filter((t) => t.direction === 'credit').length,
      debitTransactionCount: included.filter((t) => t.direction === 'debit').length,
    }

    return {
      success: true,
      error: '',
      statement,
      transactions,
      balanceCheck: {
        calculatedClosingCents,
        varianceCents,
        balanced: varianceCents === 0,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred while parsing the FNB PDF.',
      statement: undefined,
      transactions: [],
      balanceCheck: { calculatedClosingCents: 0, varianceCents: 0, balanced: false },
    }
  }
}

// Back-compat wrapper: existing callers pass just the newline-joined text.
// Prefer parseFNBStatementTokens (called via parseFNBStatementFromFile) since
// splitting on newlines loses the token-level adjacency needed to detect
// separate Cr/Dr marker tokens reliably.
export function parseFNBStatementText(text: string): FNBParseResult {
  const tokens = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return parseFNBStatementTokens(text, tokens)
}

export async function parseFNBStatementFromFile(file: File): Promise<FNBParseResult> {
  const { text, tokens } = await extractTokensFromPDF(file)
  return parseFNBStatementTokens(text, tokens)
}
