export interface DepositSecret {
  id: string
  secretKey: string        // hex bigint
  commitmentHash: string   // hex bigint — hash_ passed to deposit()
  amount: string           // raw token amount (bigint as string)
  tokenAddress: string
  depositTxHash: string
  timestamp: number
  spent: boolean
}

const STORAGE_KEY = 'chamber_secrets'

export function loadSecrets(): DepositSecret[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DepositSecret[]) : []
  } catch {
    return []
  }
}

export function saveSecret(secret: DepositSecret): void {
  const all = loadSecrets()
  all.unshift(secret)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function markSpent(id: string): void {
  const all = loadSecrets()
  const idx = all.findIndex(s => s.id === id)
  if (idx !== -1) {
    all[idx].spent = true
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  }
}
