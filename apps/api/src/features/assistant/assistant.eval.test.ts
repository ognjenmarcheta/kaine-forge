import type { ToolSet } from "ai";
import { describe, expect, it, vi } from "vitest";

import {
  ASSISTANT_EVAL_DIMENSIONS,
  assistantEvalCases,
  assistantToolSchemaCases
} from "./assistant.eval.data";
import { createAssistantTools } from "./assistant.tools";

vi.mock("../notes/notes.adapter", () => ({ listNotesByScope: vi.fn() }));
vi.mock("../todos/todos.adapter", () => ({ listTodosByScope: vi.fn() }));

const scope = {
  organizationId: "org-1",
  user: { email: "u@example.test", emailVerified: true, id: "user-1", name: "User" },
  userId: "user-1"
};

// No model, no database, no network: the tool set is a pure function of its
// deps, so the contract tier runs in CI at zero cost.
const tools: ToolSet = createAssistantTools({
  noteWorkflow: { createNote: vi.fn(), updateNote: vi.fn() },
  scope,
  todoWorkflow: {
    createTodo: vi.fn(),
    deleteTodo: vi.fn(),
    toggleTodo: vi.fn(),
    updateTodo: vi.fn()
  }
});

const WRITE_TOOLS = [
  "createTodo",
  "updateTodo",
  "deleteTodo",
  "completeTodo",
  "createNote",
  "updateNote",
  "addTodoToNote"
];

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

  it("covers every write tool", () => {
    // The coverage floor, as a test: a new write tool ships with a case or this
    // fails.
    // Widened deliberately: WRITE_TOOLS is an independent list, so a tool added
    // to the code but not to a golden case has to fail here rather than fail to
    // compile against the literal union.
    const mentioned = new Set<string>(
      assistantEvalCases.flatMap((evalCase) => evalCase.expectTools)
    );
    const schemaCovered = new Set<string>(
      assistantToolSchemaCases.map((schemaCase) => schemaCase.tool)
    );

    for (const name of WRITE_TOOLS) {
      expect(mentioned.has(name) || schemaCovered.has(name), `no golden case covers ${name}`).toBe(
        true
      );
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
