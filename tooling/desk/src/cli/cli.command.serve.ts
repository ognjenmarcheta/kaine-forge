import { parse } from "./cli.args";
import { UsageError, type CliCommand } from "./cli.types";
import { serveDesk } from "../server/server.launch";

const SERVE_USAGE = "pnpm desk serve [--port <n>] [--no-open]";

const parsePort = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const port = /^\d{1,5}$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(port) || port > 65_535) {
    throw new UsageError(`Expected a port from 0 to 65535, got '${value}'. Usage: ${SERVE_USAGE}`);
  }
  return port;
};

/**
 * `serve` starts the local server, prints its local URL, and runs
 * until Ctrl-C (or `deps.signal`). It then closes the server and exits 0. The
 * server listens on 127.0.0.1 only. Without `--port` it takes a free port.
 */
export const commandServe: CliCommand = async (args, deps, io) => {
  const { values, positionals } = parse(args, {
    port: { type: "string" },
    "no-open": { type: "boolean" }
  });
  if (positionals.length > 0) throw new UsageError(`Usage: ${SERVE_USAGE}`);
  const port = parsePort(values.port);

  await (deps.serve ?? serveDesk)({
    port,
    open: values["no-open"] !== true,
    cwd: deps.cwd,
    print: io.out,
    signal: deps.signal
  });
  return 0;
};
