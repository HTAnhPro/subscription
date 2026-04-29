"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { networkPassphrase } from "@/lib/stellar";
import {
  invokeContract,
  addrArg,
  i128Arg,
  u64Arg,
} from "@/lib/soroban";
import { nativeToScVal } from "@stellar/stellar-sdk";
import { StellarWalletsKit } from "@/lib/wallets";

const SUB_ID = process.env.NEXT_PUBLIC_MAIN_CONTRACT_ID;

function ensureId() {
  if (!SUB_ID) throw new Error("NEXT_PUBLIC_MAIN_CONTRACT_ID is not set");
  return SUB_ID;
}

function signer(addr: string) {
  return async (xdr: string) => {
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
      address: addr,
      networkPassphrase,
    });
    return signedTxXdr;
  };
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["balance"] });
  qc.invalidateQueries({ queryKey: ["subs"] });
  qc.invalidateQueries({ queryKey: ["events"] });
}

export function useCreateSubscription(address: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      merchant: string;
      perPeriodStroops: bigint;
      periods: number;
      periodSeconds: number;
    }) => {
      if (!address) throw new Error("connect a wallet first");
      const id = ensureId();
      return invokeContract({
        contractId: id,
        method: "create",
        args: [
          addrArg(address),
          addrArg(input.merchant),
          i128Arg(input.perPeriodStroops),
          nativeToScVal(input.periods, { type: "u32" }),
          u64Arg(input.periodSeconds),
        ],
        source: address,
        signXdr: signer(address),
      });
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useClaimSubscription(address: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subId: bigint) => {
      if (!address) throw new Error("connect a wallet first");
      const id = ensureId();
      return invokeContract({
        contractId: id,
        method: "claim",
        args: [addrArg(address), u64Arg(subId)],
        source: address,
        signXdr: signer(address),
      });
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useCancelSubscription(address: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subId: bigint) => {
      if (!address) throw new Error("connect a wallet first");
      const id = ensureId();
      return invokeContract({
        contractId: id,
        method: "cancel",
        args: [addrArg(address), u64Arg(subId)],
        source: address,
        signXdr: signer(address),
      });
    },
    onSuccess: () => invalidate(qc),
  });
}
