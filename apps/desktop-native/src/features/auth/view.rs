//! The sign-in screen: email and password against the API's bearer session.

use gpui_kit::component::ActiveTheme as _;
use gpui_kit::component::button::{Button, ButtonVariants as _};
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::v_flex;
use gpui_kit::prelude::*;
use gpui_kit::{Context, Entity, IntoElement, Role, SharedString, Subscription, Window, div, px};
use rust_i18n::t;

use crate::app::session::{Session, SessionState};
use crate::app::theme::ActiveTokens;

pub struct SignInView {
    session: Entity<Session>,
    email: Entity<InputState>,
    password: Entity<InputState>,
    validation: Option<SharedString>,
    _subscriptions: Vec<Subscription>,
}

impl SignInView {
    pub fn new(session: Entity<Session>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let email = cx.new(|cx| {
            InputState::new(window, cx).placeholder(t!("auth.form.emailPlaceholder").to_string())
        });
        let password = cx.new(|cx| {
            InputState::new(window, cx)
                .placeholder(t!("auth.form.passwordPlaceholder").to_string())
                .masked(true)
        });
        let subscriptions = vec![
            cx.subscribe(&password, |this, _, event: &InputEvent, cx| {
                if matches!(event, InputEvent::PressEnter { .. }) {
                    this.submit(cx);
                }
            }),
            cx.subscribe(&session, |_, _, _, cx| cx.notify()),
        ];
        Self {
            session,
            email,
            password,
            validation: None,
            _subscriptions: subscriptions,
        }
    }

    /// The first broken form rule after the last submit, in the active locale.
    pub fn validation(&self) -> Option<&SharedString> {
        self.validation.as_ref()
    }

    /// Validates the form, then asks the session to sign in.
    pub fn submit(&mut self, cx: &mut Context<Self>) {
        let email = self.email.read(cx).value().trim().to_owned();
        let password = self.password.read(cx).value().to_string();
        self.validation = validate(&email, &password).map(Into::into);
        cx.notify();
        if self.validation.is_some() {
            return;
        }
        self.session
            .update(cx, |session, cx| session.sign_in(email, password, cx));
    }
}

/// The first form rule the input breaks, as the web form reports it.
pub fn validate(email: &str, password: &str) -> Option<String> {
    if email.is_empty() {
        Some(t!("auth.form.error.emailRequired").into_owned())
    } else if !email.contains('@') || email.starts_with('@') || email.ends_with('@') {
        Some(t!("auth.form.error.emailInvalid").into_owned())
    } else if password.is_empty() {
        Some(t!("auth.form.error.passwordRequired").into_owned())
    } else {
        None
    }
}

impl Render for SignInView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme();
        let session = self.session.read(cx);
        let busy = *session.state() == SessionState::SigningIn;
        let message = self.validation.clone().or_else(|| session.error().cloned());
        let rail = ActiveTokens::global(cx).theme().layout("rail");

        div()
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .bg(theme.background)
            .text_color(theme.foreground)
            .child(
                v_flex()
                    .id("sign-in")
                    .w_full()
                    .max_w(px(rail))
                    .gap_4()
                    .p_6()
                    .child(
                        div()
                            .id("sign-in-title")
                            .role(Role::Heading)
                            .aria_label(t!("auth.login.title").to_string())
                            .text_xl()
                            .child(t!("auth.login.title").to_string()),
                    )
                    .child(
                        div()
                            .text_color(theme.muted_foreground)
                            .child(t!("auth.login.subtitle").to_string()),
                    )
                    .child(Input::new(&self.email).id("email"))
                    .child(Input::new(&self.password).id("password"))
                    .children(message.map(|message| {
                        div()
                            .id("sign-in-error")
                            .role(Role::Alert)
                            .aria_label(message.clone())
                            .text_color(theme.danger)
                            .child(message)
                    }))
                    .child(
                        Button::new("submit")
                            .primary()
                            .label(t!("auth.login.title").to_string())
                            .loading(busy)
                            .on_click(cx.listener(|this, _, _, cx| this.submit(cx))),
                    ),
            )
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use gpui_kit::http_client::{FakeHttpClient, HttpClient};
    use gpui_kit::test::TestWindowExt as _;
    use gpui_kit::{AppContext as _, Entity, TestAppContext};
    use rust_i18n::t;

    use super::{SignInView, validate};
    use crate::app::session::Session;
    use crate::app::token_store::MemoryStore;
    use crate::features::auth::client::AuthClient;

    fn session(cx: &mut TestAppContext) -> Entity<Session> {
        let http: Arc<dyn HttpClient> = FakeHttpClient::with_404_response();
        let auth = Arc::new(AuthClient::new(http, "http://api.test".into()));
        cx.new(|_| Session::new(auth, Arc::new(MemoryStore::default())))
    }

    #[test]
    fn validates_in_the_order_the_web_form_does() {
        assert_eq!(
            validate("", ""),
            Some(t!("auth.form.error.emailRequired").into_owned())
        );
        assert_eq!(
            validate("nope", "x"),
            Some(t!("auth.form.error.emailInvalid").into_owned())
        );
        assert_eq!(
            validate("a@b.test", ""),
            Some(t!("auth.form.error.passwordRequired").into_owned())
        );
        assert_eq!(validate("a@b.test", "secret"), None);
    }

    #[gpui_kit::test]
    fn an_empty_submit_shows_the_first_broken_rule_and_does_not_sign_in(cx: &mut TestAppContext) {
        cx.update(|cx| {
            gpui_kit::init(cx);
            crate::app::theme::init(None, cx).unwrap();
        });
        let session = session(cx);
        let (view, visual) =
            cx.add_window_view(|window, cx| SignInView::new(session.clone(), window, cx));
        visual.update(|window, cx| {
            window.render_frame(cx);
            window.click("submit", cx);
        });
        let shown = view.read_with(visual, |view, _| view.validation().cloned());
        assert_eq!(
            shown.as_deref(),
            Some(&*t!("auth.form.error.emailRequired"))
        );
        let state = session.read_with(visual, |session, _| session.state().clone());
        assert_eq!(state, crate::app::session::SessionState::Restoring);
    }
}
