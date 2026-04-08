// ------------- Imports -------------
import process from "node:process";
import { privateKeyToAccount } from "viem/accounts";
import { signAction } from "../node_modules/@hotstuff-labs/ts-sdk/dist/utils/signing.util.js";
import { NonceManager } from "../node_modules/@hotstuff-labs/ts-sdk/dist/utils/nonce.util.js";
import { EXCHANGE_OP_CODES } from "../node_modules/@hotstuff-labs/ts-sdk/dist/methods/exchange/op_codes.js";

// ------------- Defaults -------------
const DEFAULT_HTTP_SERVER = {
  mainnet: {
    api: "https://api.hotstuff.trade/",
    rpc: "https://api.hotstuff.trade/",
  },
  testnet: {
    api: "https://testnet-test-api.hotstuff.exchange/",
    rpc: "https://testnet-test-api.hotstuff.exchange/",
  },
};

const DEFAULT_WS_SERVER = {
  mainnet: "wss://api.hotstuff.trade/ws/",
  testnet: "wss://testnet-test-api.hotstuff.exchange/ws/",
};

const DEFAULT_KEEP_ALIVE = {
  interval: 30000,
  timeout: 10000,
};

const RESERVED_PROXY_KEYS = new Set(["then", "catch", "finally"]);

// ------------- Normalizers -------------
const pickSymbol = (params = {}) =>
  params.symbol ?? params.instrumentId ?? params.instrument_id;

const normalizeInstrument = (params = {}) => {
  const symbol = pickSymbol(params);
  return {
    ...params,
    symbol,
    instrumentId: params.instrumentId ?? params.instrument_id ?? symbol,
    instrument_id: params.instrument_id ?? params.instrumentId ?? symbol,
  };
};

const normalizeUser = (params = {}) => {
  const user = params.user ?? params.address;
  return {
    ...params,
    user,
    address: params.address ?? user,
  };
};

// ------------- Subscription Registry -------------
// Add new channels/aliases here and they become callable automatically.
export const SUBSCRIPTION_METHODS = Object.freeze({
  // Market
  ticker: { channel: "ticker", normalize: normalizeInstrument },
  orderbook: { channel: "orderbook", normalize: normalizeInstrument },
  trades: { channel: "trade", normalize: normalizeInstrument },
  trade: { channel: "trade", normalize: normalizeInstrument },
  mids: { channel: "mids", normalize: normalizeInstrument },
  bbo: { channel: "bbo", normalize: normalizeInstrument },
  index: { channel: "index", normalize: () => ({}) },
  chart: { channel: "chart", normalize: normalizeInstrument },

  // Account (SDK naming + concise aliases)
  accountSummary: { channel: "account_summary", normalize: normalizeUser },
  orders: { channel: "order", normalize: normalizeUser },
  accountOrderUpdates: { channel: "order", normalize: normalizeUser },
  accountBalanceUpdates: { channel: "balance", normalize: normalizeUser },
  positions: { channel: "position", normalize: normalizeUser },
  fills: { channel: "fills", normalize: normalizeUser },
  fundingPayments: { channel: "funding_payments", normalize: normalizeUser },
  agents: { channel: "agents", normalize: normalizeUser },

  // Explorer
  blocks: { channel: "blocks", normalize: () => ({}) },
  transactions: { channel: "transactions", normalize: () => ({}) },
});

// ------------- Shared Helpers -------------
function isFunction(value) {
  return typeof value === "function";
}

function isHttpTransport(value) {
  return value && isFunction(value.request);
}

function isWebSocketTransport(value) {
  return value && isFunction(value.subscribe) && isFunction(value.unsubscribe);
}

function combineSignals(signal, timeout) {
  const timeoutSignal = timeout ? AbortSignal.timeout(timeout) : null;
  if (signal && timeoutSignal) {
    return AbortSignal.any([signal, timeoutSignal]);
  }
  return signal ?? timeoutSignal ?? undefined;
}

function createEventWithDetail(detail) {
  if (typeof CustomEvent === "function") {
    return new CustomEvent("subscription", { detail });
  }
  return { detail };
}

