// Collects what Chrome's chrome://extensions → Errors page would show for the
// extension: console errors and warnings, and uncaught errors and rejections, from its
// service worker, its own pages (popup, options, word list) and its content scripts.
import { createServer } from "node:net";
import type { BrowserContext, ConsoleMessage } from "@playwright/test";

interface ExtensionReport {
  /** "service worker", "extension page /popup.html", "content script on www.youtube.com"… */
  source: string;
  level: "error" | "warning";
  text: string;
  /** The first stack frame (or the message's location), when there is one. */
  frame: string;
}

/** A free TCP port for `--remote-debugging-port`. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("No port")),
      );
    });
  });
}

const firstAt = (stack: string | undefined) =>
  stack
    ?.split("\n")
    .find((line) => line.trim().startsWith("at "))
    ?.trim() ?? "";

const where = (url: string, line?: number, column?: number) =>
  url ? `${url}:${(line ?? 0) + 1}:${(column ?? 0) + 1}` : "";

interface CdpRemoteObject {
  type?: string;
  value?: unknown;
  description?: string;
  unserializableValue?: string;
}
interface CdpCallFrame {
  url: string;
  lineNumber: number;
  columnNumber: number;
  functionName: string;
}
interface CdpMessage {
  id?: number;
  method?: string;
  sessionId?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
}

const describe = (arg: CdpRemoteObject) =>
  arg.type === "string"
    ? String(arg.value)
    : (arg.description ??
      arg.unserializableValue ??
      JSON.stringify(arg.value) ??
      String(arg.type));

const frameOf = (frames: CdpCallFrame[] | undefined) => {
  const top = frames?.[0];
  return top
    ? `at ${top.functionName || "<anonymous>"} (${where(top.url, top.lineNumber, top.columnNumber)})`
    : "";
};

/** A CDP connection to the whole browser (started with `--remote-debugging-port`). */
export interface BrowserCdp {
  send(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<CdpMessage>;
  onEvent(listener: (message: CdpMessage) => void): () => void;
  close(): void;
}

export async function connectBrowserCdp(port: number): Promise<BrowserCdp> {
  const version = (await (
    await fetch(`http://127.0.0.1:${port}/json/version`)
  ).json()) as { webSocketDebuggerUrl: string };
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP")), {
      once: true,
    });
  });
  let nextId = 0;
  const pending = new Map<number, (message: CdpMessage) => void>();
  const listeners = new Set<(message: CdpMessage) => void>();
  socket.addEventListener("message", (event: MessageEvent) => {
    const message = JSON.parse(String(event.data)) as CdpMessage;
    if (message.id === undefined) {
      for (const listener of listeners) listener(message);
      return;
    }
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  return {
    send: (method, params = {}, sessionId) =>
      new Promise<CdpMessage>((resolve) => {
        const id = ++nextId;
        pending.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params, sessionId }));
      }),
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => socket.close(),
  };
}

/**
 * Watches the extension's service worker over `cdp`: Playwright reports a worker's
 * console calls but not its uncaught errors. Every service worker the extension starts
 * (again, after a stop or a reload) is attached; the inspector replays what the worker
 * logged before the attach.
 */
