import type { Provider } from "../contracts";
import type { AgentRunner } from "./agent.runner";
import { createClaudeRunner } from "./claude.runner";
import { createCodexRunner } from "./codex.runner";
import { createOpencodeRunner } from "./opencode.runner";

/** One host runner per provider. A `Record` makes the compiler name a new provider here. */
export const createHostRunners = (): Readonly<Record<Provider, AgentRunner>> => ({
  claude: createClaudeRunner(),
  codex: createCodexRunner(),
  opencode: createOpencodeRunner()
});
