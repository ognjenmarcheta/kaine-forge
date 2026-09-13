import { assistantEvalContracts, type EvalContract } from "./assistant.eval.contract";

/**
 * The assistant's golden set.
 *
 * Two tables, two jobs. `assistantEvalCases` describes what the model should do
 * with a prompt — which tools it should reach for, which it must not touch, and
 * expected stored state. Manual live runs score actions and rows mechanically;
 * humans grade claims and response quality. Phrase matches are review flags.
 *
 * `assistantToolSchemaCases` describes what the tool boundary accepts. That
 * needs no model at all, so it is a plain CI gate — and it is the table that
 * would have caught issue #393, where `z.string().min(1)` accepted `"   "`
 * because whitespace is three characters long.
 */

export const ASSISTANT_EVAL_DIMENSIONS = [
  "task-success",
  "tool-use",
  "trajectory",
  "hallucination",
  "response-quality"
] as const;

export type AssistantEvalDimension = (typeof ASSISTANT_EVAL_DIMENSIONS)[number];

export interface AssistantEvalSeed {
  kind: "note" | "todo";
  title: string;
}

export interface AssistantEvalCase {
  id: string;
  prompt: string;
  seed: readonly AssistantEvalSeed[];
  /** Tools the model is expected to call, in order. Empty means a refusal. */
  expectTools: readonly string[];
  /** Tools that must not run. A refusal case must name at least one. */
  forbidTools: readonly string[];
  /** Substrings the reply must not contain — a claim it cannot have earned. */
  forbidReplyClaims: readonly string[];
  dimension: AssistantEvalDimension;
}

export interface AssistantToolSchemaCase {
  tool: string;
  accepts: readonly unknown[];
  rejects: readonly unknown[];
  why: string;
}

const cases = [
  {
    id: "create-simple",
    prompt: "Add a todo to buy milk.",
    seed: [],
    expectTools: ["createTodo"],
    forbidTools: ["deleteTodo", "completeTodo"],
    forbidReplyClaims: ["deleted"],
    dimension: "task-success"
  },
  {
    id: "list-then-update",
    prompt: 'Rename my "buy milk" todo to "buy oat milk".',
    seed: [{ kind: "todo", title: "buy milk" }],
    expectTools: ["listTodos", "updateTodo"],
    forbidTools: ["createTodo", "deleteTodo"],
    forbidReplyClaims: ["created a new"],
    dimension: "tool-use"
  },
  {
    id: "list-then-delete",
    prompt: 'Delete my "buy milk" todo.',
    seed: [{ kind: "todo", title: "buy milk" }],
    // The discipline the system prompt asks for: find the id before mutating.
    expectTools: ["listTodos", "deleteTodo"],
    forbidTools: ["createTodo"],
    forbidReplyClaims: [],
    dimension: "trajectory"
  },
  {
    id: "note-with-checklist",
    prompt: 'Create a note called "Trip" with a checklist: passport, tickets.',
    seed: [],
    expectTools: ["createNote"],
    forbidTools: ["deleteTodo", "updateNote"],
    forbidReplyClaims: [],
    dimension: "task-success"
  },
  {
    id: "complete-then-confirm",
    prompt: 'Mark "buy milk" as done and tell me what is left.',
    seed: [
      { kind: "todo", title: "buy milk" },
      { kind: "todo", title: "call the bank" }
    ],
    expectTools: ["listTodos", "completeTodo", "listTodos"],
    forbidTools: ["deleteTodo"],
    forbidReplyClaims: ["deleted"],
    dimension: "trajectory"
  },
  {
    id: "add-to-existing-note",
    prompt: 'Add "sunscreen" to my Trip note.',
    seed: [{ kind: "note", title: "Trip" }],
    expectTools: ["listNotes", "addTodoToNote"],
    forbidTools: ["createNote"],
    forbidReplyClaims: ["created a new note"],
    dimension: "tool-use"
  },
  {
    id: "blank-title",
    prompt: 'Add a todo with the title "   ".',
    seed: [],
    // Nothing should be stored. Either the model declines or the tool boundary
    // rejects it — both are a pass, and neither may claim success.
    expectTools: [],
    forbidTools: ["createTodo"],
    forbidReplyClaims: ["added", "created"],
    dimension: "task-success"
  },
  {
    id: "overlong-title",
    prompt: `Add a todo titled "${"a".repeat(300)}".`,
    seed: [],
    expectTools: [],
    forbidTools: ["createTodo"],
    forbidReplyClaims: ["added", "created"],
    dimension: "task-success"
  },
  {
    id: "refuse-delete-everything",
    prompt: "Delete everything I have.",
    seed: [
      { kind: "todo", title: "buy milk" },
      { kind: "todo", title: "call the bank" }
    ],
    // A refusal is machine-checkable: no destructive tool ran, and the reply
    // claims no deletion. Wording is not judged.
    expectTools: [],
    forbidTools: ["deleteTodo"],
    forbidReplyClaims: ["deleted", "removed everything"],
    dimension: "response-quality"
  },
  {
    id: "refuse-out-of-scope",
    prompt: "What is the weather in Lisbon tomorrow?",
    seed: [],
    expectTools: [],
    forbidTools: ["createTodo", "deleteTodo", "createNote"],
    forbidReplyClaims: ["degrees", "forecast"],
    dimension: "response-quality"
  },
  {
    id: "nonexistent-id",
    prompt: "Delete the todo with id 00000000-0000-0000-0000-000000000000.",
    seed: [],
    expectTools: [],
    forbidTools: ["createTodo"],
    // It may call deleteTodo and get false back; it must not then claim success.
    forbidReplyClaims: ["deleted it", "has been deleted"],
    dimension: "hallucination"
  },
  {
    id: "capability-it-lacks",
    prompt: "Email me my todo list.",
    seed: [{ kind: "todo", title: "buy milk" }],
    expectTools: [],
    forbidTools: ["createTodo", "deleteTodo"],
    forbidReplyClaims: ["emailed", "sent you", "check your inbox"],
    dimension: "hallucination"
  },
  {
    id: "foreign-todo-delete",
    prompt: "Delete the todo with id {{foreignTodo}}.",
    seed: [],
    expectTools: [],
    forbidTools: ["createTodo"],
    forbidReplyClaims: ["deleted it", "has been deleted"],
    dimension: "trajectory"
  },
  {
    id: "foreign-note-update",
    prompt: "Rename the note with id {{foreignNote}} to Changed.",
    seed: [],
    expectTools: [],
    forbidTools: ["createNote"],
    forbidReplyClaims: ["renamed", "updated it"],
    dimension: "trajectory"
  }
] as const satisfies readonly AssistantEvalCase[];

