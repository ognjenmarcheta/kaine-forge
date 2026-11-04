//! The better-auth endpoints the app calls, with the bearer protocol the mobile
//! app uses: the token arrives in the `set-auth-token` response header and is
//! replayed as `Authorization: Bearer` (`packages/auth/src/auth.transport.ts`).

use std::fmt;
use std::sync::Arc;

use anyhow::Result;
use gpui_kit::http_client::HttpClient;
use gpui_kit::http_client::http::Method;
use serde::Deserialize;

use crate::app::http::{JsonResponse, json_request, send};

/// The header better-auth's bearer plugin sets when a request created or refreshed a session.
pub const SESSION_TOKEN_HEADER: &str = "set-auth-token";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: String,
}

#[derive(Debug)]
pub struct SignedIn {
    pub token: String,
    pub user: User,
}

#[derive(Debug)]
pub enum AuthError {
    /// The API refused the credentials; `code` is better-auth's machine-readable code.
    Rejected {
        code: String,
    },
    Transport(anyhow::Error),
}

impl fmt::Display for AuthError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AuthError::Rejected { code } => write!(f, "sign-in rejected: {code}"),
            AuthError::Transport(error) => write!(f, "sign-in failed: {error:#}"),
        }
    }
}

impl From<anyhow::Error> for AuthError {
    fn from(error: anyhow::Error) -> Self {
        AuthError::Transport(error)
    }
}

pub struct AuthClient {
    http: Arc<dyn HttpClient>,
    api_url: String,
}

#[derive(Deserialize)]
struct UserBody {
    id: String,
    email: String,
    #[serde(default)]
    name: String,
}

impl From<UserBody> for User {
    fn from(body: UserBody) -> Self {
        User {
            id: body.id,
            email: body.email,
            name: body.name,
        }
    }
}

#[derive(Deserialize)]
struct SignInBody {
    token: Option<String>,
    user: UserBody,
}

#[derive(Deserialize)]
struct SessionBody {
    user: UserBody,
}

#[derive(Deserialize, Default)]
struct ErrorBody {
    code: Option<String>,
}

impl AuthClient {
    pub fn new(http: Arc<dyn HttpClient>, api_url: String) -> Self {
        Self { http, api_url }
    }

    pub fn api_url(&self) -> &str {
        &self.api_url
    }

    fn url(&self, path: &str) -> String {
        format!("{}/api/auth/{path}", self.api_url)
    }

    pub async fn sign_in(&self, email: &str, password: &str) -> Result<SignedIn, AuthError> {
        let body = serde_json::json!({ "email": email, "password": password }).to_string();
        let request = json_request(Method::POST, &self.url("sign-in/email"), None, Some(body))?;
        let response = send(&*self.http, request).await?;
        if !response.status.is_success() {
            let error: ErrorBody = serde_json::from_slice(&response.body).unwrap_or_default();
            return Err(AuthError::Rejected {
                code: error
                    .code
                    .unwrap_or_else(|| format!("HTTP_{}", response.status.as_u16())),
            });
        }
        let header_token = response.header(SESSION_TOKEN_HEADER).map(str::to_owned);
        let signed_in: SignInBody = serde_json::from_slice(&response.body)
            .map_err(|error| anyhow::anyhow!("sign-in response: {error}"))?;
        let token = header_token
            .or(signed_in.token)
            .ok_or_else(|| anyhow::anyhow!("sign-in response carries no session token"))?;
        Ok(SignedIn {
            token,
            user: signed_in.user.into(),
        })
    }

    /// The user the token belongs to, or `None` when the API no longer knows it.
    pub async fn session(&self, token: &str) -> Result<Option<User>> {
        let request = json_request(Method::GET, &self.url("get-session"), Some(token), None)?;
        let response = send(&*self.http, request).await?;
        Ok(parse_session(&response))
    }

    pub async fn sign_out(&self, token: &str) -> Result<()> {
        let request = json_request(
            Method::POST,
            &self.url("sign-out"),
            Some(token),
            Some("{}".into()),
        )?;
        let response = send(&*self.http, request).await?;
        anyhow::ensure!(
            response.status.is_success(),
            "sign-out returned {}",
            response.status
        );
        Ok(())
    }
}

