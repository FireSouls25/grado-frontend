#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(mobile)]
use tauri::mobile_entry_point;

#[cfg(mobile)]
#[mobile_entry_point]
fn main() {
    app_lib::run();
}

#[cfg(not(mobile))]
fn main() {
    app_lib::run();
}
