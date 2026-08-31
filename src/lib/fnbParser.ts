import * as pdfjsLib from 'pdfjs-dist'
import type { FNBParseResult, FNBStatement, ParsedTransaction } from './types-fnb'

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

type MoneyValue = {
  cents: number
  marker: 'credit' | 'debit' | null
}

type TransactionBlock = {
  date: string
  lines: string[]
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

const TRANSACTION_DATE_PATTERN =
  /^(\d{2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i

const MONEY_PATTERN =
  /^(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})\s*(Cr|Dr)?$/i

const CARD_REFERENCE_PATTERN =
  /^\d{4,}\*+\d+(?:\s+\d{2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))?$/i

const PAGE_OR_COLUMN_HEADER_PATTERN =
  /^(Date|Description|Amount|Balance|Accrued|Bank|Charges|Transactions in RAND \(ZAR\)|Transactions in RAND \(ZAR\)\s*:.*)$/i

function normaliseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function parseMoney(value: string): MoneyValue | null {
  const match = normaliseWhitespace(value).match(MONEY_PATTERN)

  if (!match) {
    return null
  }

  const whole = match[1].replace(/,/g, '')
  const cents = Number.parseInt(whole, 10) * 100 + Number.parseInt(match[2], 10)
  const suffix = match[3]?.toLowerCase()

  return {
    cents,
    marker: suffix === 'cr' ? 'credit' : suffix === 'dr' ? 'debit' : null,
  }
}

function parseStatementDate(value: string) {
  const match = normaliseWhitespace(value).match(
    /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{4})$/i
  )

  if (!match) {
    return null
  }

  const month = MONTHS[match[2].toLowerCase()]

  if (month === undefined) {
    return null
  }

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

  if (!periodMatch) {
    return {
      start: null,
      end: null,
    }
  }

  return {
    start: parseStatementDate(periodMatch[1]),
    end: parseStatementDate(periodMatch[2]),
  }
}

function extractStatementDate(text: string) {
  const statementDateMatch = text.match(
    /Statement Date\s*:\s*(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i
  )

  if (!statementDateMatch) {
    return ''
  }

  return toIsoDate(parseStatementDate(statementDateMatch[1]))
}

function findNextMoneyLine(lines: string[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const money = parseMoney(lines[index])

    if (money) {
      return {
        index,
        money,
      }
    }
  }

  return null
}

function extractBalanceAfterLabel(lines: string[], label: string) {
  const labelIndex = lines.findIndex(
    (line) => normaliseWhitespace(line).toLowerCase() === label.toLowerCase()
  )

  if (labelIndex === -1) {
    return 0
  }

  const match = findNextMoneyLine(lines, labelIndex + 1)

  return match?.money.cents ?? 0
}

function extractAccountNumber(text: string) {
  const accountMatch = text.match(/FNB Aspire Current Account\s*:\s*(\d+)/i)

  if (accountMatch) {
    return accountMatch[1]
  }

  const fallbackMatch = text.match(
    /Account Number\s*[\r\n]+\s*\d+\s*[\r\n]+\s*(\d{8,})/i
  )

  return fallbackMatch?.[1] ?? ''
}

function extractBranchNumber(text: string) {
  const branchMatch = text.match(
    /Branch Number\s*[\r\n]+\s*\S+\s*[\r\n]+\s*(\d{3,})/i
  )

  return branchMatch?.[1] ?? ''
}

function extractStatementNumber(text: string) {
  const statementMatch = text.match(/Tax Invoice\/Statement Number\s*:\s*(\d+)/i)

  return statementMatch?.[1] ?? ''
}

function isTransactionDateLine(line: string) {
  return TRANSACTION_DATE_PATTERN.test(normaliseWhitespace(line))
}

function splitTransactionBlocks(lines: string[]) {
  const blocks: TransactionBlock[] = []
  let currentBlock: TransactionBlock | null = null

  for (const originalLine of lines) {
    const line = normaliseWhitespace(originalLine)

    if (!line || PAGE_OR_COLUMN_HEADER_PATTERN.test(line)) {
      continue
    }

    if (isTransactionDateLine(line)) {
      if (currentBlock) {
        blocks.push(currentBlock)
      }

      currentBlock = {
        date: line,
        lines: [],
      }

      continue
    }

    if (currentBlock) {
      currentBlock.lines.push(line)
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock)
  }

  return blocks
}

function isCreditDescription(description: string) {
  const lower = description.toLowerCase()

  return (
    lower.includes('magtape credit yoco') ||
    lower.includes('payshap credit') ||
    lower.includes('payshapid off-us') ||
    lower.includes('fnb app transfer from') ||
    lower.includes('interest') ||
    lower.includes('refund') ||
    lower.includes('reversal')
  )
}

function isDebitDescription(description: string) {
  const lower = description.toLowerCase()

  return (
    lower.includes('pos purchase') ||
    lower.includes('fuel purchase') ||
    lower.includes('electricity prepaid') ||
    lower.includes('fnb app payment to') ||
    lower.includes('fnb app geo payment to') ||
    lower.includes('fnb app rtc pmt to') ||
    lower.includes('send money app') ||
    lower.includes('debicheck') ||
    lower.includes('collection attempt') ||
    lower.includes('service fees') ||
    lower.includes('cash withdrawal')
  )
}

function getDescriptionLines(lines: string[], amountIndex: number) {
  return lines
    .slice(0, amountIndex)
    .filter((line) => {
      if (PAGE_OR_COLUMN_HEADER_PATTERN.test(line)) {
        return false
      }

      return !parseMoney(line)
    })
    .map(normaliseWhitespace)
    .filter(Boolean)
}

function buildRawReference(descriptionLines: string[]) {
  const referenceLines = descriptionLines.filter((line) =>
    CARD_REFERENCE_PATTERN.test(line)
  )

  return referenceLines.length > 0 ? referenceLines.join(' ') : ''
}

function categoriseDescription(description: string) {
  const lower = description.toLowerCase()

  if (lower.includes('magtape credit yoco')) {
    return {
      category: 'Yoco payout',
      confidenceScore: 0.98,
      parseWarning: '',
    }
  }

  if (lower.includes('payshap')) {
    return {
      category: 'Client payment',
      confidenceScore: 0.9,
      parseWarning: '',
    }
  }

  if (
    lower.includes('fuel purchase') ||
    lower.includes('engen') ||
    lower.includes('bp ') ||
    lower.includes('total ')
  ) {
    return {
      category: 'Fuel',
      confidenceScore: 0.95,
      parseWarning: '',
    }
  }

  if (lower.includes('electricity prepaid')) {
    return {
      category: 'Utilities',
      confidenceScore: 0.95,
      parseWarning: '',
    }
  }

  if (
    lower.includes('debicheck') ||
    lower.includes('rtc pmt to car') ||
    lower.includes('absa vf')
  ) {
    return {
      category: 'Vehicle finance',
      confidenceScore: 0.9,
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
    return {
      category: 'Stock and supplies',
      confidenceScore: 0.85,
      parseWarning: '',
    }
  }

  if (
    lower.includes('fnb app transfer from') ||
    lower.includes('transfer to pocket') ||
    lower.includes('send money app')
  ) {
    return {
      category: 'Transfer',
      confidenceScore: 0.8,
      parseWarning: '',
    }
  }

  if (
    lower.includes('checkers') ||
    lower.includes('pnp') ||
    lower.includes('pick n pay') ||
    lower.includes('spar') ||
    lower.includes('woolworths') ||
    lower.includes('kfc') ||
    lower.includes('pizza') ||
    lower.includes('tikka')
  ) {
    return {
      category: 'Needs review',
      confidenceScore: 0.55,
      parseWarning:
        'This merchant may be a business or personal expense. Review its classification.',
    }
  }

  return {
    category: 'Needs review',
    confidenceScore: 0.35,
    parseWarning:
      'No automatic category match was found. Review this transaction.',
  }
}

function parseTransactionBlock(
  block: TransactionBlock,
  statementEndDate: Date,
  rowIndex: number
): ParsedTransaction | null {
  const dateMatch = normaliseWhitespace(block.date).match(
    TRANSACTION_DATE_PATTERN
  )

  if (!dateMatch) {
    return null
  }

  const amountEntry = findNextMoneyLine(block.lines, 0)

  if (!amountEntry) {
    return null
  }

  const descriptionLines = getDescriptionLines(block.lines, amountEntry.index)
  const description = descriptionLines.join(' ').trim()

  if (!description) {
    return null
  }

  const amount = amountEntry.money
  const remainingLines = block.lines.slice(amountEntry.index + 1)
  const nextMoney = findNextMoneyLine(remainingLines, 0)
  const runningBalanceCents = nextMoney?.money.cents ?? 0

  let direction: 'credit' | 'debit'

  if (amount.marker === 'credit') {
    direction = 'credit'
  } else if (amount.marker === 'debit') {
    direction = 'debit'
  } else if (isCreditDescription(description)) {
    direction = 'credit'
  } else if (isDebitDescription(description)) {
    direction = 'debit'
  } else if (nextMoney?.money.marker === 'debit') {
    direction = 'debit'
  } else {
    direction = 'debit'
  }

  const categorisation = categoriseDescription(description)

  return {
    rowIndex,
    date: parseTransactionDate(dateMatch[1], dateMatch[2], statementEndDate),
    description,
    rawReference: buildRawReference(descriptionLines),
    amountCents: amount.cents,
    runningBalanceCents,
    direction,
    suggestedCategory: categorisation.category,
    confidenceScore: categorisation.confidenceScore,
    parseWarning: categorisation.parseWarning,
    rawExtractedText: {
      dateLine: block.date,
      lines: block.lines,
    },
    userCorrected: false,
    includeInImport: true,
  }
}

export async function extractTextFromPDF(file: File) {
  const fileBuffer = await file.arrayBuffer()

  const document = await pdfjsLib.getDocument({
    data: fileBuffer,
  }).promise

  const pageTexts: string[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()

    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join('\n')

    pageTexts.push(pageText)
  }

  return pageTexts.join('\n')
}

export function parseFNBStatementText(text: string): FNBParseResult {
  try {
    const lines = text
      .split(/\r?\n/)
      .map(normaliseWhitespace)
      .filter(Boolean)

    if (lines.length === 0) {
      return {
        success: false,
        error: 'No text could be extracted from this PDF.',
        statement: null,
        transactions: [],
        balanceCheck: {
          calculatedClosingCents: 0,
          varianceCents: 0,
          balanced: false,
        },
      }
    }

    const period = extractStatementPeriod(text)
    const statementEndDate = period.end

    if (!statementEndDate || Number.isNaN(statementEndDate.getTime())) {
      return {
        success: false,
        error: 'The statement period could not be detected from this FNB PDF.',
        statement: null,
        transactions: [],
        balanceCheck: {
          calculatedClosingCents: 0,
          varianceCents: 0,
          balanced: false,
        },
      }
    }

    const openingBalanceCents = extractBalanceAfterLabel(lines, 'Opening Balance')
    const closingBalanceCents = extractBalanceAfterLabel(lines, 'Closing Balance')
    const blocks = splitTransactionBlocks(lines)

    const transactions = blocks
      .map((block, rowIndex) =>
        parseTransactionBlock(block, statementEndDate, rowIndex)
      )
      .filter((transaction): transaction is ParsedTransaction => transaction !== null)
      .map((transaction, rowIndex) => ({
        ...transaction,
        rowIndex,
      }))

    if (transactions.length === 0) {
      return {
        success: false,
        error:
          'The PDF text was extracted, but no FNB transaction blocks could be recognised. Ensure the statement includes the Transactions in RAND section.',
        statement: null,
        transactions: [],
        balanceCheck: {
          calculatedClosingCents: 0,
          varianceCents: 0,
          balanced: false,
        },
      }
    }

    const totalCreditsCents = transactions
      .filter((transaction) => transaction.direction === 'credit')
      .reduce((sum, transaction) => sum + transaction.amountCents, 0)

    const totalDebitsCents = transactions
      .filter((transaction) => transaction.direction === 'debit')
      .reduce((sum, transaction) => sum + transaction.amountCents, 0)

    const calculatedClosingCents =
      openingBalanceCents + totalCreditsCents - totalDebitsCents

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
      creditTransactionCount: transactions.filter(
        (transaction) => transaction.direction === 'credit'
      ).length,
      debitTransactionCount: transactions.filter(
        (transaction) => transaction.direction === 'debit'
      ).length,
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
      error:
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while parsing the FNB PDF.',
      statement: null,
      transactions: [],
      balanceCheck: {
        calculatedClosingCents: 0,
        varianceCents: 0,
        balanced: false,
      },
    }
  }
}
