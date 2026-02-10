import { randomUUID } from "crypto";

export interface ProxyResult {
  ok: boolean;
  status: number;
  data: unknown;
  errorCode?: "timeout" | "network_error" | "auth_error" | "server_error" | "non_json_response";
  requestId?: string;
  durationMs?: number;
}

export interface ProxyOptions {
  requestId?: string;
  timeoutMs?: number;
}

const TRANSIENT_STATUS_CODES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

function isTransientError(result: ProxyResult): boolean {
  return (
    result.errorCode === "network_error" ||
    result.errorCode === "non_json_response" ||
    TRANSIENT_STATUS_CODES.has(result.status)
  );
}

async function proxyOnce(
  baseUrl: string,
  apiKey: string,
  method: string,
  apiPath: string,
  body: unknown | undefined,
  requestId: string,
  timeoutMs: number,
): Promise<ProxyResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "X-Vibedeckx-Api-Key": apiKey,
      "X-Request-Id": requestId,
      "User-Agent": "Vibedeckx/1.0",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(`${baseUrl}${apiPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const durationMs = Date.now() - start;
    console.log(`[proxyToRemote] ${requestId} -> ${response.status} (${durationMs}ms)`);

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      let errorCode: ProxyResult["errorCode"];
      if (!response.ok) {
        if (response.status === 401) errorCode = "auth_error";
        else if (response.status >= 500) errorCode = "server_error";
      }
      return { ok: response.ok, status: response.status, data, errorCode, requestId, durationMs };
    } else {
      const text = await response.text();
      const data = { error: `Non-JSON response (${response.status}): ${text.slice(0, 200)}` };
      return { ok: false, status: response.status, data, errorCode: "non_json_response", requestId, durationMs };
    }
  } catch (error) {
    const durationMs = Date.now() - start;
    const message = error instanceof Error ? error.message : "Connection failed";
    console.error(`[proxyToRemote] ${requestId} FAILED: ${message} (${durationMs}ms)`);

    let errorCode: ProxyResult["errorCode"] = "network_error";
    if (error instanceof Error && error.name === "AbortError") {
      errorCode = "timeout";
    }

    return {
      ok: false,
      status: 0,
      data: { error: errorCode === "timeout" ? `Request timed out after ${timeoutMs}ms` : message },
      errorCode,
      requestId,
      durationMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function proxyToRemote(
  remoteUrl: string,
  apiKey: string,
  method: string,
  apiPath: string,
  body?: unknown,
  options?: ProxyOptions
): Promise<ProxyResult> {
  const requestId = options?.requestId ?? randomUUID();
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const baseUrl = remoteUrl.replace(/\/+$/, "");

  console.log(`[proxyToRemote] ${requestId} ${method} ${baseUrl}${apiPath}`);

  let result = await proxyOnce(baseUrl, apiKey, method, apiPath, body, requestId, timeoutMs);

  for (let attempt = 1; attempt <= MAX_RETRIES && isTransientError(result); attempt++) {
    const delay = RETRY_BASE_DELAY_MS * attempt;
    console.log(`[proxyToRemote] ${requestId} retrying (${attempt}/${MAX_RETRIES}) after ${delay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    result = await proxyOnce(baseUrl, apiKey, method, apiPath, body, requestId, timeoutMs);
  }

  return result;
}
