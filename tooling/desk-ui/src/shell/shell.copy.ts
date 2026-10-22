import { toast } from "sonner";

/** Copy text to the clipboard and say how it went in a toast. The browser can refuse. */
export function copyText(text: string, copied: string, failed: string): void {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(copied))
    .catch(() => toast.error(failed));
}

/** Open an external page in a new tab, without giving it a handle on the desk. */
export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
