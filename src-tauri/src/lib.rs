use astro_core::chart::{Chart, compute_chart};
use astro_core::ephemeris;
use chrono::Utc;
use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    core_version: String,
}

#[tauri::command]
fn app_info(app: tauri::AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        core_version: astro_core::VERSION.to_string(),
    }
}

/// The sky at this moment, seen from the given place.
#[tauri::command]
fn sky_now(latitude: f64, longitude: f64) -> Result<Chart, String> {
    compute_chart(Utc::now(), latitude, longitude).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            let ephemeris_dir = app.path().resource_dir()?.join("ephe");
            // A failure here is reported by every calculation command, so the
            // window still opens and can show the message.
            if let Err(error) = ephemeris::init(&ephemeris_dir) {
                eprintln!("ephemeris init failed: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_info, sky_now])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
