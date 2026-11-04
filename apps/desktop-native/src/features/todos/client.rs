//! The Todos gateway: the GraphQL API behind a trait, so the view's tests run
//! against a fake without a server.

use std::sync::Arc;

use anyhow::{Context as _, Result, bail};
use futures::future::BoxFuture;
use gpui_kit::http_client::HttpClient;
use gpui_kit::http_client::http::Method;
use graphql_client::{GraphQLQuery, Response};
use serde::de::DeserializeOwned;

use crate::app::http::{json_request, send};
use crate::features::todos::query::{GetTodos, ToggleTodo, get_todos, toggle_todo};

/// Rows per page; the list loads more on request.
pub const PAGE_SIZE: i64 = 50;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Todo {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub completed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TodoPage {
    pub items: Vec<Todo>,
    pub has_next_page: bool,
    pub end_cursor: Option<String>,
}

pub trait TodosGateway: Send + Sync + 'static {
    fn list(&self, after: Option<String>) -> BoxFuture<'static, Result<TodoPage>>;
    fn toggle(&self, id: String) -> BoxFuture<'static, Result<Todo>>;
}

/// The API's `/graphql` endpoint with the session's bearer token.
pub struct GraphqlTodos {
    http: Arc<dyn HttpClient>,
    url: String,
    token: String,
}

impl GraphqlTodos {
    pub fn new(http: Arc<dyn HttpClient>, api_url: &str, token: String) -> Self {
        Self {
            http,
            url: format!("{api_url}/graphql"),
            token,
        }
    }

    async fn execute<Q: GraphQLQuery>(
        http: Arc<dyn HttpClient>,
        url: String,
        token: String,
        variables: Q::Variables,
    ) -> Result<Q::ResponseData>
    where
        Q::ResponseData: DeserializeOwned,
    {
        let body = serde_json::to_string(&Q::build_query(variables))?;
        let request = json_request(Method::POST, &url, Some(&token), Some(body))?;
        let response = send(&*http, request).await?;
        if !response.status.is_success() {
            bail!("GraphQL returned {}", response.status);
        }
        let parsed: Response<Q::ResponseData> =
            serde_json::from_slice(&response.body).context("GraphQL response")?;
        if let Some(error) = parsed.errors.as_ref().and_then(|errors| errors.first()) {
            bail!("{}", error.message);
        }
        parsed.data.context("GraphQL response has no data")
    }
}

impl TodosGateway for GraphqlTodos {
    fn list(&self, after: Option<String>) -> BoxFuture<'static, Result<TodoPage>> {
        let (http, url, token) = (self.http.clone(), self.url.clone(), self.token.clone());
        Box::pin(async move {
            let variables = get_todos::Variables {
                first: Some(PAGE_SIZE),
                after,
            };
            let data = Self::execute::<GetTodos>(http, url, token, variables).await?;
            Ok(TodoPage {
                items: data
                    .todos
                    .items
                    .into_iter()
                    .map(|item| Todo {
                        id: item.id,
                        title: item.title,
                        description: item.description,
                        completed: item.completed,
                    })
                    .collect(),
                has_next_page: data.todos.page_info.has_next_page,
                end_cursor: data.todos.page_info.end_cursor,
            })
        })
    }

    fn toggle(&self, id: String) -> BoxFuture<'static, Result<Todo>> {
        let (http, url, token) = (self.http.clone(), self.url.clone(), self.token.clone());
        Box::pin(async move {
            let data = Self::execute::<ToggleTodo>(http, url, token, toggle_todo::Variables { id })
                .await?;
            let todo = data.toggle_todo;
            Ok(Todo {
                id: todo.id,
                title: todo.title,
                description: todo.description,
                completed: todo.completed,
            })
        })
    }
}
