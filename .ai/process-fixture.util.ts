/** Read the first complete PID line emitted by a synthetic child-process fixture. */
export function createFixturePidReader(): (chunk: Buffer) => number | undefined {
  let buffered = "";
  let pid: number | undefined;
  return (chunk) => {
    if (pid !== undefined) return pid;
    buffered += chunk.toString();
    const newline = buffered.indexOf("\n");
    if (newline < 0) return undefined;
    const line = buffered.slice(0, newline).trim();
    const parsed = Number(line);
    if (!/^[1-9]\d*$/.test(line) || !Number.isSafeInteger(parsed) || parsed > 2147483647) {
      throw new Error("Synthetic process emitted an invalid PID");
    }
    pid = parsed;
    return pid;
  };
}