function parseSubscriptionArgs(args) {
  if (isFunction(args[0])) {
    return { params: {}, listener: args[0] };
  }
  return { params: args[0] ?? {}, listener: args[1] };
}

function createDynamicProxy(base, createMethod) {
  const cache = new Map();

  return new Proxy(base, {
    get(target, prop, receiver) {
      if (typeof prop !== "string" || prop in target) {
        return Reflect.get(target, prop, receiver);
      }

      if (RESERVED_PROXY_KEYS.has(prop)) {
        return undefined;
      }

      if (!cache.has(prop)) {
        cache.set(prop, createMethod(target, prop));
      }

      return cache.get(prop);
    },
  });
}

function resolveIsTestnet(options = {}, env = process.env) {
  if (options.isTestnet !== undefined) {
    return options.isTestnet;
  }
  return (
    env.HOTSTUFF_TESTNET === "1" ||
    String(env.DATA_ENV ?? "").toLowerCase() === "testnet"
  );
}

function mergeHttpServer(server = {}) {
  return {
    mainnet: {
      api: server.mainnet?.api ?? DEFAULT_HTTP_SERVER.mainnet.api,
      rpc: server.mainnet?.rpc ?? DEFAULT_HTTP_SERVER.mainnet.rpc,
    },
    testnet: {
      api: server.testnet?.api ?? DEFAULT_HTTP_SERVER.testnet.api,
      rpc: server.testnet?.rpc ?? DEFAULT_HTTP_SERVER.testnet.rpc,
    },
  };
}

function mergeWsServer(server = {}) {
  return {
    mainnet: server.mainnet ?? DEFAULT_WS_SERVER.mainnet,
    testnet: server.testnet ?? DEFAULT_WS_SERVER.testnet,
  };
}

function resolveHttpTransport(options = {}) {
  return isHttpTransport(options.transport)
    ? options.transport
    : createHttpTransport(options);
}

function resolveWsTransport(options = {}) {
  return isWebSocketTransport(options.transport)
    ? options.transport
    : createWebSocketTransport(options);
}

