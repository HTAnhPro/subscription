import { rpc, xdr, scValToNative } from "@stellar/stellar-sdk";
import { sorobanRpc } from "./soroban";

export type SubKind = "created" | "claimed" | "cancelled";

export type ContractEvent = {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  kind: SubKind;
  actor: string;
  counterparty?: string;
  values: bigint[];
};

// Topic counts mirror the contract emits:
//   created/claimed -> (kind, actor, counterparty) = 3 topics
//   cancelled       -> (kind, subscriber)          = 2 topics
// Soroban RPC matches topic count exactly, so a uniform [symbol, *, *]
// silently drops the 2-topic events.
const TOPIC_LAYOUT: { kind: SubKind; topicCount: 2 | 3 }[] = [
  { kind: "created", topicCount: 3 },
  { kind: "claimed", topicCount: 3 },
  { kind: "cancelled", topicCount: 2 },
];

export async function getRecentEvents(
  contractId: string,
  windowLedgers = 5000
): Promise<ContractEvent[]> {
  const latest = await sorobanRpc.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - windowLedgers);
  const all: ContractEvent[] = [];
  for (const { kind, topicCount } of TOPIC_LAYOUT) {
    const symbol = xdr.ScVal.scvSymbol(kind).toXDR("base64");
    const topics = topicCount === 2 ? [symbol, "*"] : [symbol, "*", "*"];
    try {
      const res = await sorobanRpc.getEvents({
        startLedger,
        filters: [
          {
            type: "contract",
            contractIds: [contractId],
            topics: [topics],
          },
        ],
        limit: 50,
      });
      for (const e of res.events) all.push(decode(e));
    } catch {
      // skip
    }
  }
  return all.sort((a, b) => b.ledger - a.ledger).slice(0, 50);
}

function decode(e: rpc.Api.EventResponse): ContractEvent {
  const kind = scValToNative(e.topic[0]) as SubKind;
  const actor = scValToNative(e.topic[1]) as string;
  const counterparty =
    e.topic.length > 2 ? (scValToNative(e.topic[2]) as string) : undefined;
  const value = scValToNative(e.value);
  const values: bigint[] = Array.isArray(value)
    ? (value as unknown[]).map((v) => BigInt(v as bigint | number | string))
    : [BigInt(value as bigint | number | string)];
  return {
    id: e.id,
    ledger: e.ledger,
    ledgerClosedAt: e.ledgerClosedAt,
    txHash: e.txHash,
    kind,
    actor,
    counterparty,
    values,
  };
}
