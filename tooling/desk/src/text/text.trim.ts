/**
 * Remove trailing characters while `isTrimmed` holds. A loop, not a `[...]+$` pattern: that
 * pattern retries from every start position and is quadratic on a long run of those characters.
 */
export const trimEndWhile = (text: string, isTrimmed: (char: string) => boolean): string => {
  let end = text.length;
  while (end > 0 && isTrimmed(text.charAt(end - 1))) end -= 1;
  return text.slice(0, end);
};

/** `\s` as one character test. */
export const isSpace = (char: string): boolean => char.trim() === "";
