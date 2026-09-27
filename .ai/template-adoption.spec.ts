import { outro, text } from "@clack/prompts";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@clack/prompts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@clack/prompts")>()),
  intro: vi.fn(),
  outro: vi.fn(),
  text: vi.fn()
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

it("validates required input and accepts an empty optional owner during adoption", async () => {
  vi.spyOn(process, "argv", "get").mockReturnValue(["node", "template-adoption.ts"]);
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(text)
    .mockResolvedValueOnce("Acme Ops")
    .mockResolvedValueOnce("acme-ops")
    .mockResolvedValueOnce("acme-ops")
    .mockResolvedValueOnce("")
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
  expect(output).toHaveBeenCalledWith(expect.stringContaining('"productName": "Acme Ops"'));
  expect(outro).toHaveBeenCalledWith(expect.stringContaining("Dry run only"));
});
