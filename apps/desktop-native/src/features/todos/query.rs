//! Typed operations compiled from `todos.graphql` against the API schema.
//! Run `pnpm generate` before `cargo build` when the schema changes.

use graphql_client::GraphQLQuery;

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "../api/schema.graphql",
    query_path = "src/features/todos/todos.graphql",
    response_derives = "Debug, Clone, PartialEq, Eq"
)]
pub struct GetTodos;

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "../api/schema.graphql",
    query_path = "src/features/todos/todos.graphql",
    response_derives = "Debug, Clone, PartialEq, Eq"
)]
pub struct ToggleTodo;