function normalizePrivateKey(privateKey) {
  const raw = String(privateKey ?? "").trim();
  if (!raw) {
    return raw;
  }
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

function resolveNonceGetter(nonceInput) {
  if (isFunction(nonceInput)) {
    return nonceInput;
  }
  const manager = new NonceManager();
  return () => manager.getNonce();
}

// ------------- Transport: HTTP -------------
export function createHttpTransport(options = {}) {
  const isTestnet = resolveIsTestnet(options);
  const timeout = options.timeout ?? 5000;
  const server = mergeHttpServer(options.server);

  return {
    isTestnet,
    async request(endpoint, payload, signal, method = "POST") {
      const network = isTestnet ? "testnet" : "mainnet";
      const base = endpoint === "explorer" ? server[network].rpc : server[network].api;
      const url = new URL(endpoint, base);

      const response = await fetch(url, {
        method,
        body: method === "POST" ? JSON.stringify(payload) : undefined,
        headers: {
          "Accept-Encoding": "gzip, deflate, br, zstd",
          "Content-Type": "application/json",
        },
        keepalive: true,
        signal: combineSignals(signal, timeout),
      });

      if (
        !response.ok ||
        !response.headers.get("Content-Type")?.includes("application/json")
      ) {
        const body = await response.text().catch(() => undefined);
        throw new Error(body || `HTTP ${response.status}`);
      }

      const body = await response.json();
      if (body?.type === "error") {
        throw new Error(body.message || "API request failed.");
      }

      return body;
    },
  };
}

// ------------- Transport: WebSocket -------------
export function createWebSocketTransport(options = {}) {
  if (typeof WebSocket !== "function") {
    throw new Error("WebSocket is not available in this runtime.");
  }

  const isTestnet = resolveIsTestnet(options);
  const timeout = options.timeout ?? 15000;
  const server = mergeWsServer(options.server);
  const keepAlive = options.keepAlive ?? DEFAULT_KEEP_ALIVE;
  const autoConnect = options.autoConnect ?? true;

  let ws = null;
  let connectPromise = null;
  let keepAliveTimer = null;
  let rpcCounter = 0;
  let subCounter = 0;

  const pending = new Map();
  const subscriptions = new Map();
  const listeners = new Map();

  const wsUrl = () => (isTestnet ? server.testnet : server.mainnet);
  const isConnected = () => ws?.readyState === WebSocket.OPEN;

  function stopKeepAlive() {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  }

  function clearPending(error) {
    for (const request of pending.values()) {
      if (request.timer) {
        clearTimeout(request.timer);
      }
      request.reject(error);
    }
    pending.clear();
  }

  function startKeepAlive() {
    if (!keepAlive?.interval) {
      return;
    }
    stopKeepAlive();
    keepAliveTimer = setInterval(() => {
      ping().catch(() => {});
    }, keepAlive.interval);
  }

  function dispatchIncoming(message) {
    const request = pending.get(message?.id);
    if (request) {
      pending.delete(message.id);
      if (request.timer) {
        clearTimeout(request.timer);
      }

      if (message.error) {
        request.reject(
          new Error(
            `JSON-RPC Error ${message.error.code}: ${message.error.message}`,
          ),
        );
      } else {
        request.resolve(message.result);
      }
      return;
    }

    if (
      !message?.method ||
      !message?.params ||
      (message.method !== "subscription" && message.method !== "event")
    ) {
      return;
    }

    const channel = message.params.channel;
    const detail = message.params.data;

    for (const [id, sub] of subscriptions) {
      if (sub.channel !== channel) {
        continue;
      }
      const listener = listeners.get(id);
      if (listener) {
        listener(createEventWithDetail(detail));
      }
    }
  }

  async function connect() {
    if (isConnected()) {
      return;
    }
    if (connectPromise) {
      return connectPromise;
    }

    connectPromise = new Promise((resolve, reject) => {
      ws = new WebSocket(wsUrl());

      ws.onopen = () => {
        startKeepAlive();
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          dispatchIncoming(JSON.parse(event.data));
        } catch {
          // Ignore malformed payloads.
        }
      };

      ws.onerror = (error) => reject(error);
      ws.onclose = () => {
        stopKeepAlive();
        clearPending(new Error("WebSocket disconnected"));
      };
    }).finally(() => {
      connectPromise = null;
    });

    return connectPromise;
  }

  async function sendRpc(method, params) {
    await connect();

    const id = String(++rpcCounter);

    return new Promise((resolve, reject) => {
      const timer = timeout
        ? setTimeout(() => {
            pending.delete(id);
            reject(new Error("Request timeout"));
          }, timeout)
        : null;

      pending.set(id, { resolve, reject, timer });

      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method,
          params,
          id,
        }),
      );
    });
  }

  async function ping() {
    return sendRpc("ping", {});
  }

  async function disconnect() {
    stopKeepAlive();
    clearPending(new Error("WebSocket disconnected"));

    if (!ws) {
      return;
    }

    ws.close();
    ws = null;
  }

  async function subscribe(channel, payload = {}, listener) {
    if (!isFunction(listener)) {
      throw new Error("Subscription listener must be a function.");
    }

    const result = await sendRpc("subscribe", { channel, ...(payload ?? {}) });
    const serverChannel = result?.channels?.[0] ?? channel;
    const subscriptionId = `${serverChannel}:${Date.now()}:${++subCounter}`;

    subscriptions.set(subscriptionId, { channel: serverChannel });
    listeners.set(subscriptionId, listener);

    return { ...result, subscriptionId };
  }

  async function unsubscribe(subscriptionId) {
    const subscription = subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    subscriptions.delete(subscriptionId);
    listeners.delete(subscriptionId);

    if (!isConnected()) {
      return;
    }

    await sendRpc("unsubscribe", [subscription.channel]);
  }

  if (autoConnect) {
    connect().catch(() => {});
  }

  return {
    isTestnet,
    isConnected,
    connect,
    disconnect,
    ping,
    request() {
      throw new Error("Use subscribe/unsubscribe for WebSocket transport.");
    },
    subscribe,
    unsubscribe,
    getSubscriptions() {
      return Array.from(subscriptions.entries()).map(([id, sub]) => ({
        id,
        channel: sub.channel,
      }));
    },
  };
}

