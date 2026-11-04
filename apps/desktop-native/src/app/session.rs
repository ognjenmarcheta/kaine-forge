//! The signed-in state of the app: restores the stored bearer token at launch,
//! signs in and out through the API, and keeps the token in the OS store.

use std::sync::Arc;

use gpui_kit::{Context, EventEmitter, SharedString, Task};
use rust_i18n::t;

use crate::app::token_store::TokenStore;
use crate::features::auth::client::{AuthClient, AuthError, User};

/// Fires after every state change.
pub struct SessionChanged;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionState {
    /// The stored token is being checked against the API.
    Restoring,
    SignedOut,
    SigningIn,
    SignedIn(User),
}

pub struct Session {
    auth: Arc<AuthClient>,
    store: Arc<dyn TokenStore>,
    token: Option<String>,
    persisted: bool,
    state: SessionState,
    error: Option<SharedString>,
    task: Option<Task<()>>,
}

impl EventEmitter<SessionChanged> for Session {}

impl Session {
    pub fn new(auth: Arc<AuthClient>, store: Arc<dyn TokenStore>) -> Self {
        Self {
            auth,
            store,
            token: None,
            persisted: false,
            state: SessionState::Restoring,
            error: None,
            task: None,
        }
    }

    pub fn state(&self) -> &SessionState {
        &self.state
    }

    /// The message of the last failed sign-in, in the active locale.
    pub fn error(&self) -> Option<&SharedString> {
        self.error.as_ref()
    }

    pub fn token(&self) -> Option<&str> {
        self.token.as_deref()
    }

    pub fn api_url(&self) -> &str {
        self.auth.api_url()
    }

    /// True when the token could not be written to the OS store, so the
    /// session ends with the process.
    pub fn is_session_only(&self) -> bool {
        self.token.is_some() && !self.persisted
    }

    /// Reads the stored token and asks the API whose it is.
    pub fn restore(&mut self, cx: &mut Context<Self>) {
        let (auth, store) = (self.auth.clone(), self.store.clone());
        self.task = Some(cx.spawn(async move |this, cx| {
            let stored = cx
                .background_executor()
                .spawn(async move { store.get() })
                .await;
            let outcome = match stored {
                Ok(Some(token)) => match auth.session(&token).await {
                    Ok(Some(user)) => Some((token, user)),
                    Ok(None) | Err(_) => None,
                },
                Ok(None) | Err(_) => None,
            };
            this.update(cx, |session, cx| {
                match outcome {
                    Some((token, user)) => {
                        session.token = Some(token);
                        session.persisted = true;
                        session.state = SessionState::SignedIn(user);
                    }
                    None => session.state = SessionState::SignedOut,
                }
                Self::changed(cx);
            })
            .ok();
        }));
    }

    pub fn sign_in(&mut self, email: String, password: String, cx: &mut Context<Self>) {
        if self.state == SessionState::SigningIn {
            return;
        }
        self.state = SessionState::SigningIn;
        self.error = None;
        Self::changed(cx);
        let (auth, store) = (self.auth.clone(), self.store.clone());
        self.task = Some(cx.spawn(async move |this, cx| {
            let result = auth.sign_in(&email, &password).await;
            let persisted = match &result {
                Ok(signed_in) => {
                    let token = signed_in.token.clone();
                    cx.background_executor()
                        .spawn(async move { store.set(&token) })
                        .await
                        .is_ok()
                }
                Err(_) => false,
            };
            this.update(cx, |session, cx| {
                match result {
                    Ok(signed_in) => {
                        session.token = Some(signed_in.token);
                        session.persisted = persisted;
                        session.state = SessionState::SignedIn(signed_in.user);
                    }
                    Err(error) => {
                        session.error = Some(error.message().into());
                        session.state = SessionState::SignedOut;
                    }
                }
                Self::changed(cx);
            })
            .ok();
        }));
    }

    pub fn sign_out(&mut self, cx: &mut Context<Self>) {
        let token = self.token.take();
        self.persisted = false;
        self.state = SessionState::SignedOut;
        self.error = None;
        Self::changed(cx);
        let (auth, store) = (self.auth.clone(), self.store.clone());
        self.task = Some(cx.spawn(async move |_this, cx| {
            if let Some(token) = token {
                // The server revokes the session; a failure leaves a token the store no longer holds.
                auth.sign_out(&token).await.ok();
            }
            cx.background_executor()
                .spawn(async move { store.clear() })
                .await
                .ok();
        }));
    }

    fn changed(cx: &mut Context<Self>) {
        cx.emit(SessionChanged);
        cx.notify();
    }
}

impl AuthError {
    /// The message to show, from the translation keys the web app uses for the same codes.
    pub fn message(&self) -> String {
        match self {
            AuthError::Rejected { code } => match code.as_str() {
                "INVALID_EMAIL_OR_PASSWORD" => t!("auth.error.invalidCredentials").into_owned(),
                "ACCOUNT_TEMPORARILY_LOCKED" => t!("auth.error.accountLocked").into_owned(),
                "TOO_MANY_ATTEMPTS" | "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE" => {
                    t!("auth.error.tooManyAttempts").into_owned()
                }
                "PASSWORD_COMPROMISED" => t!("auth.error.passwordCompromised").into_owned(),
                _ => t!("error.generic").into_owned(),
            },
            AuthError::Transport(_) => t!("error.generic").into_owned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use gpui_kit::http_client::http::Response;
    use gpui_kit::http_client::{AsyncBody, FakeHttpClient, HttpClient};
    use gpui_kit::{AppContext as _, TestAppContext};

    use super::{Session, SessionState};
    use crate::app::token_store::{MemoryStore, TokenStore};
    use crate::features::auth::client::{AuthClient, User};

    fn auth(body: &'static str) -> Arc<AuthClient> {
        let http: Arc<dyn HttpClient> = FakeHttpClient::create(move |_| async move {
            Ok(Response::builder()
                .status(200)
                .body(AsyncBody::from(body))?)
        });
        Arc::new(AuthClient::new(http, "http://api.test".into()))
    }

    #[gpui_kit::test]
    fn restore_signs_in_with_the_stored_token_the_api_still_knows(cx: &mut TestAppContext) {
        let store = Arc::new(MemoryStore::default());
        store.set("stored-token").unwrap();
        let session = cx.new(|_| {
            Session::new(
                auth(r#"{"user":{"id":"u1","email":"a@b.test","name":"Ada"}}"#),
                store,
            )
        });
        session.update(cx, Session::restore);
        cx.run_until_parked();
        session.read_with(cx, |session, _| {
            assert_eq!(
                *session.state(),
                SessionState::SignedIn(User {
                    id: "u1".into(),
                    email: "a@b.test".into(),
                    name: "Ada".into()
                })
            );
            assert_eq!(session.token(), Some("stored-token"));
            assert!(!session.is_session_only());
        });
    }

    #[gpui_kit::test]
    fn restore_signs_out_and_forgets_a_token_the_api_rejects(cx: &mut TestAppContext) {
        let store = Arc::new(MemoryStore::default());
        store.set("stale-token").unwrap();
        let session = cx.new(|_| Session::new(auth("null"), store.clone()));
        session.update(cx, Session::restore);
        cx.run_until_parked();
        session.read_with(cx, |session, _| {
            assert_eq!(*session.state(), SessionState::SignedOut);
            assert_eq!(session.token(), None);
        });
    }
}
