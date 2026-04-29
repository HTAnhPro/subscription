"use client";

import { useState, type FormEvent } from "react";
import { useWallet } from "@/app/wallet-context";
import { BalanceCard } from "./balance-card";
import { EventFeed } from "./event-feed";
import {
  useCreateSubscription,
  useClaimSubscription,
  useCancelSubscription,
} from "@/hooks/use-send-tx";
import { useMySubs, type Sub } from "@/hooks/use-subs";
import {
  toError,
  UserRejectedError,
  InsufficientBalanceError,
} from "@/lib/errors";

const inputCls =
  "w-full rounded-md border border-border bg-bg px-3 py-2 text-sm placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

function xlmToStroops(xlm: string): bigint {
  const [whole, frac = ""] = xlm.split(".");
  const padded = (frac + "0000000").slice(0, 7);
  return BigInt(whole || "0") * 10_000_000n + BigInt(padded || "0");
}

const STEPS = [
  { n: 1, label: "Connect", id: "connect" },
  { n: 2, label: "Open", id: "open" },
  { n: 3, label: "Manage", id: "manage" },
  { n: 4, label: "Activity", id: "activity" },
] as const;

export function Dashboard() {
  const { address, connect } = useWallet();

  const activeStep = !address ? 1 : 2;

  return (
    <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="text-[10px] uppercase tracking-[0.2em] text-subtle">
          Flow
        </div>
        <ol className="relative mt-4 space-y-5">
          <span className="absolute left-[11px] top-2 bottom-2 w-px bg-border" aria-hidden />
          {STEPS.map((s) => (
            <li key={s.id} className="relative flex items-start gap-3">
              <span
                className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold ${
                  s.n <= activeStep
                    ? "border-accent bg-accent text-bg"
                    : "border-border bg-bg text-subtle"
                }`}
              >
                {s.n}
              </span>
              <a
                href={`#step-${s.id}`}
                className={`pt-1 text-sm font-medium ${
                  s.n <= activeStep ? "text-fg" : "text-muted"
                }`}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </aside>

      <div className="space-y-6">
        <HowItWorks />

        <Step
          id="connect"
          n={1}
          title="Connect a Wallet"
          desc="Subscriber and merchant are two separate addresses. For a quick demo you can use one wallet for both, but typically these are different parties."
        >
          {address ? (
            <BalanceCard />
          ) : (
            <ConnectCta onConnect={connect} />
          )}
        </Step>

        <Step
          id="open"
          n={2}
          title="Open a Subscription"
          desc="Subscriber commits N XLM per period for M total periods. Pick a short period (e.g. 1 minute) so you can watch claims happen in real time."
        >
          {address ? (
            <CreateForm />
          ) : (
            <Locked>Connect a wallet first.</Locked>
          )}
        </Step>

        <Step
          id="manage"
          n={3}
          title="Claim or Cancel"
          desc="Switch the role tab to merchant once a period has elapsed and click Claim. Subscribers can cancel any time before all periods are claimed; unclaimed periods refund."
        >
          {address ? (
            <ManageList />
          ) : (
            <Locked>Connect a wallet first.</Locked>
          )}
        </Step>

        <Step
          id="activity"
          n={4}
          title="On-Chain Activity"
          desc="Every create / claim / cancel call emits a Soroban event. The feed polls the RPC every few seconds."
        >
          <EventFeed />
        </Step>
      </div>
    </div>
  );
}

function Step({
  id,
  n,
  title,
  desc,
  children,
}: {
  id: string;
  n: number;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`step-${id}`} className="scroll-mt-6">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-xs font-mono text-subtle">0{n}</span>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <span className="h-px flex-1 bg-border" />
      </div>
      {desc && <p className="mb-3 text-sm text-muted">{desc}</p>}
      {children}
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="rounded-lg border border-border bg-surface/60 p-5">
      <div className="text-[10px] uppercase tracking-[0.18em] text-subtle">
        How It Works
      </div>
      <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <li className="rounded-md border border-border bg-bg/40 p-3">
          <div className="text-xs font-semibold text-fg">1. Open</div>
          <p className="mt-1 text-xs text-muted">
            Subscriber locks in the recipient, amount per period, total
            periods, and how long each period lasts. The contract stamps an
            <span className="font-mono"> opened_at </span>and starts the clock.
          </p>
        </li>
        <li className="rounded-md border border-border bg-bg/40 p-3">
          <div className="text-xs font-semibold text-fg">2. Wait</div>
          <p className="mt-1 text-xs text-muted">
            One period must elapse before the merchant can pull anything. The
            countdown on each card shows when the next claim unlocks.
          </p>
        </li>
        <li className="rounded-md border border-border bg-bg/40 p-3">
          <div className="text-xs font-semibold text-fg">3. Claim</div>
          <p className="mt-1 text-xs text-muted">
            Merchant calls <span className="font-mono">claim()</span>, gets one
            period&apos;s worth, counter goes up. Skipped periods accumulate -
            you can claim several at once if you waited.
          </p>
        </li>
        <li className="rounded-md border border-border bg-bg/40 p-3">
          <div className="text-xs font-semibold text-fg">4. Cancel</div>
          <p className="mt-1 text-xs text-muted">
            Subscriber can stop the stream any time. Unclaimed periods refund
            in full. Once all periods are claimed the sub auto-completes.
          </p>
        </li>
      </ol>
      <p className="mt-3 text-[11px] text-subtle">
        Note: the contract tracks accounting on-chain. Actual XLM moves via the
        wallet calls beside each step.
      </p>
    </section>
  );
}

function Locked({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface/40 p-5 text-sm text-subtle">
      {children}
    </div>
  );
}

function ConnectCta({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h3 className="text-base font-semibold">Connect a Wallet to Manage Subscriptions</h3>
      <p className="mt-2 text-sm text-muted">
        Subscribers commit to recurring payments. Merchants claim each period as
        it falls due. Either side can cancel mid-stream.
      </p>
      <button
        onClick={onConnect}
        className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg transition-colors hover:bg-cyan-300"
      >
        Connect Wallet
      </button>
    </div>
  );
}

function CreateForm() {
  const { address } = useWallet();
  const create = useCreateSubscription(address);

  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [periods, setPeriods] = useState("12");
  const [periodValue, setPeriodValue] = useState("7");
  const [periodUnit, setPeriodUnit] = useState<"minutes" | "hours" | "days">(
    "days"
  );

  const unitSeconds =
    periodUnit === "minutes" ? 60 : periodUnit === "hours" ? 3600 : 86_400;
  const periodSeconds = Math.max(
    0,
    Math.floor((Number(periodValue) || 0) * unitSeconds)
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        merchant,
        perPeriodStroops: xlmToStroops(amount),
        periods: parseInt(periods, 10),
        periodSeconds,
      });
      setAmount("");
    } catch {
      // surfaced below
    }
  }

  const err = create.error ? toError(create.error) : null;

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-border bg-surface p-5"
    >
      <input
        type="text"
        placeholder="Merchant address (G...)"
        value={merchant}
        onChange={(e) => setMerchant(e.target.value.trim())}
        required
        className={`${inputCls} font-mono`}
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-subtle">
            XLM per period
          </label>
          <input
            type="number"
            step="0.0000001"
            min="0.0000001"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className={`${inputCls} mt-1 font-mono`}
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-subtle">
            Number of periods
          </label>
          <input
            type="number"
            min="1"
            placeholder="12"
            value={periods}
            onChange={(e) => setPeriods(e.target.value)}
            required
            className={`${inputCls} mt-1 font-mono`}
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-subtle">
          Period length
        </label>
        <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
          <input
            type="number"
            min="0"
            step="any"
            value={periodValue}
            onChange={(e) => setPeriodValue(e.target.value)}
            required
            className={`${inputCls} font-mono`}
          />
          <select
            value={periodUnit}
            onChange={(e) =>
              setPeriodUnit(e.target.value as typeof periodUnit)
            }
            className={`${inputCls} w-auto`}
          >
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </div>
      </div>
      <button
        type="submit"
        disabled={create.isPending || periodSeconds <= 0}
        className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg transition-colors hover:bg-cyan-300 disabled:opacity-50"
      >
        {create.isPending ? "Creating..." : "Open Subscription"}
      </button>
      {create.isSuccess && create.data && (
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${create.data.hash}`}
          target="_blank"
          rel="noreferrer"
          className="block rounded-md border border-accent/40 bg-accent/10 p-3 text-xs text-accent"
        >
          Subscription opened. Check the list below to find its ID, or view tx:{" "}
          <span className="font-mono">{create.data.hash.slice(0, 16)}…</span>
        </a>
      )}
      {err && (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          {err instanceof UserRejectedError
            ? "You rejected the request in your wallet."
            : err instanceof InsufficientBalanceError
              ? "Not enough XLM in your account."
              : `Failed: ${err.message}`}
        </div>
      )}
    </form>
  );
}

function fmtXlm(stroops: bigint): string {
  return (Number(stroops) / 1e7).toFixed(4).replace(/\.?0+$/, "");
}

function shorten(addr: string) {
  if (!addr) return "—";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function ManageList() {
  const { address } = useWallet();
  const { data: subs, isLoading } = useMySubs(address);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="h-16 animate-pulse rounded bg-elevated" />
      </div>
    );
  }

  if (!subs || subs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface/40 p-5 text-sm text-subtle">
        No subscriptions yet for this wallet. Open one above and it&apos;ll
        appear here.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {subs.map((s) => (
        <SubCard key={String(s.id)} sub={s} />
      ))}
    </ul>
  );
}

function SubCard({ sub }: { sub: Sub }) {
  const { address } = useWallet();
  const claim = useClaimSubscription(address);
  const cancel = useCancelSubscription(address);

  const isMerchant = sub.merchant === address;
  const isSubscriber = sub.subscriber === address;
  const totalXlm = sub.per_period * BigInt(sub.periods);
  const remainingPeriods = sub.periods - sub.claimed;
  const refundIfCancel = sub.per_period * BigInt(remainingPeriods);
  const progressPct = sub.periods > 0 ? (sub.claimed / sub.periods) * 100 : 0;

  const statusColor =
    sub.status === "Active"
      ? "border-accent/40 bg-accent/10 text-accent"
      : sub.status === "Completed"
        ? "border-success/40 bg-success/10 text-success"
        : "border-danger/40 bg-danger/10 text-danger";

  async function onClaim() {
    try {
      await claim.mutateAsync(sub.id);
    } catch {}
  }
  async function onCancel() {
    try {
      await cancel.mutateAsync(sub.id);
    } catch {}
  }

  const claimErr = claim.error ? toError(claim.error) : null;
  const cancelErr = cancel.error ? toError(cancel.error) : null;

  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold">
            Sub #{String(sub.id)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-subtle">
            {isSubscriber ? "you pay" : "you receive"}
          </span>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusColor}`}
        >
          {sub.status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <Stat label="Per period" value={`${fmtXlm(sub.per_period)} XLM`} />
        <Stat label="Periods" value={`${sub.claimed} / ${sub.periods}`} />
        <Stat
          label={isSubscriber ? "Merchant" : "Subscriber"}
          value={shorten(isSubscriber ? sub.merchant : sub.subscriber)}
          mono
        />
        <Stat label="Total commit" value={`${fmtXlm(totalXlm)} XLM`} />
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {sub.status === "Active" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {isMerchant && (
            <button
              onClick={onClaim}
              disabled={claim.isPending || sub.claimable === 0n}
              title={
                sub.claimable === 0n
                  ? "Nothing claimable yet — wait for the next period"
                  : undefined
              }
              className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-bg transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {claim.isPending
                ? "Claiming…"
                : sub.claimable > 0n
                  ? `Claim ${fmtXlm(sub.claimable)} XLM`
                  : "Nothing due yet"}
            </button>
          )}
          {isSubscriber && (
            <button
              onClick={onCancel}
              disabled={cancel.isPending || refundIfCancel === 0n}
              className="rounded-md border border-border bg-elevated px-3 py-2 text-xs font-medium text-fg transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {cancel.isPending
                ? "Cancelling…"
                : `Cancel & refund ${fmtXlm(refundIfCancel)} XLM`}
            </button>
          )}
        </div>
      )}

      {(claimErr || cancelErr) && (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger/5 p-2 text-[11px] text-danger">
          {(claimErr ?? cancelErr) instanceof UserRejectedError
            ? "You rejected the request in your wallet."
            : `Failed: ${(claimErr ?? cancelErr)?.message}`}
        </div>
      )}
    </li>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-subtle">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}
