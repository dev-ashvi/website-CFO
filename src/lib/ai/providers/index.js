import { createOpenAiProvider } from "./openaiProvider.js";
import { createDeepSeekProvider } from "./deepseekProvider.js";
import { createQwenProvider } from "./qwenProvider.js";
import { createMockProvider } from "./mockProvider.js";

/**
 * @param {{ env?: Record<string, string | undefined>; useMock?: boolean }} [options]
 */
export function createProviderRegistry(options = {}) {
  const env = options.env ?? (typeof process !== "undefined" ? process.env : {});
  if (options.useMock) {
    const mock = createMockProvider();
    return { mock, openai: mock, deepseek: mock, qwen: mock };
  }

  return {
    mock: createMockProvider(),
    openai: createOpenAiProvider({
      apiKey: env.OPENAI_API_KEY || env.WYZ_OPENAI_API_KEY,
    }),
    deepseek: createDeepSeekProvider({
      apiKey: env.DEEPSEEK_API_KEY || env.WYZ_DEEPSEEK_API_KEY,
    }),
    qwen: createQwenProvider({
      apiKey: env.QWEN_API_KEY || env.DASHSCOPE_API_KEY || env.WYZ_QWEN_API_KEY,
    }),
  };
}

export { createOpenAiProvider } from "./openaiProvider.js";
export { createDeepSeekProvider } from "./deepseekProvider.js";
export { createQwenProvider } from "./qwenProvider.js";
export { createMockProvider } from "./mockProvider.js";
