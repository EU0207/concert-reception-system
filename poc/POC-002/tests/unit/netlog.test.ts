import { describe, expect, it } from "vitest";
import { summarizeNetLog } from "../support/netlog";

const constants = {
  logEventTypes: {
    SOCKET_BYTES_SENT: 1,
    SOCKET_BYTES_RECEIVED: 2,
    TCP_CONNECT_ATTEMPT: 3,
    SOCKET_ALIVE: 4
  }
};

describe("NetLog summary", () => {
  it("外部ソケットを集計しループバックを除外する", () => {
    const result = summarizeNetLog({
      constants,
      events: [
        { type: 4, source: { type: 10, id: 1 }, params: { source_dependency: { type: 20, id: 1 } } },
        { type: 3, source: { type: 20, id: 1 }, params: { address: "142.250.0.1:443" } },
        { type: 1, source: { type: 10, id: 1 }, params: { byte_count: 100 } },
        { type: 2, source: { type: 10, id: 1 }, params: { byte_count: 200 } },
        { type: 4, source: { type: 10, id: 2 }, params: { source_dependency: { type: 20, id: 2 } } },
        { type: 3, source: { type: 20, id: 2 }, params: { address: "127.0.0.1:4173" } },
        { type: 1, source: { type: 10, id: 2 }, params: { byte_count: 30 } },
        { type: 2, source: { type: 10, id: 2 }, params: { byte_count: 40 } }
      ]
    });
    expect(result).toEqual({
      sentBytes: 100,
      receivedBytes: 200,
      totalBytes: 300,
      excludedLoopbackBytes: 70,
      unknownSocketBytes: 0
    });
  });

  it("接続先不明のソケットは過小評価を避けて合計へ含める", () => {
    const result = summarizeNetLog({
      constants,
      events: [{ type: 1, source: { type: 10, id: 9 }, params: { byte_count: 50 } }]
    });
    expect(result.totalBytes).toBe(50);
    expect(result.unknownSocketBytes).toBe(50);
  });

  it("ソケット自身の接続先を依存グラフより優先する", () => {
    const result = summarizeNetLog({
      constants,
      events: [
        { type: 3, source: { type: 10, id: 7 }, params: { address: "127.0.0.1:8080" } },
        { type: 4, source: { type: 10, id: 7 }, params: { source_dependency: { type: 20, id: 7 } } },
        { type: 3, source: { type: 20, id: 7 }, params: { address: "8.8.8.8:443" } },
        { type: 2, source: { type: 10, id: 7 }, params: { byte_count: 999 } }
      ]
    });
    expect(result.totalBytes).toBe(0);
    expect(result.excludedLoopbackBytes).toBe(999);
  });
});
