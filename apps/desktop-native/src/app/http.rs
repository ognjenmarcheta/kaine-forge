//! The HTTP client every request goes through, and the API origin it targets.
//! Requests run on GPUI's executor through [`gpui_kit::http_client::HttpClient`],
//! so tests swap in the fake client without touching the features.

use std::sync::Arc;

use anyhow::{Context as _, Result};
use gpui_kit::App;
use gpui_kit::http_client::http::{HeaderMap, Method};
use gpui_kit::http_client::{AsyncBody, HttpClient, Request, StatusCode};

/// The environment variable that names the API origin.
pub const API_URL_ENV: &str = "DESKTOP_NATIVE_API_URL";
/// The local API (`API_PORT` in `.env.example`).
pub const DEFAULT_API_URL: &str = "http://localhost:4000";

/// The API origin without a trailing slash: the environment, else the local API.
pub fn api_url() -> String {
    api_url_from(std::env::var(API_URL_ENV).ok().as_deref())
}

pub fn api_url_from(configured: Option<&str>) -> String {
    configured
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_API_URL)
        .trim_end_matches('/')
        .to_owned()
}

/// Installs the real HTTP client on the app.
pub fn init(cx: &mut App) -> Result<()> {
    let user_agent = format!("{}/{}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"));
    let client =
        reqwest_client::ReqwestClient::user_agent(&user_agent).context("HTTP client start-up")?;
    cx.set_http_client(Arc::new(client));
    Ok(())
}

/// A finished response with its body read.
pub struct JsonResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

impl JsonResponse {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name).and_then(|value| value.to_str().ok())
    }
}

/// A JSON request with the bearer token the API's `bearer` plugin reads.
pub fn json_request(
    method: Method,
    url: &str,
    token: Option<&str>,
    body: Option<String>,
) -> Result<Request<AsyncBody>> {
    let mut builder = Request::builder()
        .method(method)
        .uri(url)
        .header("content-type", "application/json")
        .header("accept", "application/json");
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    Ok(builder.body(body.map_or_else(AsyncBody::empty, AsyncBody::from))?)
}

/// Sends a request and reads the whole body.
pub async fn send(http: &dyn HttpClient, request: Request<AsyncBody>) -> Result<JsonResponse> {
    let mut response = http.send(request).await?;
    let mut body = Vec::new();
    futures::AsyncReadExt::read_to_end(response.body_mut(), &mut body).await?;
    Ok(JsonResponse {
        status: response.status(),
        headers: response.headers().clone(),
        body,
    })
}

#[cfg(test)]
mod tests {
    use super::api_url_from;

    #[test]
    fn falls_back_to_the_local_api_and_trims_the_origin() {
        assert_eq!(api_url_from(None), "http://localhost:4000");
        assert_eq!(api_url_from(Some("  ")), "http://localhost:4000");
        assert_eq!(
            api_url_from(Some("https://api.example.test/")),
            "https://api.example.test"
        );
    }
}
