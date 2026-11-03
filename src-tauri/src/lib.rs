// Punto de entrada compartido escritorio/móvil. En móvil, el macro
// genera el arranque JNI que Android necesita en la librería.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running grado");
}
