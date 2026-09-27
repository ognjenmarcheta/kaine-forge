import { z } from "zod";

const codexEvent = z.object({
  type: z.string(),
  item: z
    .object({
      type: z.string(),
      command: z.string().optional(),
      exit_code: z.number().int().nullable().optional(),
      text: z.string().optional()
    })
    .optional()
});
const claudeEvent = z.object({
  type: z.string(),
  message: z
    .object({
      content: z.array(
        z.union([
          z.object({
            type: z.literal("tool_use"),
            name: z.string(),
            input: z.object({ file_path: z.string().optional(), command: z.string().optional() })
          }),
          z.object({ type: z.literal("text"), text: z.string() })
        ])
      )
    })
    .optional()
});

/** Observations for a reviewer. Command text is not proof of file reads or task success. */
export function inspectCodingTrace(harness: "codex" | "claude", lines: string[]) {
  const commands: Array<{ command: string; exitCode: number | null; completed: boolean }> = [];
  const requestedReads: string[] = [];
  const replies: string[] = [];
  let ignored = 0;
  for (const line of lines.filter((entry) => entry.trim())) {
    try {
      if (harness === "codex") {
        const event = codexEvent.parse(JSON.parse(line));
        if (event.type !== "item.completed") continue;
        if (event.item?.type === "command_execution" && event.item.command)
          commands.push({
            command: event.item.command,
            exitCode: event.item.exit_code ?? null,
            completed: true
          });
        if (event.item?.type === "agent_message" && event.item.text) replies.push(event.item.text);
      } else {
        const event = claudeEvent.parse(JSON.parse(line));
        if (event.type !== "assistant") continue;
        for (const content of event.message?.content ?? []) {
          if (content.type === "text") replies.push(content.text);
          else if (content.name === "Read" && content.input.file_path)
            requestedReads.push(content.input.file_path);
          else if (content.name === "Bash" && content.input.command)
            commands.push({ command: content.input.command, exitCode: null, completed: false });
        }
      }
    } catch {
      ignored++;
    }
  }
  return { harness, commands, requestedReads, replies, ignored, requiresHumanReview: true };
}
