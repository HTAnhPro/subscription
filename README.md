# Subscriptions

A small Stellar dApp on testnet for recurring on-chain payments. The subscriber commits to N XLM per period for M periods up front; the merchant claims one period's worth at a time as each window elapses. Either side can cancel mid-stream and unclaimed periods refund automatically.

[![CI](https://github.com/HTAnhPro/subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/HTAnhPro/subscription/actions)

- Live: https://subscription-kohl.vercel.app/
- Demo video: https://drive.google.com/file/d/14hSEvSX2ID9RX0LvtdyfZ4SUra5BYyXa/view?usp=sharing
- Subscription contract: [`CAJPCK5E...SREX`](https://stellar.expert/explorer/testnet/contract/CAJPCK5ETLJAR5NKJXX7P2LV5ARBNJYAKYJJCX2GUURKVU7FRB6ASREX)

## What's In Here

```
.
├── app/                    # Next.js App Router (page, layout, providers)
├── components/
│   ├── dashboard.tsx        # Subscriptions list with subscriber / merchant tabs
│   ├── hero-section.tsx     # Above-the-fold pitch
│   ├── balance-card.tsx     # Wallet XLM balance with caching
│   ├── wallet-button.tsx    # Connect / disconnect via Stellar Wallets Kit
│   └── event-feed.tsx       # Live "created / claimed / cancelled" log
├── hooks/
│   ├── use-subs.ts          # create / claim / cancel + read hooks
│   ├── use-balance.ts       # XLM balance with React Query
│   ├── use-contract-events.ts  # Soroban getEvents poller
│   └── use-send-tx.ts       # Generic invokeContract wrapper
├── lib/
│   ├── soroban.ts           # RPC client, invokeContract, ScVal helpers
│   ├── stellar.ts           # Horizon client + sendXlm
│   ├── wallets.ts           # Stellar Wallets Kit init (4 wallets, lazy)
│   ├── events.ts            # decode "created / claimed / cancelled" topics
│   └── errors.ts            # typed errors + toError mapper
├── contract/
│   └── main/                # SubscriptionVault contract
└── scripts/
    └── deploy.sh            # Build, deploy, write contract id into .env.local
```

## Stack

- Next.js 15 + React 19 + Tailwind v4
- @stellar/stellar-sdk (Horizon + Soroban RPC)
- @creit.tech/stellar-wallets-kit (Freighter, xBull, Lobstr, Albedo)
- @tanstack/react-query (caching, polling, loading states)
- soroban-sdk 22 (Rust contract)

## How It Works

A subscription is a stream of fixed-size XLM transfers gated by the ledger clock. The subscriber locks intent on chain (per-period amount, period count, period length, merchant address). The merchant pulls one period at a time after each window has fully elapsed. Cancelling closes the stream and any unclaimed periods are refundable to the subscriber.

```
        Subscriber                                 Merchant
           │                                          │
           │ create(merchant, per_period,             │
           │        periods, period_seconds)          │
           ▼                                          │
   ┌──────────────────────────────────┐               │
   │      SubscriptionVault           │               │
   │  - create(...)                   │               │
   │  - claim(merchant, sub_id) ◄─────┼───────────────┘
   │  - cancel(subscriber, sub_id)    │
   │  - subscription_of(sub_id)       │
   │  - claimable_now(sub_id)         │
   │  - emits 3 event types           │
   └──────────────────────────────────┘
                │
                ▼
          Soroban RPC
                │
                ▼
         getEvents → live UI feed
```

The contract is an accounting ledger. XLM moves via Horizon payments alongside the contract calls (same pattern as project 01 Tip Jar). A `Subscription` row holds `(subscriber, merchant, per_period, periods, claimed, period_seconds, opened_at, status)` and transitions `Active → Cancelled` on cancel or `Active → Completed` once `claimed == periods`.

The "claim one window at a time" rule is enforced on chain: `claim` rejects with `NotYetDue` until `now >= opened_at + (claimed + 1) * period_seconds`. Once the next window has elapsed the merchant can pull. Multiple windows can accumulate — if the merchant skips two cycles, a single `claim` call still only releases one period at a time.

## Try It Locally

You'll need:

- Node 22+
- Rust stable + the Stellar CLI (`stellar` v25+, with the `wasm32v1-none` target installed)
- A Stellar testnet wallet (Freighter, xBull, Lobstr, or Albedo all work)
- A funded testnet account (Friendbot or Freighter's one-click fund)

```bash
git clone https://github.com/HTAnhPro/subscription.git
cd subscription
npm install
cp .env.example .env.local
npm run dev
```

The deployed contract id ships in `.env.example` so the app works against testnet immediately. Open http://localhost:3000, connect a wallet, and create a subscription to yourself or a second wallet you control.

## Deploying Your Own Contract

If you want a fresh contract under your own admin key:

```bash
stellar keys generate alice --network testnet --fund   # if you don't have a key
./scripts/deploy.sh alice
```

What the script does:

1. Builds the wasm (`stellar contract build` on `contract/main`).
2. Deploys it to testnet under `alice` as the source.
3. Rewrites `NEXT_PUBLIC_MAIN_CONTRACT_ID` in `.env.local`.
4. Prints the Stellar Expert link for the freshly deployed contract.

Full notes live in [`docs/DEPLOY.md`](./docs/DEPLOY.md). Frontend deploys to Vercel automatically on push to `main`.

## Tests

```bash
cd contract && cargo test
```

8 tests covering the full lifecycle:

- `create_records_subscription`
- `claim_after_one_period_succeeds`
- `claim_before_period_returns_error`
- `cancel_refunds_unclaimed_periods`
- `multiple_claims_accumulate`
- `claim_past_total_returns_error`
- `cancel_then_claim_blocked`
- `non_merchant_cannot_claim`

CI runs them on every push (`.github/workflows/ci.yml`).

## Error Handling

Eight typed contract errors plus three frontend errors in `lib/errors.ts`:

Contract:

- `AmountMustBePositive` — non-positive `per_period` or `periods` on `create`.
- `NotFound` — `claim` / `cancel` against a `sub_id` that was never created.
- `NotMerchant` — `claim` called by anyone other than the merchant on the subscription.
- `NotSubscriber` — `cancel` called by anyone other than the subscriber.
- `NotYetDue` — `claim` before the next period window has elapsed.
- `AlreadyComplete` — `claim` after `claimed == periods`.
- `AlreadyCancelled` — `claim` or `cancel` against a subscription already closed.
- `NotInitialized` — XLM SAC address missing from instance storage.

Frontend (`lib/errors.ts`):

- `WalletNotFoundError` — no Stellar wallet detected in the browser.
- `UserRejectedError` — user closed the wallet popup.
- `InsufficientBalanceError` — `op_underfunded` or not enough XLM for the next period.

## Screenshots

| | |
|---|---|
| Create flow | ![Create](docs/screenshots/create.png) |
| Claim ready | ![Claim](docs/screenshots/claim.png) |
| Live event feed | ![Events](docs/screenshots/events.png) |
| Mobile view | ![Mobile](docs/screenshots/mobile.png) |
| CI passing | ![CI](docs/screenshots/ci.png) |
| Cargo test output | ![Tests](docs/screenshots/tests.png) |
