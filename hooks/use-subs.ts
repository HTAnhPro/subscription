"use client";

import { useQuery } from "@tanstack/react-query";
import { readContract, u64Arg } from "@/lib/soroban";

const VAULT_ID = process.env.NEXT_PUBLIC_MAIN_CONTRACT_ID;

export type Sub = {
  id: bigint;
  subscriber: string;
  merchant: string;
  per_period: bigint;
  periods: number;
  claimed: number;
  period_seconds: bigint;
  opened_at: bigint;
  status: "Active" | "Cancelled" | "Completed" | "?";
  claimable: bigint;
};

const STATUS_LABELS: Sub["status"][] = ["Active", "Cancelled", "Completed"];

function normalizeStatus(raw: unknown): Sub["status"] {
  if (typeof raw === "number") return STATUS_LABELS[raw] ?? "?";
  if (typeof raw === "string") {
    return (STATUS_LABELS as readonly string[]).includes(raw)
      ? (raw as Sub["status"])
      : "?";
  }
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    return (STATUS_LABELS as readonly string[]).includes(raw[0])
      ? (raw[0] as Sub["status"])
      : "?";
  }
  if (raw && typeof raw === "object") {
    const tag = (raw as { tag?: string }).tag;
    if (tag && (STATUS_LABELS as readonly string[]).includes(tag))
      return tag as Sub["status"];
  }
  return "?";
}

export function useMySubs(address: string | null) {
  return useQuery<Sub[]>({
    queryKey: ["subs", VAULT_ID, address],
    queryFn: async () => {
      if (!VAULT_ID || !address) return [];
      const nextId = await readContract<bigint>({
        contractId: VAULT_ID,
        method: "next_id",
        args: [],
      }).catch(() => 0n);
      if (nextId === 0n) return [];

      const ids = Array.from({ length: Number(nextId) }, (_, i) => BigInt(i));
      const subs = await Promise.all(
        ids.map(async (id) => {
          const raw = await readContract<unknown>({
            contractId: VAULT_ID,
            method: "subscription_of",
            args: [u64Arg(id)],
          }).catch(() => null);
          if (!raw || typeof raw !== "object") return null;
          const r = raw as Record<string, unknown>;
          const sub: Sub = {
            id,
            subscriber: String(r.subscriber ?? ""),
            merchant: String(r.merchant ?? ""),
            per_period: BigInt((r.per_period as bigint | number) ?? 0),
            periods: Number(r.periods ?? 0),
            claimed: Number(r.claimed ?? 0),
            period_seconds: BigInt((r.period_seconds as bigint | number) ?? 0),
            opened_at: BigInt((r.opened_at as bigint | number) ?? 0),
            status: normalizeStatus(r.status),
            claimable: 0n,
          };
          if (sub.subscriber !== address && sub.merchant !== address)
            return null;
          if (sub.status === "Active") {
            sub.claimable = await readContract<bigint>({
              contractId: VAULT_ID,
              method: "claimable_now",
              args: [u64Arg(id)],
            }).catch(() => 0n);
          }
          return sub;
        })
      );

      return subs
        .filter((s): s is Sub => s !== null)
        .sort((a, b) => Number(b.id - a.id));
    },
    enabled: !!VAULT_ID && !!address,
    refetchInterval: 6_000,
  });
}
