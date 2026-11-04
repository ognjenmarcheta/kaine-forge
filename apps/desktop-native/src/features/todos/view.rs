//! The Todos list of the active Organization: load, toggle, load more.

use std::sync::Arc;

use gpui_kit::component::ActiveTheme as _;
use gpui_kit::component::button::{Button, ButtonVariants as _};
use gpui_kit::component::checkbox::Checkbox;
use gpui_kit::component::{h_flex, v_flex};
use gpui_kit::prelude::*;
use gpui_kit::{Context, Entity, IntoElement, Role, SharedString, Task, Window, div};
use rust_i18n::t;

use crate::app::session::Session;
use crate::features::todos::client::{Todo, TodoPage, TodosGateway};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ListState {
    Loading,
    Failed,
    Ready {
        todos: Vec<Todo>,
        has_next_page: bool,
        end_cursor: Option<String>,
        loading_more: bool,
    },
}

pub struct TodosView {
    gateway: Arc<dyn TodosGateway>,
    session: Entity<Session>,
    user_email: SharedString,
    state: ListState,
    task: Option<Task<()>>,
}

impl TodosView {
    pub fn new(
        gateway: Arc<dyn TodosGateway>,
        session: Entity<Session>,
        user_email: impl Into<SharedString>,
        cx: &mut Context<Self>,
    ) -> Self {
        let mut view = Self {
            gateway,
            session,
            user_email: user_email.into(),
            state: ListState::Loading,
            task: None,
        };
        view.load(None, cx);
        view
    }

    pub fn state(&self) -> &ListState {
        &self.state
    }

    /// Loads the first page, or the page after `after` onto the current list.
    pub fn load(&mut self, after: Option<String>, cx: &mut Context<Self>) {
        match &mut self.state {
            ListState::Ready { loading_more, .. } if after.is_some() => *loading_more = true,
            state => *state = ListState::Loading,
        }
        cx.notify();
        let request = self.gateway.list(after.clone());
        self.task = Some(cx.spawn(async move |this, cx| {
            let result = request.await;
            this.update(cx, |view, cx| {
                view.state = match (result, &view.state, after) {
                    (Ok(page), ListState::Ready { todos, .. }, Some(_)) => {
                        ready(todos.clone(), page)
                    }
                    (Ok(page), _, _) => ready(Vec::new(), page),
                    (
                        Err(_),
                        ListState::Ready {
                            todos,
                            has_next_page,
                            end_cursor,
                            ..
                        },
                        Some(_),
                    ) => ListState::Ready {
                        todos: todos.clone(),
                        has_next_page: *has_next_page,
                        end_cursor: end_cursor.clone(),
                        loading_more: false,
                    },
                    (Err(_), _, _) => ListState::Failed,
                };
                cx.notify();
            })
            .ok();
        }));
    }

    pub fn toggle(&mut self, id: String, cx: &mut Context<Self>) {
        let request = self.gateway.toggle(id);
        self.task = Some(cx.spawn(async move |this, cx| {
            if let Ok(updated) = request.await {
                this.update(cx, |view, cx| {
                    if let ListState::Ready { todos, .. } = &mut view.state
                        && let Some(todo) = todos.iter_mut().find(|todo| todo.id == updated.id)
                    {
                        *todo = updated;
                    }
                    cx.notify();
                })
                .ok();
            }
        }));
    }
}

/// The list after a page arrived: the rows so far, then the page's rows.
fn ready(mut todos: Vec<Todo>, page: TodoPage) -> ListState {
    todos.extend(page.items);
    ListState::Ready {
        todos,
        has_next_page: page.has_next_page,
        end_cursor: page.end_cursor,
        loading_more: false,
    }
}

