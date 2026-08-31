export interface FNBStatement {
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

export interface ParsedTransaction {
  id?: string
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

export interface FNBParseResult {
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
