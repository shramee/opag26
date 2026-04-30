import { WalletButton } from './components/WalletButton'
import { DepositForm } from './components/DepositForm'
import { SecretsVault } from './components/SecretsVault'

export default function App() {
  return (
    <div className="min-h-screen bg-og-dark">
      {/* Header */}
      <header className="border-b border-og-border px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">
              Dark Pool
            </h1>
            <p className="text-xs text-gray-500">Private OTC Desk · 0G Testnet</p>
          </div>
          <WalletButton />
        </div>
      </header>

      {/* Main */}
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* Network info banner */}
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          Connected to{' '}
          <span className="font-semibold text-gray-300">0G Testnet Newton</span>
          <span>(Chain ID 16601)</span>
        </div>

        {/* Deposit card */}
        <DepositForm />

        {/* Secrets vault */}
        <section>
          <SecretsVault />
        </section>

        {/* Footer note */}
        <p className="text-xs text-gray-600 text-center pb-4">
          Funds are locked via Poseidon2 commitments in the Chamber privacy contract.
          The secret key stored locally is required to reclaim your funds.
        </p>
      </main>
    </div>
  )
}
