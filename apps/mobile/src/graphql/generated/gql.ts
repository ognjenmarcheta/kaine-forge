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
  "query GetMobileFile($id: ID!) {\n  file(id: $id) {\n    id\n    key\n    originalName\n    mimeType\n    sizeBytes\n    status\n    entityType\n    entityId\n    downloadUrl\n    createdAt\n    updatedAt\n  }\n}\n\nquery GetMobileFiles($filter: FilesFilterInput) {\n  files(filter: $filter) {\n    id\n    key\n    originalName\n    mimeType\n    sizeBytes\n    status\n    entityType\n    entityId\n    downloadUrl\n    createdAt\n    updatedAt\n  }\n}\n\nmutation RequestMobileUploadUrl($input: RequestUploadInput!) {\n  requestUploadUrl(input: $input) {\n    fileId\n    uploadUrl\n    key\n    expiresIn\n  }\n}\n\nmutation ConfirmMobileUpload($fileId: ID!) {\n  confirmUpload(fileId: $fileId) {\n    id\n    key\n    originalName\n    mimeType\n    sizeBytes\n    status\n    downloadUrl\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteMobileFile($fileId: ID!) {\n  deleteFile(fileId: $fileId)\n}": typeof types.GetMobileFileDocument;
  "query GetMobileTodos($limit: Int, $offset: Int) {\n  todos(limit: $limit, offset: $offset) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation CreateMobileTodo($input: CreateTodoInput!) {\n  createTodo(input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateMobileTodo($id: ID!, $input: UpdateTodoInput!) {\n  updateTodo(id: $id, input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteMobileTodo($id: ID!) {\n  deleteTodo(id: $id)\n}\n\nmutation ToggleMobileTodo($id: ID!) {\n  toggleTodo(id: $id) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nsubscription OnMobileTodoCreated {\n  todoCreated {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nsubscription OnMobileTodoUpdated {\n  todoUpdated {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nsubscription OnMobileTodoDeleted {\n  todoDeleted {\n    id\n    organizationId\n  }\n}\n\nsubscription OnMobileTodoToggled {\n  todoToggled {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}": typeof types.GetMobileTodosDocument;
};
const documents: Documents = {
  "query MobileHealth {\n  health\n}": types.MobileHealthDocument,
  "query GetMobileFile($id: ID!) {\n  file(id: $id) {\n    id\n    key\n    originalName\n    mimeType\n    sizeBytes\n    status\n    entityType\n    entityId\n    downloadUrl\n    createdAt\n    updatedAt\n  }\n}\n\nquery GetMobileFiles($filter: FilesFilterInput) {\n  files(filter: $filter) {\n    id\n    key\n    originalName\n    mimeType\n    sizeBytes\n    status\n    entityType\n    entityId\n    downloadUrl\n    createdAt\n    updatedAt\n  }\n}\n\nmutation RequestMobileUploadUrl($input: RequestUploadInput!) {\n  requestUploadUrl(input: $input) {\n    fileId\n    uploadUrl\n    key\n    expiresIn\n  }\n}\n\nmutation ConfirmMobileUpload($fileId: ID!) {\n  confirmUpload(fileId: $fileId) {\n    id\n    key\n    originalName\n    mimeType\n    sizeBytes\n    status\n    downloadUrl\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteMobileFile($fileId: ID!) {\n  deleteFile(fileId: $fileId)\n}":
    types.GetMobileFileDocument,
  "query GetMobileTodos($limit: Int, $offset: Int) {\n  todos(limit: $limit, offset: $offset) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation CreateMobileTodo($input: CreateTodoInput!) {\n  createTodo(input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateMobileTodo($id: ID!, $input: UpdateTodoInput!) {\n  updateTodo(id: $id, input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteMobileTodo($id: ID!) {\n  deleteTodo(id: $id)\n}\n\nmutation ToggleMobileTodo($id: ID!) {\n  toggleTodo(id: $id) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nsubscription OnMobileTodoCreated {\n  todoCreated {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nsubscription OnMobileTodoUpdated {\n  todoUpdated {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nsubscription OnMobileTodoDeleted {\n  todoDeleted {\n    id\n    organizationId\n  }\n}\n\nsubscription OnMobileTodoToggled {\n  todoToggled {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}":
    types.GetMobileTodosDocument
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
  source: "query GetMobileFile($id: ID!) {\n  file(id: $id) {\n    id\n    key\n    originalName\n    mimeType\n    sizeBytes\n    status\n    entityType\n    entityId\n    downloadUrl\n    createdAt\n    updatedAt\n  }\n}\n\nquery GetMobileFiles($filter: FilesFilterInput) {\n  files(filter: $filter) {\n    id\n    key\n    originalName\n    mimeType\n    sizeBytes\n    status\n    entityType\n    entityId\n    downloadUrl\n    createdAt\n    updatedAt\n  }\n}\n\nmutation RequestMobileUploadUrl($input: RequestUploadInput!) {\n  requestUploadUrl(input: $input) {\n    fileId\n    uploadUrl\n    key\n    expiresIn\n  }\n}\n\nmutation ConfirmMobileUpload($fileId: ID!) {\n  confirmUpload(fileId: $fileId) {\n    id\n    key\n    originalName\n    mimeType\n    sizeBytes\n    status\n    downloadUrl\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteMobileFile($fileId: ID!) {\n  deleteFile(fileId: $fileId)\n}"
): (typeof documents)["query GetMobileFile($id: ID!) {\n  file(id: $id) {\n    id\n    key\n    originalName\n    mimeType\n    sizeBytes\n    status\n    entityType\n    entityId\n    downloadUrl\n    createdAt\n    updatedAt\n  }\n}\n\nquery GetMobileFiles($filter: FilesFilterInput) {\n  files(filter: $filter) {\n    id\n    key\n    originalName\n    mimeType\n    sizeBytes\n    status\n    entityType\n    entityId\n    downloadUrl\n    createdAt\n    updatedAt\n  }\n}\n\nmutation RequestMobileUploadUrl($input: RequestUploadInput!) {\n  requestUploadUrl(input: $input) {\n    fileId\n    uploadUrl\n    key\n    expiresIn\n  }\n}\n\nmutation ConfirmMobileUpload($fileId: ID!) {\n  confirmUpload(fileId: $fileId) {\n    id\n    key\n    originalName\n    mimeType\n    sizeBytes\n    status\n    downloadUrl\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteMobileFile($fileId: ID!) {\n  deleteFile(fileId: $fileId)\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "query GetMobileTodos($limit: Int, $offset: Int) {\n  todos(limit: $limit, offset: $offset) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation CreateMobileTodo($input: CreateTodoInput!) {\n  createTodo(input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateMobileTodo($id: ID!, $input: UpdateTodoInput!) {\n  updateTodo(id: $id, input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteMobileTodo($id: ID!) {\n  deleteTodo(id: $id)\n}\n\nmutation ToggleMobileTodo($id: ID!) {\n  toggleTodo(id: $id) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nsubscription OnMobileTodoCreated {\n  todoCreated {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nsubscription OnMobileTodoUpdated {\n  todoUpdated {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nsubscription OnMobileTodoDeleted {\n  todoDeleted {\n    id\n    organizationId\n  }\n}\n\nsubscription OnMobileTodoToggled {\n  todoToggled {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}"
): (typeof documents)["query GetMobileTodos($limit: Int, $offset: Int) {\n  todos(limit: $limit, offset: $offset) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation CreateMobileTodo($input: CreateTodoInput!) {\n  createTodo(input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateMobileTodo($id: ID!, $input: UpdateTodoInput!) {\n  updateTodo(id: $id, input: $input) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteMobileTodo($id: ID!) {\n  deleteTodo(id: $id)\n}\n\nmutation ToggleMobileTodo($id: ID!) {\n  toggleTodo(id: $id) {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nsubscription OnMobileTodoCreated {\n  todoCreated {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nsubscription OnMobileTodoUpdated {\n  todoUpdated {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}\n\nsubscription OnMobileTodoDeleted {\n  todoDeleted {\n    id\n    organizationId\n  }\n}\n\nsubscription OnMobileTodoToggled {\n  todoToggled {\n    id\n    title\n    description\n    completed\n    createdAt\n    updatedAt\n  }\n}"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never;
