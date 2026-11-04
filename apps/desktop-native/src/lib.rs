//! Kaine Forge native desktop app, built with GPUI through GPUI Kit (ADR 0025).
//!
//! The binary in `main.rs` parses the launch options and calls [`start`]. The
//! window takes its colours from the generated theme assets and its strings from
//! the generated locales. Sign-in and the Todos list mount on
//! [`app::view::AppView`] in the next stage.

pub mod app;
pub mod features;

use std::sync::Arc;

use gpui_kit::component as gpui_component;
use gpui_kit::{App, AppContext, TitlebarOptions, WindowOptions};
use rust_i18n::t;

use crate::app::launch::LaunchOptions;
use crate::app::session::Session;
use crate::app::token_store::{KeyringStore, TokenStore};
use crate::app::view::AppView;
use crate::features::auth::client::AuthClient;

// The generated locales live beside the crate; CARGO_MANIFEST_DIR resolves the path.
rust_i18n::i18n!("locales", fallback = "en");

/// Runs the application until its last window closes.
pub fn start(launch: LaunchOptions) {
    gpui_kit::application()
        .with_assets(gpui_kit::assets::Assets)
        .run(move |cx| {
            gpui_kit::init(cx);
            // The kit's own component strings join this crate's translation backend.
            rust_i18n::extend!(gpui_component);
            app::i18n::init(launch.locale.as_deref());
            let opened = app::theme::init(launch.theme.as_deref(), cx)
                .and_then(|()| app::http::init(cx))
                .and_then(|()| open_main_window(cx));
            if let Err(error) = opened {
                fail(&error);
            }
        });
}

fn open_main_window(cx: &mut App) -> anyhow::Result<()> {
    let api_url = app::http::api_url();
    let store: Arc<dyn TokenStore> = Arc::new(KeyringStore::new(&api_url));
    let auth = Arc::new(AuthClient::new(cx.http_client(), api_url));
    let session = cx.new(|_| Session::new(auth, store));
    session.update(cx, Session::restore);
    let options = WindowOptions {
        titlebar: Some(TitlebarOptions {
            title: Some(t!("common.appName").to_string().into()),
            ..TitlebarOptions::default()
        }),
        ..WindowOptions::default()
    };
    gpui_kit::open_window(options, cx, |window, cx| {
        cx.new(|cx| AppView::new(session.clone(), window, cx))
    })?;
    Ok(())
}

/// The app cannot start, so the process has nothing to show.
#[expect(
    clippy::print_stderr,
    reason = "no window or logger exists yet; stderr is the only channel"
)]
pub fn fail(error: &dyn std::fmt::Display) -> ! {
    eprintln!("kaine_forge_desktop_native: {error:#}");
    std::process::exit(1)
}