async function watchServiceWorkers(
  cdp: BrowserCdp,
  origin: string,
  push: (report: ExtensionReport & { exceptionId?: number }) => void,
  revoke: (exceptionId: number) => void,
): Promise<() => void> {
  const { send } = cdp;
  const attached = new Set<string>();
  const source = "service worker";

  async function attach(targetId: string) {
    if (attached.has(targetId)) return;
    attached.add(targetId);
    const reply = await send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const sessionId = reply.result?.["sessionId"] as string | undefined;
    if (!sessionId) return;
    await Promise.all([
      send("Runtime.enable", {}, sessionId),
      send("Log.enable", {}, sessionId),
    ]);
  }

  const unsubscribe = cdp.onEvent((message) => {
    const params = message.params ?? {};
    switch (message.method) {
      case "Target.targetCreated":
      case "Target.targetInfoChanged": {
        const info = params["targetInfo"] as {
          targetId: string;
          type: string;
          url: string;
        };
        if (info.type === "service_worker" && info.url.startsWith(origin))
          void attach(info.targetId);
        break;
      }
      case "Target.targetDestroyed":
        attached.delete(params["targetId"] as string);
        break;
      case "Runtime.consoleAPICalled": {
        const type = params["type"] as string;
        if (type !== "error" && type !== "warning") break;
        push({
          source,
          level: type,
          text: (params["args"] as CdpRemoteObject[]).map(describe).join(" "),
          frame: frameOf(
            (params["stackTrace"] as { callFrames: CdpCallFrame[] } | undefined)
              ?.callFrames,
          ),
        });
        break;
      }
      case "Runtime.exceptionThrown": {
        const details = params["exceptionDetails"] as {
          exceptionId: number;
          text: string;
          exception?: CdpRemoteObject;
          url?: string;
          lineNumber: number;
          columnNumber: number;
          stackTrace?: { callFrames: CdpCallFrame[] };
        };
        push({
          source,
          level: "error",
          text: `${details.text} ${details.exception ? describe(details.exception) : ""}`.trim(),
          frame:
            frameOf(details.stackTrace?.callFrames) ||
            where(details.url ?? "", details.lineNumber, details.columnNumber),
          exceptionId: details.exceptionId,
        });
        break;
      }
      case "Runtime.exceptionRevoked":
        revoke(params["exceptionId"] as number);
        break;
      case "Log.entryAdded": {
        const entry = params["entry"] as {
          level: string;
          text: string;
          url?: string;
          lineNumber?: number;
          stackTrace?: { callFrames: CdpCallFrame[] };
        };
        if (entry.level !== "error" && entry.level !== "warning") break;
        push({
          source,
          level: entry.level,
          text: entry.text,
          frame:
            frameOf(entry.stackTrace?.callFrames) ||
            where(entry.url ?? "", entry.lineNumber),
        });
        break;
      }
    }
  });
  await send("Target.setDiscoverTargets", { discover: true });
  return unsubscribe;
}

export interface ErrorCollector {
  reports: ExtensionReport[];
  /** Every report, one per line, for a failure message. */
  format(): string;
  stop(): void;
}

/**
 * Starts collecting the extension's reports in `context`; `cdp` is a connection to
 * the same browser (for the service worker; see watchServiceWorkers).
 */
export async function collectExtensionErrors(
  context: BrowserContext,
  extensionId: string,
  cdp: BrowserCdp,
): Promise<ErrorCollector> {
  const origin = `chrome-extension://${extensionId}/`;
  const reports: (ExtensionReport & { exceptionId?: number })[] = [];

  const pageSource = (url: string) =>
    url.startsWith(origin)
      ? `extension page ${new URL(url).pathname}`
      : `content script on ${url.startsWith("http") ? new URL(url).host : url.slice(0, 40)}`;

  const onConsole = (message: ConsoleMessage) => {
    const type = message.type();
    if (type !== "error" && type !== "warning") return;
    // The service worker is watched over CDP (with its uncaught errors).
    if (message.worker()) return;
    const page = message.page();
    if (!page) return;
    const location = message.location();
    // An extension page's every message; on a web page, those from the extension's
    // scripts (content scripts) or about its files.
    if (!page.url().startsWith(origin) && !location.url.startsWith(origin))
      return;
    reports.push({
      source: pageSource(page.url()),
      level: type,
      text: message.text(),
      frame: where(location.url, location.lineNumber, location.columnNumber),
    });
  };
  const onWebError = (webError: import("@playwright/test").WebError) => {
    const page = webError.page();
    const error = webError.error();
    const url = page?.url() ?? "";
    if (!url.startsWith(origin) && !error.stack?.includes(origin)) return;
    reports.push({
      source: pageSource(url),
      level: "error",
      text: `Uncaught ${error.name}: ${error.message}`,
      frame: firstAt(error.stack),
    });
  };
  context.on("console", onConsole);
  context.on("weberror", onWebError);
  const stopWorkers = await watchServiceWorkers(
    cdp,
    origin,
    (report) => reports.push(report),
    (exceptionId) => {
      const i = reports.findIndex((r) => r.exceptionId === exceptionId);
      if (i >= 0) reports.splice(i, 1);
    },
  );

  return {
    reports,
    format: () =>
      reports
        .map(
          (r, i) =>
            `${i + 1}. [${r.level}] ${r.source}\n   ${r.text.replaceAll("\n", "\n   ")}\n   ${r.frame}`,
        )
        .join("\n"),
    stop() {
      context.off("console", onConsole);
      context.off("weberror", onWebError);
      stopWorkers();
    },
  };
}
