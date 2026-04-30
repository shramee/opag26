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
  secretKey: bigint | null
  depositTxHash: string | null
}

export function DepositForm() {
  const { address, chain } = useAccount()
  const [tokenAddress, setTokenAddress] = useState(
    import.meta.env.VITE_TOKEN_ADDRESS || '',
  )
  const [amount, setAmount] = useState('')
  const [state, setState] = useState<State>({
    step: 'idle',
    error: null,
    secretKey: null,
    depositTxHash: null,
  })

  const isValidAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v)

  const tokenAddr = isValidAddress(tokenAddress)
    ? (tokenAddress as `0x${string}`)
    : undefined

  const { data: decimals } = useReadContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: 'decimals',
    chainId: zeroGTestnet.id,
    query: { enabled: !!tokenAddr },
  })

  const { data: symbol } = useReadContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: 'symbol',
    chainId: zeroGTestnet.id,
    query: { enabled: !!tokenAddr },
  })

  const { data: balance } = useReadContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: zeroGTestnet.id,
    query: { enabled: !!tokenAddr && !!address },
  })

  const { writeContractAsync } = useWriteContract()

  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>()
  const [depositTxHash, setDepositTxHashState] = useState<`0x${string}` | undefined>()

  const { isLoading: waitingApprove } = useWaitForTransactionReceipt({
    hash: approveTxHash,
    chainId: zeroGTestnet.id,
  })

  const { isLoading: waitingDeposit } = useWaitForTransactionReceipt({
    hash: depositTxHash,
    chainId: zeroGTestnet.id,
  })

  const dec = decimals ?? 18

  const formattedBalance =
    balance !== undefined
      ? `${(Number(balance) / 10 ** Number(dec)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol ?? ''}`
      : null

  const canSubmit =
    !!address &&
    chain?.id === zeroGTestnet.id &&
    isValidAddress(tokenAddress) &&
    !!amount &&
    Number(amount) > 0 &&
    state.step === 'idle'

  async function handleDeposit() {
    if (!address || !tokenAddr) return

    setState({ step: 'approving', error: null, secretKey: null, depositTxHash: null })

    try {
      const rawAmount = parseUnits(amount, Number(dec))

      // 1. Generate secret and compute commitment hash
      const secretKey = generateSecretKey()
      const ownerU256 = BigInt(address)
      const commitmentHash = poseidon2Hash2(secretKey, ownerU256)

      // 2. Approve the Chamber contract to spend tokens
      setState(s => ({ ...s, step: 'approving' }))
      const approveTx = await writeContractAsync({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CHAMBER_ADDRESS, rawAmount],
      })
      setApproveTxHash(approveTx)

      // Wait for approval confirmation
      setState(s => ({ ...s, step: 'approving' }))

      // 3. Execute the private deposit
      setState(s => ({ ...s, step: 'depositing' }))
      const depositTx = await writeContractAsync({
        address: CHAMBER_ADDRESS,
        abi: CHAMBER_ABI,
        functionName: 'deposit',
        args: [commitmentHash, rawAmount, tokenAddr],
      })
      setDepositTxHashState(depositTx)

      // 4. Persist the secret for later withdrawal
      saveSecret({
        id: crypto.randomUUID(),
        secretKey: '0x' + secretKey.toString(16),
        commitmentHash: '0x' + commitmentHash.toString(16),
        amount: rawAmount.toString(),
        tokenAddress,
        depositTxHash: depositTx,
        timestamp: Date.now(),
        spent: false,
      })

      setState({ step: 'done', error: null, secretKey, depositTxHash: depositTx })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ step: 'error', error: msg, secretKey: null, depositTxHash: null })
    }
  }

  function reset() {
    setState({ step: 'idle', error: null, secretKey: null, depositTxHash: null })
    setApproveTxHash(undefined)
    setDepositTxHashState(undefined)
    setAmount('')
  }

  const isLoading = state.step === 'approving' || state.step === 'depositing' || waitingApprove || waitingDeposit

  return (
    <div className="card space-y-5">
      <h2 className="text-xl font-bold text-white">Private Deposit</h2>
      <p className="text-sm text-gray-400">
        Funds are locked in the Chamber contract under a Poseidon2 commitment.
        Your secret key is saved locally and required for withdrawal.
      </p>

      {/* Token address */}
      <div>
        <label className="label">Token Address</label>
        <input
          className="input-field font-mono text-sm"
          placeholder="0x..."
          value={tokenAddress}
          onChange={e => setTokenAddress(e.target.value)}
          disabled={isLoading}
        />
        {formattedBalance && (
          <p className="text-xs text-gray-500 mt-1">Balance: {formattedBalance}</p>
        )}
      </div>

      {/* Amount */}
      <div>
        <label className="label">Amount</label>
        <div className="relative">
          <input
            className="input-field pr-16"
            type="number"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            disabled={isLoading}
          />
          {symbol && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
              {symbol}
            </span>
          )}
        </div>
      </div>

      {/* Status */}
      {state.step === 'approving' && (
        <StatusBox color="blue" title="Approving">
          Approving token transfer. Please confirm in your wallet…
        </StatusBox>
      )}
      {state.step === 'depositing' && (
        <StatusBox color="blue" title="Depositing">
          Sending private deposit. Please confirm in your wallet…
        </StatusBox>
      )}
      {state.step === 'done' && (
        <StatusBox color="green" title="Deposit Complete">
          <p>Your funds are now locked in the Chamber contract.</p>
          <p className="mt-1 font-mono text-xs break-all">
            Tx: {state.depositTxHash}
          </p>
          <p className="mt-2 text-yellow-400 text-xs font-semibold">
            Your secret key is stored in the Secrets Vault below. Keep it safe —
            it is required to withdraw your funds.
          </p>
        </StatusBox>
      )}
      {state.step === 'error' && (
        <StatusBox color="red" title="Error">
          <p className="break-all text-xs">{state.error}</p>
        </StatusBox>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {state.step === 'idle' || state.step === 'error' ? (
          <button
            className="btn-primary w-full"
            onClick={handleDeposit}
            disabled={!canSubmit || isLoading}
          >
            {!address
              ? 'Connect wallet first'
              : chain?.id !== zeroGTestnet.id
                ? 'Switch to 0G Testnet'
                : 'Deposit Privately'}
          </button>
        ) : state.step === 'done' ? (
          <button className="btn-secondary w-full" onClick={reset}>
            New Deposit
          </button>
        ) : (
          <button className="btn-primary w-full" disabled>
            <span className="animate-pulse">
              {state.step === 'approving' ? 'Approving…' : 'Depositing…'}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

function StatusBox({
  color,
  title,
  children,
}: {
  color: 'blue' | 'green' | 'red'
  title: string
  children: React.ReactNode
}) {
  const colors = {
    blue: 'bg-blue-900/30 border-blue-700/50 text-blue-300',
    green: 'bg-green-900/30 border-green-700/50 text-green-300',
    red: 'bg-red-900/30 border-red-700/50 text-red-300',
  }
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${colors[color]}`}>
      <p className="font-semibold mb-1">{title}</p>
      {children}
    </div>
  )
}
