use gpui_kit::prelude::*;
use gpui_kit::{Context, IntoElement, Window, div};

/// The root view of the main window. Features replace this placeholder.
pub struct AppView;

impl Render for AppView {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .child("Kaine Forge")
    }
}
