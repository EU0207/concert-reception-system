import { readFile } from "node:fs/promises";

interface NetLogSource {
  id: number;
  type: number;
}

interface NetLogEvent {
  type: number;
  source?: NetLogSource;
  params?: Record<string, unknown>;
}

interface NetLogFile {
  constants?: {
    logEventTypes?: Record<string, number>;
  };
  events?: NetLogEvent[];
}

export interface NetworkByteSummary {
  sentBytes: number;
  receivedBytes: number;
  totalBytes: number;
  excludedLoopbackBytes: number;
  unknownSocketBytes: number;
}

type AddressKind = "loopback" | "external";

export async function summarizeNetLogFile(filePath: string): Promise<NetworkByteSummary> {
  return summarizeNetLog(JSON.parse(await readFile(filePath, "utf8")) as NetLogFile);
}

export function summarizeNetLog(log: NetLogFile): NetworkByteSummary {
  const eventTypes = log.constants?.logEventTypes;
  if (!eventTypes) throw new Error("NetLogにイベント種別定義がありません。");
  const sentType = eventTypes.SOCKET_BYTES_SENT;
  const receivedType = eventTypes.SOCKET_BYTES_RECEIVED;
  if (sentType === undefined || receivedType === undefined) {
    throw new Error("NetLogにソケット送受信イベント定義がありません。");
  }

  const graph = new Map<string, Set<string>>();
  const addressKinds = new Map<string, Set<AddressKind>>();
  const events = log.events ?? [];

  for (const event of events) {
    const sourceKey = keyOf(event.source);
    if (!sourceKey) continue;
    ensure(graph, sourceKey);
    const dependency = event.params?.source_dependency as NetLogSource | undefined;
    const dependencyKey = keyOf(dependency);
    if (dependencyKey) connect(graph, sourceKey, dependencyKey);
    for (const address of remoteAddresses(event.params)) {
      const kinds = addressKinds.get(sourceKey) ?? new Set<AddressKind>();
      kinds.add(isLoopback(address) ? "loopback" : "external");
      addressKinds.set(sourceKey, kinds);
    }
  }

  let sentBytes = 0;
  let receivedBytes = 0;
  let excludedLoopbackBytes = 0;
  let unknownSocketBytes = 0;

  for (const event of events) {
    if (event.type !== sentType && event.type !== receivedType) continue;
    const byteCount = Number(event.params?.byte_count ?? 0);
    if (!Number.isFinite(byteCount) || byteCount < 0) {
      throw new Error("NetLogのbyte_countが不正です。");
    }
    const classification = classifySource(keyOf(event.source), graph, addressKinds);
    if (classification === "loopback") {
      excludedLoopbackBytes += byteCount;
      continue;
    }
    if (classification === "unknown") unknownSocketBytes += byteCount;
    if (event.type === sentType) sentBytes += byteCount;
    else receivedBytes += byteCount;
  }

  return {
    sentBytes,
    receivedBytes,
    totalBytes: sentBytes + receivedBytes,
    excludedLoopbackBytes,
    unknownSocketBytes
  };
}

function classifySource(
  sourceKey: string | undefined,
  graph: Map<string, Set<string>>,
  addressKinds: Map<string, Set<AddressKind>>
): AddressKind | "unknown" {
  if (!sourceKey) return "unknown";
  const directKinds = addressKinds.get(sourceKey);
  if (directKinds?.has("external")) return "external";
  if (directKinds?.has("loopback")) return "loopback";
  const visited = new Set<string>();
  const queue = [sourceKey];
  let foundLoopback = false;
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const kinds = addressKinds.get(current);
    if (kinds?.has("external")) return "external";
    if (kinds?.has("loopback")) foundLoopback = true;
    for (const neighbor of graph.get(current) ?? []) queue.push(neighbor);
  }
  return foundLoopback ? "loopback" : "unknown";
}

function remoteAddresses(params: Record<string, unknown> | undefined): string[] {
  if (!params) return [];
  const values: string[] = [];
  for (const field of ["address", "address_list", "remote_endpoint", "peer_address"] as const) {
    const value = params[field];
    if (typeof value === "string") values.push(value);
    else if (Array.isArray(value)) values.push(...value.filter((item): item is string => typeof item === "string"));
  }
  return values;
}

function isLoopback(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.startsWith("localhost:") ||
    normalized.startsWith("127.") ||
    normalized === "::1" ||
    normalized.startsWith("[::1]")
  );
}

function keyOf(source: NetLogSource | undefined): string | undefined {
  return source ? `${source.type}:${source.id}` : undefined;
}

function ensure(graph: Map<string, Set<string>>, key: string): Set<string> {
  const existing = graph.get(key);
  if (existing) return existing;
  const created = new Set<string>();
  graph.set(key, created);
  return created;
}

function connect(graph: Map<string, Set<string>>, left: string, right: string): void {
  ensure(graph, left).add(right);
  ensure(graph, right).add(left);
}
