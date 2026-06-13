import { createHttpAiCommandProvider } from "./httpCommandProvider";
import { createMockAiCommandProvider } from "./mockCommandProvider";

export function createConfiguredAiCommandProvider() {
  const endpoint = import.meta.env.VITE_AI_COMMAND_ENDPOINT;

  if (!endpoint) {
    return createMockAiCommandProvider();
  }

  return createHttpAiCommandProvider({
    endpoint,
  });
}
