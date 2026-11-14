mod db;

use std::sync::Mutex;

use astro_core::aspects::{Aspect, Orbs, find_aspects};
use astro_core::chart::{Chart, Sect, compute_chart};
use astro_core::ephemeris;
use astro_core::lots::{LotReport, lot_report};
use astro_core::places::{Place, PlaceIndex};
use astro_core::time::{ResolvedTime, ZoneChoice, resolve};
use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

use db::{ChartRecord, Folder};

struct Database(Mutex<Connection>);

impl Database {
    fn with<T>(
        &self,
        action: impl FnOnce(&Connection) -> rusqlite::Result<T>,
    ) -> Result<T, String> {
        let connection = self.0.lock().unwrap_or_else(|e| e.into_inner());
        action(&connection).map_err(|e| e.to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    core_version: String,
}

/// Birth data as entered in the form.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BirthInput {
    /// `YYYY-MM-DD`.
    date: String,
    /// `HH:MM`, or `None` when unknown.
    time: Option<String>,
    latitude: f64,
    longitude: f64,
    zone: Option<String>,
    /// Manual UTC offset in seconds; overrides `zone` when set.
    offset_seconds: Option<i32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ComputedChart {
    chart: Chart,
    /// Every aspect within orb, including those to the Ascendant and
    /// Midheaven; the interface filters by what the user has switched on.
    aspects: Vec<Aspect>,
    /// How the local birth time was turned into UTC; absent for "now".
    time: Option<ResolvedTime>,
    /// The seven Hermetic lots; natal charts only, so absent for "now".
    lots: Option<LotReport>,
}

/// How the lots of a chart are to be calculated.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LotOptions {
    /// Manual day/night sect; `None` uses the sect derived from the Sun.
    sect_override: Option<Sect>,
    /// Maximum orb of lot aspects, in degrees.
    orb: f64,
    /// A lot aspect is marked exact when its orb is below this, in degrees.
    exact_orb: f64,
}

fn resolve_input(birth: &BirthInput) -> Result<ResolvedTime, String> {
    let date = NaiveDate::parse_from_str(&birth.date, "%Y-%m-%d")
        .map_err(|_| format!("ugyldig dato: {}", birth.date))?;
    let time = match birth.time.as_deref() {
        None | Some("") => None,
        Some(text) => Some(
            NaiveTime::parse_from_str(text, "%H:%M")
                .map_err(|_| format!("ugyldigt klokkeslæt: {text}"))?,
        ),
    };
    let zone = match (birth.offset_seconds, &birth.zone) {
        (Some(seconds), _) => ZoneChoice::FixedOffset(seconds),
        (None, Some(name)) => ZoneChoice::Named(name.clone()),
        (None, None) => return Err("tidszone mangler".to_string()),
    };
    resolve(date, time, &zone).map_err(|e| e.to_string())
}

fn compute(
    utc: DateTime<Utc>,
    latitude: f64,
    longitude: f64,
    orbs: &Orbs,
    time: Option<ResolvedTime>,
    lots: Option<&LotOptions>,
) -> Result<ComputedChart, String> {
    if !(-90.0..=90.0).contains(&latitude) || !(-180.0..=180.0).contains(&longitude) {
        return Err("ugyldige koordinater".to_string());
    }
    let chart = compute_chart(utc, latitude, longitude).map_err(|e| e.to_string())?;
    let aspects = find_aspects(&chart.aspect_points(), orbs);
    let lots = match lots {
        Some(options) => {
            let valid = |value: f64| value.is_finite() && value >= 0.0;
            if !valid(options.orb) || !valid(options.exact_orb) {
                return Err("ugyldig orb for lots".to_string());
            }
            Some(lot_report(&chart, options.sect_override, options.orb, options.exact_orb))
        }
        None => None,
    };
    Ok(ComputedChart {
        chart,
        aspects,
        time,
        lots,
    })
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
fn sky_now(latitude: f64, longitude: f64, orbs: Orbs) -> Result<ComputedChart, String> {
    compute(Utc::now(), latitude, longitude, &orbs, None, None)
}

/// How a local birth time maps to UTC, so the form can show the offset.
#[tauri::command]
fn birth_resolve(birth: BirthInput) -> Result<ResolvedTime, String> {
    resolve_input(&birth)
}

#[tauri::command]
fn chart_compute(birth: BirthInput, orbs: Orbs, lots: LotOptions) -> Result<ComputedChart, String> {
    let time = resolve_input(&birth)?;
    compute(time.utc, birth.latitude, birth.longitude, &orbs, Some(time), Some(&lots))
}

#[tauri::command]
fn places_search(places: State<'_, Option<PlaceIndex>>, query: String) -> Vec<Place> {
    match places.inner() {
        Some(index) => index.search(&query, 12).into_iter().cloned().collect(),
        None => Vec::new(),
    }
}

#[tauri::command]
fn charts_list(db: State<'_, Database>) -> Result<Vec<ChartRecord>, String> {
    db.with(db::list_charts)
}

#[tauri::command]
fn chart_save(db: State<'_, Database>, chart: ChartRecord) -> Result<ChartRecord, String> {
    if chart.name.trim().is_empty() {
        return Err("navn mangler".to_string());
    }
    db.with(|c| {
        let id = db::save_chart(c, &chart)?;
        db::get_chart(c, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
    })
}

#[tauri::command]
fn chart_delete(db: State<'_, Database>, id: i64) -> Result<(), String> {
    db.with(|c| db::delete_chart(c, id))
}

#[tauri::command]
fn folders_list(db: State<'_, Database>) -> Result<Vec<Folder>, String> {
    db.with(db::list_folders)
}

#[tauri::command]
fn folder_create(db: State<'_, Database>, name: String) -> Result<Folder, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("navn mangler".to_string());
    }
    db.with(|c| db::create_folder(c, name))
}

#[tauri::command]
fn folder_rename(db: State<'_, Database>, id: i64, name: String) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("navn mangler".to_string());
    }
    db.with(|c| db::rename_folder(c, id, name))
}

#[tauri::command]
fn folder_delete(db: State<'_, Database>, id: i64) -> Result<(), String> {
    db.with(|c| db::delete_folder(c, id))
}

#[tauri::command]
fn setting_get(db: State<'_, Database>, key: String) -> Result<Option<String>, String> {
    db.with(|c| db::get_setting(c, &key))
}

#[tauri::command]
fn setting_set(db: State<'_, Database>, key: String, value: String) -> Result<(), String> {
    db.with(|c| db::set_setting(c, &key, &value))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            let resources = app.path().resource_dir()?;
            // A failure here is reported by every calculation command, so the
            // window still opens and can show the message.
            if let Err(error) = ephemeris::init(&resources.join("ephe")) {
                eprintln!("ephemeris init failed: {error}");
            }

            // Without the place list the form still works with manual
            // coordinates, so a missing or broken file is not fatal.
            let places = std::fs::read_to_string(resources.join("places.tsv"))
                .map_err(|e| e.to_string())
                .and_then(|tsv| PlaceIndex::parse(&tsv));
            if let Err(error) = &places {
                eprintln!("place list not loaded: {error}");
            }
            app.manage(places.ok());

            // The user's data lives outside the install folder so that
            // updates and reinstalls never touch it.
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let connection = db::open(&data_dir.join("astrologiprogrammet.db"))?;
            app.manage(Database(Mutex::new(connection)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            sky_now,
            birth_resolve,
            chart_compute,
            places_search,
            charts_list,
            chart_save,
            chart_delete,
            folders_list,
            folder_create,
            folder_rename,
            folder_delete,
            setting_get,
            setting_set,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
