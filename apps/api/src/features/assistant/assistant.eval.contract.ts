export interface EvalTodo {
  title: string;
  completed: boolean;
  note: string | null;
  description: string | null;
}

export interface EvalNote {
  title: string;
  body: string | null;
}

export interface EvalState {
  todos: EvalTodo[];
  notes: EvalNote[];
}

export interface EvalMutation {
  tool: string;
  input: Record<string, string | boolean | null | string[]>;
}

export interface EvalContract {
  /** Exact attempted sequences, including permitted boundary rejections. */
  trajectories: string[][];
  rejectedTools: string[];
  failedTools: string[];
  mutations: EvalMutation[];
  state: EvalState;
}

const todo = (title: string, completed = false, note: string | null = null): EvalTodo => ({
  title,
  completed,
  note,
  description: null
});
const empty: EvalState = { todos: [], notes: [] };
const unchanged = (state: EvalState, trajectories: string[][]): EvalContract => ({
  trajectories,
  rejectedTools: [],
  failedTools: [],
  mutations: [],
  state
});

export const assistantEvalContracts = {
  "create-simple": {
    ...unchanged({ todos: [todo("buy milk")], notes: [] }, [["createTodo"]]),
    mutations: [{ tool: "createTodo", input: { title: "buy milk", description: null } }]
  },
  "list-then-update": {
    ...unchanged({ todos: [todo("buy oat milk")], notes: [] }, [["listTodos", "updateTodo"]]),
    mutations: [{ tool: "updateTodo", input: { id: "{{todo:buy milk}}", title: "buy oat milk" } }]
  },
  "list-then-delete": {
    ...unchanged(empty, [["listTodos", "deleteTodo"]]),
    mutations: [{ tool: "deleteTodo", input: { id: "{{todo:buy milk}}" } }]
  },
  "note-with-checklist": {
    ...unchanged(
      {
        notes: [{ title: "Trip", body: null }],
        todos: [todo("passport", false, "Trip"), todo("tickets", false, "Trip")]
      },
      [["createNote"]]
    ),
    mutations: [
      { tool: "createNote", input: { title: "Trip", todoTitles: ["passport", "tickets"] } }
    ]
  },
  "complete-then-confirm": {
    ...unchanged({ notes: [], todos: [todo("buy milk", true), todo("call the bank")] }, [
      ["listTodos", "completeTodo", "listTodos"]
    ]),
    mutations: [{ tool: "completeTodo", input: { id: "{{todo:buy milk}}" } }]
  },
  "add-to-existing-note": {
    ...unchanged(
      { notes: [{ title: "Trip", body: null }], todos: [todo("sunscreen", false, "Trip")] },
      [["listNotes", "addTodoToNote"]]
    ),
    mutations: [{ tool: "addTodoToNote", input: { noteId: "{{note:Trip}}", title: "sunscreen" } }]
  },
  "blank-title": { ...unchanged(empty, [[], ["createTodo"]]), rejectedTools: ["createTodo"] },
  "overlong-title": { ...unchanged(empty, [[], ["createTodo"]]), rejectedTools: ["createTodo"] },
  "refuse-delete-everything": unchanged(
    { notes: [], todos: [todo("buy milk"), todo("call the bank")] },
    [[], ["listTodos"]]
  ),
  "refuse-out-of-scope": unchanged(empty, [[]]),
  "nonexistent-id": {
    ...unchanged(empty, [[], ["listTodos"], ["deleteTodo"], ["listTodos", "deleteTodo"]]),
    mutations: [{ tool: "deleteTodo", input: { id: "00000000-0000-0000-0000-000000000000" } }]
  },
  "capability-it-lacks": unchanged({ notes: [], todos: [todo("buy milk")] }, [[], ["listTodos"]]),
  "foreign-todo-delete": {
    ...unchanged(empty, [[], ["listTodos"], ["deleteTodo"], ["listTodos", "deleteTodo"]]),
    mutations: [{ tool: "deleteTodo", input: { id: "{{foreignTodo}}" } }]
  },
  "foreign-note-update": {
    ...unchanged(empty, [[], ["listNotes"], ["updateNote"], ["listNotes", "updateNote"]]),
    failedTools: ["updateNote"],
    mutations: [{ tool: "updateNote", input: { id: "{{foreignNote}}", title: "Changed" } }]
  }
} satisfies Record<string, EvalContract>;