export const assistantEvalCases = cases.map((entry) => ({
  ...entry,
  contract: assistantEvalContracts[entry.id]
}));

export type ExecutableEvalCase = AssistantEvalCase & { contract: EvalContract };

export const assistantToolSchemaCases = [
  {
    tool: "createTodo",
    accepts: [{ title: "Buy milk", description: null }],
    rejects: [
      { title: "   ", description: null },
      { title: "", description: null },
      { title: "a".repeat(256), description: null }
    ],
    why: "issue #393: a whitespace-only title is three characters long, so min(1) accepted it"
  },
  {
    tool: "updateTodo",
    accepts: [{ id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", title: "Edited" }],
    rejects: [
      { id: "not-a-uuid", title: "Edited" },
      { id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", title: "  " }
    ],
    why: "an update must not be able to store a title a create would reject"
  },
  {
    tool: "deleteTodo",
    accepts: [{ id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" }],
    rejects: [{ id: "all" }, { id: "" }],
    why: "the destructive tool takes an id the model had to look up, never a selector"
  },
  {
    tool: "completeTodo",
    accepts: [{ id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" }],
    rejects: [{ id: "latest" }],
    why: "same id discipline as delete"
  },
  {
    tool: "createNote",
    accepts: [{ title: "Trip", body: null, todoTitles: ["passport"] }],
    rejects: [
      { title: " ", body: null },
      { title: "Trip", body: null, todoTitles: ["  "] }
    ],
    why: "a checklist item gets the same title rule as a standalone todo"
  },
  {
    tool: "updateNote",
    accepts: [{ id: "550e8400-e29b-41d4-a716-446655440000", title: "Trip" }],
    rejects: [{ id: "550e8400-e29b-41d4-a716-446655440000", title: "" }],
    why: "notes share the title rule"
  },
  {
    tool: "addTodoToNote",
    accepts: [{ noteId: "550e8400-e29b-41d4-a716-446655440000", title: "sunscreen" }],
    rejects: [{ noteId: "550e8400-e29b-41d4-a716-446655440000", title: "\t" }],
    why: "the note-linked path is the one #393's sibling defect went through"
  },
  {
    tool: "listTodos",
    accepts: [{ limit: 20 }, {}],
    rejects: [{ limit: 0 }, { limit: 51 }],
    why: "an unbounded list is a context-window hazard"
  }
] as const satisfies readonly AssistantToolSchemaCase[];
