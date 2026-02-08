export interface ProxyResult {
  ok: boolean;
  status: number;
  data: unknown;
}

export async function proxyToRemote(
  remoteUrl: string,
  apiKey: string,
  method: string,
  apiPath: string,
  body?: unknown
): Promise<ProxyResult> {
  try {
    const baseUrl = remoteUrl.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}${apiPath}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Vibedeckx-Api-Key": apiKey,
        "User-Agent": "Vibedeckx/1.0",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return { ok: response.ok, status: response.status, data };
    } else {
      const text = await response.text();
      const data = { error: `Non-JSON response (${response.status}): ${text.slice(0, 200)}` };
      return { ok: false, status: response.status, data };
    }
  } catch (error) {
    console.error("[proxyToRemote] Error:", error);
    return {
      ok: false,
      status: 0,
      data: { error: error instanceof Error ? error.message : "Connection failed" },
    };
  }
}
