// Punto de entrada compartido escritorio/móvil. En móvil, Tauri lo
// invoca vía `mobile_entry_point`; en escritorio, desde main().
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running grado");
}
