//! Kaine Forge native desktop app: the GPUI entry point (ADR 0025).
//!
//! Stage 1 opens one window. Theme tokens, translations, sign-in and the Todos
//! list mount on [`app::view::AppView`] in the next stages.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;

use gpui_kit::{App, AppContext, TitlebarOptions, WindowOptions};

fn main() {
    gpui_kit::application()
        .with_assets(gpui_kit::assets::Assets)
        .run(|cx| {
            gpui_kit::init(cx);
            if let Err(error) = open_main_window(cx) {
                fail(&error);
            }
        });
}

fn open_main_window(cx: &mut App) -> gpui_kit::Result<()> {
    let options = WindowOptions {
        titlebar: Some(TitlebarOptions {
            title: Some("Kaine Forge".into()),
            ..TitlebarOptions::default()
        }),
        ..WindowOptions::default()
    };
    gpui_kit::open_window(options, cx, |_, cx| cx.new(|_| app::view::AppView))?;
    Ok(())
}

/// The main window could not open, so the process has nothing to show.
#[expect(
    clippy::print_stderr,
    reason = "no window or logger exists yet; stderr is the only channel"
)]
fn fail(error: &dyn std::fmt::Display) -> ! {
    eprintln!("kaine_forge_desktop_native: {error:#}");
    std::process::exit(1)
}
