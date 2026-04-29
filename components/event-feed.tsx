"use client";

import { useContractEvents } from "@/hooks/use-contract-events";
import type { ContractEvent } from "@/lib/events";

function shortAddr(a: string) {
  return `${a.slice(0, 4)}...${a.slice(-4)}`;
}
function fmtXlm(stroops: bigint) {
  return (Number(stroops) / 1e7).toFixed(4).replace(/\.?0+$/, "");
}
function fmtPeriod(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds % 86_400 === 0) {
    const d = seconds / 86_400;
    return d === 1 ? "1 day" : `${d} days`;
  }
  if (seconds % 3600 === 0) {
    const h = seconds / 3600;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  if (seconds % 60 === 0) {
    const m = seconds / 60;
    return m === 1 ? "1 minute" : `${m} minutes`;
  }
  return `${seconds}s`;
}
function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function EventFeed() {
  const { data, isLoading, isError } = useContractEvents();

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-subtle">
        Subscription Activity
        <span className="text-[10px] italic text-accent">syncing&hellip;</span>
      </div>
      {isLoading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-elevated" />
          ))}
        </div>
      ) : isError ? (
        <div className="mt-3 text-sm text-danger">Failed to load events</div>
      ) : !data || data.length === 0 ? (
        <div className="mt-3 text-sm text-subtle">
          No subscription events yet. Open one above to seed the feed.
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {data.map((e) => (
            <Row key={e.id} e={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ e }: { e: ContractEvent }) {
  return (
    <li className="border-l-2 border-accent/40 pl-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <span className="font-mono text-xs uppercase tracking-wider">
            {e.kind}
          </span>
          <span className="text-subtle"> · </span>
          <span className="font-mono text-xs">{shortAddr(e.actor)}</span>
          {e.counterparty && e.counterparty !== e.actor && (
            <>
              <span className="text-subtle"> ↔ </span>
              <span className="font-mono text-xs">
                {shortAddr(e.counterparty)}
              </span>
            </>
          )}
        </div>
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${e.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-subtle hover:text-accent"
        >
          {timeAgo(e.ledgerClosedAt)}
        </a>
      </div>
      <div className="mt-1 font-mono text-xs text-muted">{summarize(e)}</div>
    </li>
  );
}

function summarize(e: ContractEvent): string {
  const [a, b, c] = e.values;
  switch (e.kind) {
    case "created":
      return `${fmtXlm(a)} XLM × ${b} periods every ${fmtPeriod(Number(c))}`;
    case "claimed":
      return `${fmtXlm(a)} XLM claimed (${b} periods now)`;
    case "cancelled":
      return `${fmtXlm(a)} XLM refunded (${b} periods unclaimed)`;
    default:
      return e.values.map((x) => x.toString()).join(" · ");
  }
}
