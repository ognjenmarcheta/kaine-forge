/* eslint-disable */
import * as types from "./graphql";
import { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
  "query MobileHealth {\n  health\n}": typeof types.MobileHealthDocument;
  "query GetMobileTodos($limit: Int, $offset: Int) {\n  todos(limit: $limit, offset: $offset) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation CreateMobileTodo($input: CreateTodoInput!) {\n  createTodo(input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateMobileTodo($id: ID!, $input: UpdateTodoInput!) {\n  updateTodo(id: $id, input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteMobileTodo($id: ID!) {\n  deleteTodo(id: $id)\n}\n\nmutation ToggleMobileTodo($id: ID!) {\n  toggleTodo(id: $id) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}": typeof types.GetMobileTodosDocument;
  "query Health {\n  health\n}": typeof types.HealthDocument;
  "query GetTodos($limit: Int, $offset: Int) {\n  todos(limit: $limit, offset: $offset) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation CreateTodo($input: CreateTodoInput!) {\n  createTodo(input: $input) {\n    id\n    title\n    description\n    completed\n  }\n}\n\nmutation UpdateTodo($id: ID!, $input: UpdateTodoInput!) {\n  updateTodo(id: $id, input: $input) {\n    id\n    title\n    description\n    completed\n  }\n}\n\nmutation DeleteTodo($id: ID!) {\n  deleteTodo(id: $id)\n}\n\nmutation ToggleTodo($id: ID!) {\n  toggleTodo(id: $id) {\n    id\n    completed\n  }\n}": typeof types.GetTodosDocument;
};
const documents: Documents = {
  "query MobileHealth {\n  health\n}": types.MobileHealthDocument,
  "query GetMobileTodos($limit: Int, $offset: Int) {\n  todos(limit: $limit, offset: $offset) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation CreateMobileTodo($input: CreateTodoInput!) {\n  createTodo(input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateMobileTodo($id: ID!, $input: UpdateTodoInput!) {\n  updateTodo(id: $id, input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteMobileTodo($id: ID!) {\n  deleteTodo(id: $id)\n}\n\nmutation ToggleMobileTodo($id: ID!) {\n  toggleTodo(id: $id) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}":
    types.GetMobileTodosDocument,
  "query Health {\n  health\n}": types.HealthDocument,
  "query GetTodos($limit: Int, $offset: Int) {\n  todos(limit: $limit, offset: $offset) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation CreateTodo($input: CreateTodoInput!) {\n  createTodo(input: $input) {\n    id\n    title\n    description\n    completed\n  }\n}\n\nmutation UpdateTodo($id: ID!, $input: UpdateTodoInput!) {\n  updateTodo(id: $id, input: $input) {\n    id\n    title\n    description\n    completed\n  }\n}\n\nmutation DeleteTodo($id: ID!) {\n  deleteTodo(id: $id)\n}\n\nmutation ToggleTodo($id: ID!) {\n  toggleTodo(id: $id) {\n    id\n    completed\n  }\n}":
    types.GetTodosDocument
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "query MobileHealth {\n  health\n}"
): (typeof documents)["query MobileHealth {\n  health\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "query GetMobileTodos($limit: Int, $offset: Int) {\n  todos(limit: $limit, offset: $offset) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation CreateMobileTodo($input: CreateTodoInput!) {\n  createTodo(input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateMobileTodo($id: ID!, $input: UpdateTodoInput!) {\n  updateTodo(id: $id, input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteMobileTodo($id: ID!) {\n  deleteTodo(id: $id)\n}\n\nmutation ToggleMobileTodo($id: ID!) {\n  toggleTodo(id: $id) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}"
): (typeof documents)["query GetMobileTodos($limit: Int, $offset: Int) {\n  todos(limit: $limit, offset: $offset) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation CreateMobileTodo($input: CreateTodoInput!) {\n  createTodo(input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateMobileTodo($id: ID!, $input: UpdateTodoInput!) {\n  updateTodo(id: $id, input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteMobileTodo($id: ID!) {\n  deleteTodo(id: $id)\n}\n\nmutation ToggleMobileTodo($id: ID!) {\n  toggleTodo(id: $id) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "query Health {\n  health\n}"
): (typeof documents)["query Health {\n  health\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "query GetTodos($limit: Int, $offset: Int) {\n  todos(limit: $limit, offset: $offset) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation CreateTodo($input: CreateTodoInput!) {\n  createTodo(input: $input) {\n    id\n    title\n    description\n    completed\n  }\n}\n\nmutation UpdateTodo($id: ID!, $input: UpdateTodoInput!) {\n  updateTodo(id: $id, input: $input) {\n    id\n    title\n    description\n    completed\n  }\n}\n\nmutation DeleteTodo($id: ID!) {\n  deleteTodo(id: $id)\n}\n\nmutation ToggleTodo($id: ID!) {\n  toggleTodo(id: $id) {\n    id\n    completed\n  }\n}"
): (typeof documents)["query GetTodos($limit: Int, $offset: Int) {\n  todos(limit: $limit, offset: $offset) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation CreateTodo($input: CreateTodoInput!) {\n  createTodo(input: $input) {\n    id\n    title\n    description\n    completed\n  }\n}\n\nmutation UpdateTodo($id: ID!, $input: UpdateTodoInput!) {\n  updateTodo(id: $id, input: $input) {\n    id\n    title\n    description\n    completed\n  }\n}\n\nmutation DeleteTodo($id: ID!) {\n  deleteTodo(id: $id)\n}\n\nmutation ToggleTodo($id: ID!) {\n  toggleTodo(id: $id) {\n    id\n    completed\n  }\n}"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never;
