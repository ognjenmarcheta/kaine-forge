use gpui_kit::component::ActiveTheme as _;
use gpui_kit::prelude::*;
use gpui_kit::{Context, IntoElement, Window, div};
use rust_i18n::t;

/// The root view of the main window. Features replace this placeholder.
pub struct AppView;

impl Render for AppView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme();
        div()
            .size_full()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap_2()
            .bg(theme.background)
            .text_color(theme.foreground)
            .child(div().text_xl().child(t!("common.appName").to_string()))
            .child(
                div()
                    .text_color(theme.muted_foreground)
                    .child(t!("auth.login.title").to_string()),
            )
    }
}
