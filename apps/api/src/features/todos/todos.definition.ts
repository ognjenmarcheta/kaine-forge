export const TODOS_DEFINITIONS = {
  MIN_TITLE_LENGTH: 1,
  MAX_TITLE_LENGTH: 255,
  ROUTES: {
    LIST: "/todos",
    DETAIL: "/todos/:id"
  }
} as const;
