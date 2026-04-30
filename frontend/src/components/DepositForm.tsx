import { useState } from 'react'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { parseUnits } from 'viem'
import { CHAMBER_ABI } from '../abis/chamber'
import { ERC20_ABI } from '../abis/erc20'
import { poseidon2Hash2, generateSecretKey } from '../lib/poseidon2'
import { saveSecret } from '../lib/secrets'
import { zeroGTestnet } from '../wagmi'

const CHAMBER_ADDRESS = (import.meta.env.VITE_CHAMBER_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`

type Step = 'idle' | 'approving' | 'depositing' | 'done' | 'error'

interface State {
  step: Step
  error: string | null
  depositTxHash: string | null
}

export function DepositForm() {
  const { address, chain } = useAccount()
  const [tokenAddress, setTokenAddress] = useState(import.meta.env.VITE_TOKEN_ADDRESS || '')
  const [amount, setAmount] = useState('')
  const [state, setState] = useState<State>({ step: 'idle', error: null, depositTxHash: null })

  const isValidAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v)
  const tokenAddr = isValidAddress(tokenAddress) ? (tokenAddress as `0x${string}`) : undefined

  const { data: decimals } = useReadContract({
    address: tokenAddr, abi: ERC20_ABI, functionName: 'decimals',
    chainId: zeroGTestnet.id, query: { enabled: !!tokenAddr },
  })
  const { data: symbol } = useReadContract({
    address: tokenAddr, abi: ERC20_ABI, functionName: 'symbol',
    chainId: zeroGTestnet.id, query: { enabled: !!tokenAddr },
  })
  const { data: balance } = useReadContract({
    address: tokenAddr, abi: ERC20_ABI, functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: zeroGTestnet.id, query: { enabled: !!tokenAddr && !!address },
  })

  const { writeContractAsync } = useWriteContract()
  const [approveTx, setApproveTx] = useState<`0x${string}` | undefined>()
  const [depositTx, setDepositTx] = useState<`0x${string}` | undefined>()
  const { isLoading: waitApprove } = useWaitForTransactionReceipt({ hash: approveTx, chainId: zeroGTestnet.id })
  const { isLoading: waitDeposit } = useWaitForTransactionReceipt({ hash: depositTx, chainId: zeroGTestnet.id })

  const dec = Number(decimals ?? 18)
  const balDisplay = balance !== undefined
    ? `${(Number(balance) / 10 ** dec).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol ?? ''}`
    : null

  const canSubmit =
    !!address && chain?.id === zeroGTestnet.id &&
    isValidAddress(tokenAddress) && !!amount && Number(amount) > 0 &&
    state.step === 'idle'

  const isLoading = state.step === 'approving' || state.step === 'depositing' || waitApprove || waitDeposit

  async function handleDeposit() {
    if (!address || !tokenAddr) return
    setState({ step: 'approving', error: null, depositTxHash: null })
    try {
      const rawAmount = parseUnits(amount, dec)
      const secretKey = generateSecretKey()
      const hash_ = poseidon2Hash2(secretKey, BigInt(address))

      const approveTxHash = await writeContractAsync({
        address: tokenAddr, abi: ERC20_ABI, functionName: 'approve',
        args: [CHAMBER_ADDRESS, rawAmount],
      })
      setApproveTx(approveTxHash)
      setState(s => ({ ...s, step: 'depositing' }))

      const depositTxHash = await writeContractAsync({
        address: CHAMBER_ADDRESS, abi: CHAMBER_ABI, functionName: 'deposit',
        args: [hash_, rawAmount, tokenAddr],
      })
      setDepositTx(depositTxHash)

      saveSecret({
        id: crypto.randomUUID(),
        secretKey: '0x' + secretKey.toString(16),
        commitmentHash: '0x' + hash_.toString(16),
        amount: rawAmount.toString(),
        tokenAddress,
        depositTxHash,
        timestamp: Date.now(),
        spent: false,
      })
      setState({ step: 'done', error: null, depositTxHash })
    } catch (err: unknown) {
      setState({ step: 'error', error: err instanceof Error ? err.message : String(err), depositTxHash: null })
    }
  }

  function reset() {
    setState({ step: 'idle', error: null, depositTxHash: null })
    setApproveTx(undefined); setDepositTx(undefined); setAmount('')
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="card-inner border-mist-purple/20 bg-mist-purple/5 text-xs text-gray-400">
        <p className="font-medium text-mist-purple mb-1">Private deposit via MIST</p>
        <p>A random secret key is generated locally and used to compute a Poseidon2 commitment.
           Only you can withdraw with the secret key stored in the Dashboard.</p>
      </div>

      {/* Token address */}
      <div>
        <label className="label">Token Address</label>
        <div className="input-box">
          <input
            className="w-full bg-transparent outline-none text-sm font-mono text-white placeholder-gray-600"
            placeholder="0x…"
            value={tokenAddress}
            onChange={e => setTokenAddress(e.target.value)}
            disabled={isLoading}
          />
        </div>
        {balDisplay && (
          <p className="text-xs text-gray-500 mt-1 px-1">
            Balance: <span className="text-gray-300">{balDisplay}</span>
          </p>
        )}
      </div>

      {/* Amount */}
      <div>
        <label className="label">Amount</label>
        <div className="input-box flex items-center gap-2">
          <input
            className="flex-1 bg-transparent outline-none text-xl font-semibold text-white placeholder-gray-700"
            type="number" min="0" placeholder="0.00"
            value={amount} onChange={e => setAmount(e.target.value)}
            disabled={isLoading}
          />
          {symbol && <span className="text-sm text-gray-500 flex-shrink-0">{symbol}</span>}
        </div>
      </div>

      {/* Status messages */}
      {state.step === 'approving' && (
        <StatusBox color="purple" title="Step 1/2 — Approving">
          Approving token transfer. Confirm in your wallet…
        </StatusBox>
      )}
      {state.step === 'depositing' && (
        <StatusBox color="purple" title="Step 2/2 — Depositing">
          Sending private deposit. Confirm in your wallet…
        </StatusBox>
      )}
      {state.step === 'done' && (
        <StatusBox color="green" title="Deposit Complete">
          <p>Funds locked in Chamber. Your secret key is saved in the Dashboard.</p>
          <p className="mt-1 font-mono text-xs break-all text-gray-400">
            Tx: {state.depositTxHash}
          </p>
        </StatusBox>
      )}
      {state.step === 'error' && (
        <StatusBox color="red" title="Error">
          <p className="text-xs break-all">{state.error}</p>
        </StatusBox>
      )}

      {/* Button */}
      <div>
        {state.step === 'idle' || state.step === 'error' ? (
          <button className="btn-primary w-full py-4 glow-purple" onClick={handleDeposit} disabled={!canSubmit}>
            {!address ? 'Connect Wallet'
              : chain?.id !== zeroGTestnet.id ? 'Switch to 0G Testnet'
              : 'Deposit Privately into Chamber'}
          </button>
        ) : state.step === 'done' ? (
          <button className="btn-ghost w-full" onClick={reset}>New Deposit</button>
        ) : (
          <button className="btn-ghost w-full" disabled>
            <span className="animate-pulse">{state.step === 'approving' ? 'Approving…' : 'Depositing…'}</span>
          </button>
        )}
      </div>
    </div>
  )
}

function StatusBox({ color, title, children }: {
  color: 'purple' | 'green' | 'red'; title: string; children: React.ReactNode
}) {
  const cls = {
    purple: 'bg-mist-purple/10 border-mist-purple/30 text-purple-300',
    green:  'bg-mist-green/10  border-mist-green/30  text-green-300',
    red:    'bg-red-900/20     border-red-800/40     text-red-300',
  }[color]
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>
      <p className="font-semibold mb-1">{title}</p>
      {children}
    </div>
  )
}
