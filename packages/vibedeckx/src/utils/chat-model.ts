import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLanguageModel = any;
import type { Storage } from "../storage/types.js";

export interface ChatProviderConfig {
  provider: "deepseek" | "openrouter";
  deepseekApiKey: string;
  openrouterApiKey: string;
  openrouterModel: string;
}

const DEFAULT_CONFIG: ChatProviderConfig = {
  provider: "deepseek",
  deepseekApiKey: "",
  openrouterApiKey: "",
  openrouterModel: "",
};

export function getChatProviderConfig(storage: Storage): ChatProviderConfig {
  const raw = storage.settings.get("chat_provider");
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    return {
      provider: parsed.provider === "openrouter" ? "openrouter" : "deepseek",
      deepseekApiKey: parsed.deepseekApiKey ?? "",
      openrouterApiKey: parsed.openrouterApiKey ?? "",
      openrouterModel: parsed.openrouterModel ?? "",
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function resolveChatModel(storage: Storage): AnyLanguageModel {
  const config = getChatProviderConfig(storage);

  if (config.provider === "openrouter") {
    const apiKey = config.openrouterApiKey || process.env.OPENROUTER_API_KEY || "";
    const model = config.openrouterModel || "deepseek/deepseek-chat-v3-0324";
    const openrouter = createOpenRouter({ apiKey });
    return openrouter(model);
  }

  const apiKey = config.deepseekApiKey || process.env.DEEPSEEK_API_KEY || "";
  const deepseek = createDeepSeek({ apiKey });
  return deepseek("deepseek-chat");
}
