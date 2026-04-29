import { WalletButton } from "@/components/wallet-button";
import { Dashboard } from "@/components/dashboard";

export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="flex items-center justify-between gap-3 pb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-subtle">
              On-chain recurring billing
            </p>
            <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-semibold tracking-tight sm:text-3xl">
              <span className="h-2 w-2 rounded-full bg-accent" />
              Subscriptions
            </h1>
          </div>
          <WalletButton />
        </header>

        <Dashboard />

        <footer className="mt-16 border-t border-border pt-5 text-xs text-subtle">
          Stellar Testnet · Soroban subscriptions · Ledger-gated period claims
        </footer>
      </div>
    </main>
  );
}
