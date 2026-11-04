//! The root view: the sign-in screen while signed out, the Todos list once the
//! session knows its user.

use std::sync::Arc;

use gpui_kit::component::ActiveTheme as _;
use gpui_kit::component::{TitleBar, v_flex};
use gpui_kit::prelude::*;
use gpui_kit::{AnyElement, Context, Entity, IntoElement, Subscription, Window, div};
use rust_i18n::t;

use crate::app::session::{Session, SessionState};
use crate::features::auth::view::SignInView;
use crate::features::todos::client::GraphqlTodos;
use crate::features::todos::view::TodosView;

pub struct AppView {
    session: Entity<Session>,
    sign_in: Entity<SignInView>,
    todos: Option<Entity<TodosView>>,
    _subscription: Subscription,
}

impl AppView {
    pub fn new(session: Entity<Session>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let sign_in = cx.new(|cx| SignInView::new(session.clone(), window, cx));
        let subscription = cx.subscribe(&session, |this, session, _, cx| {
            let state = session.read(cx).state().clone();
            match state {
                SessionState::SignedIn(user) if this.todos.is_none() => {
                    let signed_in = session.read(cx);
                    let token = signed_in.token().unwrap_or_default().to_owned();
                    let gateway = GraphqlTodos::new(cx.http_client(), signed_in.api_url(), token);
                    this.todos = Some(cx.new(|cx| {
                        TodosView::new(Arc::new(gateway), session.clone(), user.email, cx)
                    }));
                }
                SessionState::SignedIn(_) => {}
                _ => this.todos = None,
            }
            cx.notify();
        });
        Self {
            session,
            sign_in,
            todos: None,
            _subscription: subscription,
        }
    }
}

impl Render for AppView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let content: AnyElement = match (self.session.read(cx).state(), &self.todos) {
            (SessionState::SignedIn(_), Some(todos)) => todos.clone().into_any_element(),
            (SessionState::Restoring, _) => {
                let theme = cx.theme();
                div()
                    .id("session-restoring")
                    .size_full()
                    .flex()
                    .items_center()
                    .justify_center()
                    .bg(theme.background)
                    .text_color(theme.muted_foreground)
                    .child(t!("common.loadingSession").to_string())
                    .into_any_element()
            }
            _ => self.sign_in.clone().into_any_element(),
        };
        // The title bar moves the window and, under client decorations, carries
        // the window controls; the content takes the rest.
        v_flex()
            .size_full()
            .child(TitleBar::new().child(div().child(t!("common.appName").to_string())))
            .child(div().flex_1().min_h_0().w_full().child(content))
    }
}
