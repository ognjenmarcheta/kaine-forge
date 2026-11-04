#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use kaine_forge_desktop_native::app::launch::LaunchOptions;

fn main() {
    match LaunchOptions::from_args(std::env::args().skip(1)) {
        Ok(launch) => kaine_forge_desktop_native::start(launch),
        Err(error) => kaine_forge_desktop_native::fail(&error),
    }
}
