import type { AgentAvatarGlyph, AgentAvatarSpec } from "@repo/desk/contracts";
import { Avatar, AvatarFallback, type AvatarProps } from "@repo/ui";
import {
  Blocks,
  BookOpen,
  Bot,
  Compass,
  FileText,
  Gauge,
  Hammer,
  Lightbulb,
  Lock,
  NotebookPen,
  Palette,
  Scissors,
  Search,
  ShieldCheck,
  Terminal,
  Wand,
  type LucideIcon
} from "lucide-react";

/** The icon of each glyph name in `AGENT_AVATAR_GLYPHS`. */
const GLYPH_ICONS: Readonly<Record<AgentAvatarGlyph, LucideIcon>> = {
  bot: Bot,
  "notebook-pen": NotebookPen,
  hammer: Hammer,
  "shield-check": ShieldCheck,
  "file-text": FileText,
  lightbulb: Lightbulb,
  palette: Palette,
  wand: Wand,
  terminal: Terminal,
  blocks: Blocks,
  lock: Lock,
  "book-open": BookOpen,
  scissors: Scissors,
  search: Search,
  compass: Compass,
  gauge: Gauge
};

/**
 * An agent's avatar: its icon in the tone's text color on the tone's tint. Decorative: the
 * agent's name is always written beside it.
 */
export function AgentAvatar({
  avatar,
  size = "xs"
}: {
  readonly avatar: AgentAvatarSpec;
  readonly size?: AvatarProps["size"];
}) {
  const Glyph = GLYPH_ICONS[avatar.glyph];
  return (
    <Avatar size={size} aria-hidden="true" className="desk-avatar">
      <AvatarFallback tone={avatar.tone}>
        <Glyph aria-hidden="true" className="desk-avatar__glyph" />
      </AvatarFallback>
    </Avatar>
  );
}
