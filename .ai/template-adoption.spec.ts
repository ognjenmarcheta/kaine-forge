import { outro, text } from "@clack/prompts";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@clack/prompts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@clack/prompts")>()),
  intro: vi.fn(),
  outro: vi.fn(),
  text: vi.fn()
}));

// The CLI writes into the checkout it runs from: record its writes instead.
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn()
}));

const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

afterEach(() => {
  vi.restoreAllMocks();
  for (const [stream, descriptor] of [
    [process.stdin, stdinTty],
    [process.stdout, stdoutTty]
  ] as const) {
    if (descriptor) Object.defineProperty(stream, "isTTY", descriptor);
    else Reflect.deleteProperty(stream, "isTTY");
  }
});

it("validates required input, including the GitHub owner, during adoption", async () => {
  vi.spyOn(process, "argv", "get").mockReturnValue(["node", "template-adoption.ts"]);
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(text)
    .mockResolvedValueOnce("Acme Ops")
    .mockResolvedValueOnce("acme-ops")
    .mockResolvedValueOnce("acme-ops")
    .mockResolvedValueOnce("acme")
    .mockResolvedValueOnce("com.acme.ops.desktop")
    .mockResolvedValueOnce("Semver.")
    .mockResolvedValueOnce("Document design changes.");

  await import("./template-adoption");
  await vi.waitFor(() => expect(outro).toHaveBeenCalled());

  const validate = vi.mocked(text).mock.calls[0]?.[0].validate;
  if (typeof validate !== "function") throw new Error("Required input must have a validator");
  expect(validate(undefined)).toBe("Value is required.");
  expect(validate("")).toBe("Value is required.");
  expect(validate("   ")).toBe("Value is required.");
  expect(validate("Acme Ops")).toBeUndefined();
  const ownerValidate = vi.mocked(text).mock.calls[3]?.[0].validate;
  if (typeof ownerValidate !== "function")
    throw new Error("The owner prompt must have a validator");
  expect(ownerValidate("")).toBe("Value is required.");
  expect(output).toHaveBeenCalledWith(expect.stringContaining('"productName": "Acme Ops"'));
  expect(output).toHaveBeenCalledWith(expect.stringContaining('"repoOwner": "acme"'));
  expect(outro).toHaveBeenCalledWith(expect.stringContaining("Dry run only"));
});

it("refuses a config file without repoOwner before it writes any file", async () => {
  const {
    mkdtempSync,
    rmSync,
    writeFileSync: writeRealFile
  } = await vi.importActual<typeof import("node:fs")>("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "template-adoption-"));
  const configPath = join(dir, "template-adoption.json");
  writeRealFile(
    configPath,
    JSON.stringify({
      productName: "Acme Ops",
      desktopIdentifier: "com.acme.ops.desktop",
      compatibilityPolicy: "Semver.",
      designCompatibilityPolicy: "Document design changes."
    })
  );
  vi.spyOn(process, "argv", "get").mockReturnValue([
    "node",
    "template-adoption.ts",
    "--config",
    configPath,
    "--write"
  ]);
  const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});

  try {
    vi.resetModules();
    await import("./template-adoption");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));

    expect(error).toHaveBeenCalledWith(expect.stringContaining("'repoOwner' is required"));
    expect(writeFileSync).not.toHaveBeenCalled();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