// ------------- Generic RPC Client -------------
export function createRpcClient({
  transport,
  endpoint = "info",
  methodMap = (method) => method,
}) {
  const client = {
    transport,
    endpoint,
    call(method, params = {}, signal) {
      const mappedMethod = isFunction(methodMap) ? methodMap(method) : method;
      return transport.request(endpoint, { method: mappedMethod, params }, signal);
    },
  };

  return createDynamicProxy(client, (target, method) =>
    (params = {}, signal) => target.call(method, params, signal)
  );
}

// ------------- Generic Subscription Client -------------
function createSubscriptionRunner(transport, methods = {}) {
  const registry = {
    ...SUBSCRIPTION_METHODS,
    ...methods,
  };

  const client = {
    transport,
    methods: registry,
    async call(method, params = {}, listener) {
      if (!isFunction(listener)) {
        throw new Error("Subscription listener must be a function.");
      }

      const spec = registry[method] ?? {};
      const channel = spec.channel ?? method;
      const payload = spec.normalize ? spec.normalize(params) : params;
      const result = await transport.subscribe(channel, payload, listener);

      return {
        ...result,
        unsubscribe: () => transport.unsubscribe(result.subscriptionId),
      };
    },
  };

  return createDynamicProxy(client, (target, method) =>
    (...args) => {
      const { params, listener } = parseSubscriptionArgs(args);
      return target.call(method, params, listener);
    }
  );
}

// ------------- Public Factories -------------
export function createApiClient({ endpoint, transport, methodMap } = {}) {
  if (!endpoint) {
    throw new Error("createApiClient requires an endpoint.");
  }

  return createRpcClient({
    transport: resolveHttpTransport({ transport }),
    endpoint,
    methodMap,
  });
}

const createEndpointClient = (endpoint) =>
  (options = {}) =>
    createRpcClient({
      transport: resolveHttpTransport(options),
      endpoint,
      methodMap: options.methodMap,
    });

export const createInfoClient = createEndpointClient("info");
export const createExplorerClient = createEndpointClient("explorer");

export function createExchangeClient(options = {}) {
  const transport = resolveHttpTransport(options);

  if (!options.privateKey && !options.wallet) {
    return createRpcClient({
      transport,
      endpoint: "exchange",
      methodMap: options.methodMap,
    });
  }

  const wallet = options.wallet ?? privateKeyToAccount(normalizePrivateKey(options.privateKey));
  const getNonce = resolveNonceGetter(options.nonce);

  const client = {
    transport,
    wallet,
    async callAction(action, params = {}, signal) {
      const txType = EXCHANGE_OP_CODES[action];
      if (txType === undefined) {
        throw new Error(`Unsupported exchange action "${action}".`);
      }

      const nonce = params.nonce ?? (await getNonce());
      const payload = { ...params, nonce };

      const signature = await signAction(
        {
          wallet,
          action: payload,
          txType,
        },
        { isTestnet: Boolean(transport.isTestnet) },
      );

      return transport.request(
        "exchange",
        {
          action: {
            data: payload,
            type: String(txType),
          },
          signature,
          nonce,
        },
        signal,
      );
    },
  };

  return createDynamicProxy(client, (target, action) =>
    (params = {}, signal) => target.callAction(action, params, signal)
  );
}

export function createSubscriptionClient(options = {}) {
  return createSubscriptionRunner(
    resolveWsTransport(options),
    options.methods,
  );
}

export function createSdk(options = {}) {
  const isTestnet = resolveIsTestnet(options);

  const http = isHttpTransport(options.httpTransport)
    ? options.httpTransport
    : createHttpTransport({ ...(options.http ?? {}), isTestnet });

  const ws = isWebSocketTransport(options.wsTransport)
    ? options.wsTransport
    : createWebSocketTransport({ ...(options.ws ?? {}), isTestnet });

  return {
    transports: { http, ws },
    clients: {
      info: createInfoClient({ transport: http }),
      exchange: createExchangeClient({ transport: http }),
      explorer: createExplorerClient({ transport: http }),
      subscriptions: createSubscriptionClient({
        transport: ws,
        methods: options.subscriptionMethods,
      }),
    },
  };
}
