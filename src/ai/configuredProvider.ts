import { createHttpAiCommandProvider } from "./httpCommandProvider";

export function createConfiguredAiCommandProvider() {
  return createHttpAiCommandProvider({
    endpoint: import.meta.env.VITE_AI_COMMAND_ENDPOINT,
  });
}
