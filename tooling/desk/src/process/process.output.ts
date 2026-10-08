import { stripVTControlCharacters } from "node:util";

/**
 * The last lines of command output with colour codes removed, bounded in
 * lines and in characters. Safe to store in a report or show to a person.
 */
export const boundedTail = (text: string, maxLines = 200, maxChars = 16_000): string => {
  const lines = stripVTControlCharacters(text).replace(/\r\n?/g, "\n").trimEnd().split("\n");
  const tail = lines.slice(-maxLines).join("\n");
  return tail.length > maxChars ? `...${tail.slice(-maxChars)}` : tail;
};