impl Render for TodosView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme();
        let session_only = self.session.read(cx).is_session_only();
        let header = h_flex()
            .id("todos-header")
            .w_full()
            .items_center()
            .gap_3()
            .child(
                div()
                    .id("todos-title")
                    .role(Role::Heading)
                    .aria_label(t!("todos.title").to_string())
                    .text_xl()
                    .flex_1()
                    .child(t!("todos.title").to_string()),
            )
            .child(
                div()
                    .text_color(theme.muted_foreground)
                    .child(self.user_email.clone()),
            )
            .child(
                Button::new("sign-out")
                    .ghost()
                    .label(t!("auth.logout").to_string())
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.session.update(cx, Session::sign_out);
                    })),
            );
        let body = match &self.state {
            ListState::Loading => div()
                .id("todos-loading")
                .text_color(theme.muted_foreground)
                .child(t!("todos.loading").to_string())
                .into_any_element(),
            ListState::Failed => v_flex()
                .id("todos-error")
                .gap_2()
                .child(
                    div()
                        .id("todos-error-text")
                        .role(Role::Alert)
                        .aria_label(t!("todos.loadFailed").to_string())
                        .text_color(theme.danger)
                        .child(t!("todos.loadFailed").to_string()),
                )
                .child(
                    Button::new("retry")
                        .label(t!("common.retry").to_string())
                        .on_click(cx.listener(|this, _, _, cx| this.load(None, cx))),
                )
                .into_any_element(),
            ListState::Ready { todos, .. } if todos.is_empty() => div()
                .id("todos-empty")
                .text_color(theme.muted_foreground)
                .child(t!("todos.empty").to_string())
                .into_any_element(),
            ListState::Ready {
                todos,
                has_next_page,
                end_cursor,
                loading_more,
            } => {
                let next = end_cursor.clone();
                v_flex()
                    .id("todos-list")
                    .flex_1()
                    .gap_2()
                    .overflow_y_scroll()
                    .children(todos.iter().map(|todo| {
                        let id = todo.id.clone();
                        Checkbox::new(SharedString::from(format!("todo-{}", todo.id)))
                            .checked(todo.completed)
                            .label(todo.title.clone())
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.toggle(id.clone(), cx);
                            }))
                    }))
                    .children(has_next_page.then(|| {
                        Button::new("load-more")
                            .label(t!("todos.loadMore").to_string())
                            .loading(*loading_more)
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.load(next.clone(), cx);
                            }))
                    }))
                    .into_any_element()
            }
        };

        v_flex()
            .size_full()
            .gap_4()
            .p_6()
            .bg(theme.background)
            .text_color(theme.foreground)
            .child(header)
            .children(session_only.then(|| {
                div()
                    .id("session-notice")
                    .role(Role::Alert)
                    .aria_label(t!("auth.session.notSaved").to_string())
                    .text_color(theme.muted_foreground)
                    .child(t!("auth.session.notSaved").to_string())
            }))
            .child(body)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use futures::future::BoxFuture;
    use gpui_kit::http_client::{FakeHttpClient, HttpClient};
    use gpui_kit::test::TestWindowExt as _;
    use gpui_kit::{AppContext as _, Entity, TestAppContext};

    use super::{ListState, TodosView};
    use crate::app::session::Session;
    use crate::app::token_store::MemoryStore;
    use crate::features::auth::client::AuthClient;
    use crate::features::todos::client::{Todo, TodoPage, TodosGateway};

    /// A gateway with fixed rows that records the ids it was asked to toggle.
    struct FakeTodos {
        page: TodoPage,
        toggled: Mutex<Vec<String>>,
    }

    impl TodosGateway for FakeTodos {
        fn list(&self, _after: Option<String>) -> BoxFuture<'static, anyhow::Result<TodoPage>> {
            let page = self.page.clone();
            Box::pin(async move { Ok(page) })
        }

        fn toggle(&self, id: String) -> BoxFuture<'static, anyhow::Result<Todo>> {
            self.toggled.lock().unwrap().push(id.clone());
            let mut todo = self
                .page
                .items
                .iter()
                .find(|todo| todo.id == id)
                .cloned()
                .unwrap();
            todo.completed = !todo.completed;
            Box::pin(async move { Ok(todo) })
        }
    }

    fn todo(id: &str, title: &str, completed: bool) -> Todo {
        Todo {
            id: id.into(),
            title: title.into(),
            description: None,
            completed,
        }
    }

    fn session(cx: &mut TestAppContext) -> Entity<Session> {
        let http: Arc<dyn HttpClient> = FakeHttpClient::with_404_response();
        let auth = Arc::new(AuthClient::new(http, "http://api.test".into()));
        cx.new(|_| Session::new(auth, Arc::new(MemoryStore::default())))
    }

    #[gpui_kit::test]
    fn lists_the_page_and_toggles_a_row_through_the_gateway(cx: &mut TestAppContext) {
        cx.update(|cx| {
            gpui_kit::init(cx);
            crate::app::theme::init(None, cx).unwrap();
        });
        let gateway = Arc::new(FakeTodos {
            page: TodoPage {
                items: vec![
                    todo("t1", "Write the plan", false),
                    todo("t2", "Ship it", true),
                ],
                has_next_page: false,
                end_cursor: None,
            },
            toggled: Mutex::default(),
        });
        let session = session(cx);
        let (view, visual) = cx.add_window_view({
            let gateway = gateway.clone();
            move |_, cx| TodosView::new(gateway, session, "a@b.test", cx)
        });
        visual.run_until_parked();
        let titles: Vec<String> = view.read_with(visual, |view, _| match view.state() {
            ListState::Ready { todos, .. } => todos.iter().map(|todo| todo.title.clone()).collect(),
            other => panic!("expected the page, got {other:?}"),
        });
        assert_eq!(
            titles,
            vec!["Write the plan".to_owned(), "Ship it".to_owned()]
        );

        visual.update(|window, cx| {
            window.render_frame(cx);
            window.click("todo-t1", cx);
        });
        visual.run_until_parked();
        assert_eq!(*gateway.toggled.lock().unwrap(), vec!["t1".to_owned()]);
        let completed = view.read_with(visual, |view, _| match view.state() {
            ListState::Ready { todos, .. } => todos[0].completed,
            other => panic!("expected the page, got {other:?}"),
        });
        assert!(completed);
    }
}