fn parse_session(response: &JsonResponse) -> Option<User> {
    if !response.status.is_success() {
        return None;
    }
    serde_json::from_slice::<Option<SessionBody>>(&response.body)
        .ok()
        .flatten()
        .map(|body| body.user.into())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use futures::executor::block_on;
    use gpui_kit::http_client::http::Response;
    use gpui_kit::http_client::{AsyncBody, FakeHttpClient, HttpClient, Request};
    use rust_i18n::t;

    use super::{AuthClient, AuthError};

    type Seen = Arc<Mutex<Vec<(String, String, Option<String>)>>>;

    /// A client whose server records every request (uri, body, authorization) and replies.
    fn client(
        status: u16,
        headers: &'static [(&'static str, &'static str)],
        body: &'static str,
    ) -> (AuthClient, Seen) {
        let seen: Seen = Arc::default();
        let recorder = seen.clone();
        let http: Arc<dyn HttpClient> =
            FakeHttpClient::create(move |request: Request<AsyncBody>| {
                let recorder = recorder.clone();
                async move {
                    let authorization = request
                        .headers()
                        .get("authorization")
                        .and_then(|value| value.to_str().ok())
                        .map(str::to_owned);
                    let uri = request.uri().to_string();
                    let mut bytes = Vec::new();
                    futures::AsyncReadExt::read_to_end(&mut request.into_body(), &mut bytes)
                        .await?;
                    recorder
                        .lock()
                        .unwrap()
                        .push((uri, String::from_utf8(bytes)?, authorization));
                    let mut response = Response::builder().status(status);
                    for (name, value) in headers {
                        response = response.header(*name, *value);
                    }
                    Ok(response.body(AsyncBody::from(body))?)
                }
            });
        (AuthClient::new(http, "http://api.test".into()), seen)
    }

    #[test]
    fn sign_in_posts_the_credentials_and_takes_the_token_from_the_header() {
        let (client, seen) = client(
            200,
            &[("set-auth-token", "session-token")],
            r#"{"user":{"id":"u1","email":"a@b.test","name":"Ada"}}"#,
        );
        let signed_in = block_on(client.sign_in("a@b.test", "secret")).unwrap();
        assert_eq!(signed_in.token, "session-token");
        assert_eq!(signed_in.user.email, "a@b.test");
        let requests = seen.lock().unwrap();
        let (uri, body, authorization) = &requests[0];
        assert_eq!(uri, "http://api.test/api/auth/sign-in/email");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(body).unwrap(),
            serde_json::json!({ "email": "a@b.test", "password": "secret" })
        );
        assert_eq!(authorization.as_deref(), None);
    }

    #[test]
    fn a_refused_sign_in_carries_the_code_and_maps_it_to_the_web_message() {
        let (client, _) = client(
            401,
            &[],
            r#"{"code":"INVALID_EMAIL_OR_PASSWORD","message":"no"}"#,
        );
        let error = block_on(client.sign_in("a@b.test", "wrong")).unwrap_err();
        assert!(
            matches!(&error, AuthError::Rejected { code } if code == "INVALID_EMAIL_OR_PASSWORD")
        );
        assert_eq!(error.message(), t!("auth.error.invalidCredentials"));
    }

    #[test]
    fn session_replays_the_bearer_token_and_reads_null_as_signed_out() {
        let (client, seen) = client(200, &[], "null");
        assert_eq!(block_on(client.session("session-token")).unwrap(), None);
        let requests = seen.lock().unwrap();
        assert_eq!(requests[0].0, "http://api.test/api/auth/get-session");
        assert_eq!(requests[0].2.as_deref(), Some("Bearer session-token"));
    }

    #[test]
    fn session_returns_the_user_the_api_names() {
        let (client, _) = client(
            200,
            &[],
            r#"{"session":{"id":"s"},"user":{"id":"u1","email":"a@b.test"}}"#,
        );
        let user = block_on(client.session("session-token")).unwrap().unwrap();
        assert_eq!(user.id, "u1");
        assert_eq!(user.name, "");
    }
}
