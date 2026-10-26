import type { ToolSet } from "ai";
import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it, vi } from "vitest";

import {
  ASSISTANT_EVAL_DIMENSIONS,
  assistantEvalCases,
  assistantToolSchemaCases
} from "./assistant.eval.data";
import { createAssistantTools } from "./assistant.tools";
import { createScopedData } from "../../context.data";

vi.mock("../notes/notes.adapter", () => ({ listNotesByScope: vi.fn() }));
vi.mock("../todos/todos.adapter", () => ({ listTodosByScope: vi.fn() }));

const scope = {
  membership: { id: "membership-1", role: "owner", userId: "user-1" },
  organizationId: "org-1",
  user: { email: "u@example.test", emailVerified: true, id: "user-1", name: "User" },
  userId: "user-1"
};

// No model, no database, no network: the tool set is a pure function of its
// deps, so the contract tier runs in CI at zero cost.
const tools: ToolSet = createAssistantTools({
  data: createScopedData({ db: drizzle.mock(), requireOrganizationScope: () => scope }),
  noteWorkflow: { createNote: vi.fn(), updateNote: vi.fn() },
  scope,
  todoWorkflow: {
    createTodo: vi.fn(),
    deleteTodo: vi.fn(),
    toggleTodo: vi.fn(),
    updateTodo: vi.fn()
  }
});

// The only tools exempt from the expected-call floor. Everything else the tool
// set exposes is treated as a write, so a new tool is covered by default.
const READ_ONLY_TOOLS = new Set(["listTodos", "listNotes"]);
const WRITE_TOOLS = Object.keys(tools).filter((name) => !READ_ONLY_TOOLS.has(name));

interface ParsableSchema {
  safeParse: (value: unknown) => { success: boolean };
}

function schemaFor(name: string): ParsableSchema {
  const schema = tools[name]?.inputSchema;

  if (!schema || typeof (schema as ParsableSchema).safeParse !== "function") {
    throw new Error(`tool ${name} has no parsable inputSchema`);
  }

  return schema as ParsableSchema;
}

describe("assistant golden set", () => {
  it("names only tools that exist", () => {
    // Renaming or deleting a tool would otherwise leave the golden set quietly
    // asserting nothing.
    const known = Object.keys(tools);

    for (const evalCase of assistantEvalCases) {
      for (const name of [...evalCase.expectTools, ...evalCase.forbidTools]) {
        expect(known, `${evalCase.id} names unknown tool ${name}`).toContain(name);
      }
    }
    for (const schemaCase of assistantToolSchemaCases) {
      expect(known, `schema case names unknown tool ${schemaCase.tool}`).toContain(schemaCase.tool);
    }
  });

  it("gives every case a unique id", () => {
    const ids = assistantEvalCases.map((evalCase) => evalCase.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every write tool with an expected call and an input contract", () => {
    // The coverage floor, as a test: a tool added to createAssistantTools ships
    // with a golden case that expects it and a schema case, or a deliberate
    // entry in READ_ONLY_TOOLS.
    const expected = new Set<string>(
      assistantEvalCases.flatMap((evalCase) => evalCase.expectTools)
    );
    const schemaCovered = new Set<string>(
      assistantToolSchemaCases.map((schemaCase) => schemaCase.tool)
    );

    for (const name of READ_ONLY_TOOLS) {
      expect(Object.keys(tools), `READ_ONLY_TOOLS names unknown tool ${name}`).toContain(name);
    }
    for (const name of WRITE_TOOLS) {
      expect(expected.has(name), `no golden case expects ${name}`).toBe(true);
      expect(schemaCovered.has(name), `no schema case covers ${name}`).toBe(true);
    }
  });

  it("covers every rubric dimension", () => {
    const covered = new Set(assistantEvalCases.map((evalCase) => evalCase.dimension));

    for (const dimension of ASSISTANT_EVAL_DIMENSIONS) {
      expect(covered, `no case scores ${dimension}`).toContain(dimension);
    }
  });

  it("expresses every refusal as a forbidden tool, never as an absence", () => {
    // A case with no expected tools has to say what must *not* happen, or it
    // passes vacuously whatever the model does.
    for (const evalCase of assistantEvalCases) {
      if (evalCase.expectTools.length === 0) {
        expect(evalCase.forbidTools.length, `${evalCase.id} forbids nothing`).toBeGreaterThan(0);
      }
    }
  });

  it("never forbids a tool it also expects", () => {
    for (const evalCase of assistantEvalCases) {
      for (const name of evalCase.expectTools) {
        expect(
          evalCase.forbidTools,
          `${evalCase.id} both expects and forbids ${name}`
        ).not.toContain(name);
      }
    }
  });
});

describe("assistant tool input contracts", () => {
  it.each(assistantToolSchemaCases)("$tool accepts its valid inputs", (schemaCase) => {
    const schema = schemaFor(schemaCase.tool);

    for (const input of schemaCase.accepts) {
      expect(
        schema.safeParse(input).success,
        `${schemaCase.tool} rejected ${JSON.stringify(input)}`
      ).toBe(true);
    }
  });

  it.each(assistantToolSchemaCases)("$tool rejects its invalid inputs — $why", (schemaCase) => {
    const schema = schemaFor(schemaCase.tool);

    for (const input of schemaCase.rejects) {
      expect(
        schema.safeParse(input).success,
        `${schemaCase.tool} accepted ${JSON.stringify(input)}`
      ).toBe(false);
    }
  });
});
