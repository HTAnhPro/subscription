# Subscriptions

[![CI](https://github.com/HTAnhPro/subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/HTAnhPro/subscription/actions)

Recurring on-chain payments on Stellar Testnet. Subscriber commits to N XLM per period for M periods. Merchant claims one period at a time as it falls due. Either side can cancel mid-stream; unclaimed periods refund.

- Live: (Vercel URL goes here)
- Demo video: (1-min walkthrough goes here)
- Contract: [`CCKEEJ5D...7C44`](https://stellar.expert/explorer/testnet/contract/CCKEEJ5DWVFWNGWGQYZLSXKHB7DYNUWZVF4U7LXUUBFLANG6MI247C44)

## What's Inside

- Per-period claim instead of upfront. Merchant pulls one slot at a time as they fall due.
- Either-side cancel: unclaimed periods refund automatically.
- Auto-close at `claimed == periods`; no further claims accepted.

## Run

```bash
git clone https://github.com/HTAnhPro/subscription.git
cd subscription
npm install
cp .env.example .env.local
./scripts/deploy.sh alice
npm run dev
```

Open http://localhost:3000.

## Test

```bash
cd contract && cargo test
```

7 tests covering create, claim timing, cancel refunds, accumulation, and authorization.

## CI / CD

CI runs on push and PR (`.github/workflows/ci.yml`). Frontend auto-deploys to Vercel on `main`; contract is manual via `./scripts/deploy.sh`. Full notes in [`docs/DEPLOY.md`](./docs/DEPLOY.md).

## Notes

- Amounts are i128 stroops; the frontend converts via `xlmToStroops()`.
- The contract is an accounting ledger; XLM movement happens via Horizon payments alongside the contract calls.
- Subscriptions auto-close when `claimed == periods`. After cancel or completion, no further claims are accepted.

## Screenshots

![Mobile](docs/screenshots/mobile.png)
