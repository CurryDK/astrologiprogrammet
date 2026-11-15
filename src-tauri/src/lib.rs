mod db;

use std::sync::Mutex;

use astro_core::aspects::{Aspect, Orbs, find_aspects};
use astro_core::chart::{Chart, Sect, compute_chart};
use astro_core::condition::{ConditionOptions, ConditionReport, PlanetStations, condition_report, planet_stations};
use astro_core::ephemeris;
use astro_core::lots::{LotReport, lot_report};
use astro_core::places::{Place, PlaceIndex};
use astro_core::profections::{
    Birth, ProfectionOptions, ProfectionYear, age_at, month_at, profection_year as compute_profection_year,
};
use astro_core::aspects::{AspectKind, ChartPoint, AngleId};
use astro_core::chart::BodyPosition;
use astro_core::profections::Moment;
use astro_core::time::{ResolvedTime, StepUnit, ZoneChoice, resolve, step};
use astro_core::transits::{PassTarget, TransitAspect, exact_passes, transit_aspects};
use astro_core::zodiac::{Body, whole_sign_house};
use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

use db::{ChartRecord, Folder, LifeEvent};

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

/// A profection year with where "now" (or a chosen moment) falls in it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfectionReport {
    year: ProfectionYear,
    /// Age at the reference moment; `None` when it lies before the birth.
    current_age: Option<u32>,
    /// Month (1–12) of this year holding the reference moment, if it is in this year.
    current_month: Option<u8>,
    /// True when the birth time is unknown and 12:00 was used.
    time_assumed: bool,
}

/// One click on a time navigation arrow.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StepInput {
    unit: StepUnit,
    /// Negative to go back.
    count: i32,
}

/// The sky at a chosen moment, with the moment's clock reading.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SkyAt {
    at: Moment,
    computed: ComputedChart,
}

/// The transit layer of a Live Chart at one moment.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveChart {
    at: Moment,
    /// Transiting bodies; `house` is the natal whole-sign house they are in.
    positions: Vec<BodyPosition>,
    /// Aspects from transiting bodies to natal bodies and angles.
    to_natal: Vec<TransitAspect>,
    /// Aspects among the transiting bodies.
    to_transit: Vec<Aspect>,
    /// Age at the moment; `None` before the birth.
    age: Option<u32>,
    /// The profection year holding the moment.
    profection: Option<ProfectionYear>,
    /// The month (1–12) of that year holding the moment.
    profection_month: Option<u8>,
}

/// Planetary Condition of a natal chart.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConditionReply {
    #[serde(flatten)]
    report: ConditionReport,
    /// Last and next station of Mercury to Saturn around the birth, with
    /// clock readings at the birthplace.
    stations: Vec<PlanetStations>,
}

/// What a transit aspect is made to.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum PassOther {
    /// A point of the natal chart.
    Natal(ChartPoint),
    /// Another transiting body.
    Transit(Body),
}

fn named_zone(zone: &str) -> ZoneChoice {
    ZoneChoice::Named(zone.to_string())
}

/// The moment asked for (now when absent), moved by a navigation step.
fn moment_for(
    at: Option<DateTime<Utc>>,
    step_input: Option<StepInput>,
    zone: &ZoneChoice,
) -> Result<Moment, String> {
    let mut utc = at.unwrap_or_else(Utc::now);
    if let Some(input) = step_input {
        utc = step(utc, zone, input.unit, input.count)
            .map_err(|e| e.to_string())?
            .ok_or("tidspunktet er uden for kalenderen")?;
    }
    Moment::in_zone(utc, zone).map_err(|e| e.to_string())
}

fn parse_birth(birth: &BirthInput) -> Result<Birth, String> {
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
    Ok(Birth { date, time, zone })
}

fn resolve_input(birth: &BirthInput) -> Result<ResolvedTime, String> {
    let birth = parse_birth(birth)?;
    resolve(birth.date, birth.time, &birth.zone).map_err(|e| e.to_string())
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

/// The sky at a chosen moment (now when absent), optionally moved one
/// navigation step, seen from a place. `zone` is the time zone the moment
/// is shown and stepped in.
#[tauri::command]
fn sky_at(
    at: Option<DateTime<Utc>>,
    step: Option<StepInput>,
    zone: String,
    latitude: f64,
    longitude: f64,
    orbs: Orbs,
) -> Result<SkyAt, String> {
    let at = moment_for(at, step, &named_zone(&zone))?;
    let computed = compute(at.utc, latitude, longitude, &orbs, None, None)?;
    Ok(SkyAt { at, computed })
}

/// A local date and clock time (12:00 when absent) in a zone, as UTC.
#[tauri::command]
fn local_resolve(date: String, time: Option<String>, zone: String) -> Result<ResolvedTime, String> {
    resolve_input(&BirthInput {
        date,
        time,
        latitude: 0.0,
        longitude: 0.0,
        zone: Some(zone),
        offset_seconds: None,
    })
}

/// The transits to a natal chart at a moment (now when absent), optionally
/// moved one navigation step. `orb` is the maximum orb of transit aspects.
#[tauri::command]
fn live_chart(
    birth: BirthInput,
    at: Option<DateTime<Utc>>,
    step: Option<StepInput>,
    zone: String,
    orb: f64,
    profections: ProfectionOptions,
) -> Result<LiveChart, String> {
    if !orb.is_finite() || orb < 0.0 {
        return Err("ugyldig orb for transitter".to_string());
    }
    let at = moment_for(at, step, &named_zone(&zone))?;
    let born = resolve_input(&birth)?;
    let natal = compute_chart(born.utc, birth.latitude, birth.longitude).map_err(|e| e.to_string())?;
    let transit = compute_chart(at.utc, birth.latitude, birth.longitude).map_err(|e| e.to_string())?;
    let orbs = Orbs::uniform(orb);
    let rising_sign = natal.houses[0].sign;

    let to_natal = transit_aspects(&transit, &natal, &orbs);
    // The transit chart's own angles belong to a place, not to the sky.
    let bodies: Vec<_> = transit
        .aspect_points()
        .into_iter()
        .filter(|point| matches!(point.id, ChartPoint::Body(_)))
        .collect();
    let to_transit = find_aspects(&bodies, &orbs);
    let positions = transit
        .positions
        .iter()
        .map(|p| BodyPosition { house: whole_sign_house(p.point.sign, rising_sign), ..*p })
        .collect();

    // Profections are extra information here; a moment they cannot be
    // calculated for still has its transits.
    let birth_data = parse_birth(&birth)?;
    let age = age_at(&birth_data, &profections, at.utc).ok().flatten();
    let profection = age
        .and_then(|age| compute_profection_year(&birth_data, rising_sign, &profections, age).ok());
    let profection_month = profection.as_ref().and_then(|year| month_at(year, at.utc));

    Ok(LiveChart {
        at,
        positions,
        to_natal,
        to_transit,
        age,
        profection,
        profection_month,
    })
}

/// Planetary Condition of a natal chart. `sect_override` is the manual
/// day/night choice; `options` holds the adjustable distances from the Sun.
#[tauri::command]
fn planetary_condition(
    birth: BirthInput,
    sect_override: Option<Sect>,
    options: ConditionOptions,
) -> Result<ConditionReply, String> {
    let limits = [options.cazimi, options.combust, options.beams];
    if limits.iter().any(|limit| !limit.is_finite() || *limit < 0.0)
        || options.cazimi > options.combust
        || options.combust > options.beams
    {
        return Err("ugyldige grænser for afstand til Solen".to_string());
    }
    let born = resolve_input(&birth)?;
    let chart = compute_chart(born.utc, birth.latitude, birth.longitude).map_err(|e| e.to_string())?;
    let zone = parse_birth(&birth)?.zone;
    Ok(ConditionReply {
        report: condition_report(&chart, sect_override, &options),
        stations: planet_stations(born.utc, &zone),
    })
}

/// The moments a transit aspect is exact around `at`: several when
/// retrograde motion makes the transiting body pass more than once.
#[tauri::command]
fn transit_passes(
    birth: BirthInput,
    transit: Body,
    other: PassOther,
    kind: AspectKind,
    at: DateTime<Utc>,
    zone: String,
) -> Result<Vec<Moment>, String> {
    let target = match other {
        PassOther::Transit(body) => PassTarget::Body(body),
        PassOther::Natal(point) => {
            let born = resolve_input(&birth)?;
            let natal =
                compute_chart(born.utc, birth.latitude, birth.longitude).map_err(|e| e.to_string())?;
            PassTarget::Fixed(match point {
                ChartPoint::Body(body) => natal.position(body).point.longitude,
                ChartPoint::Angle(AngleId::Ascendant) => natal.angles.ascendant.point.longitude,
                ChartPoint::Angle(AngleId::Midheaven) => natal.angles.midheaven.point.longitude,
            })
        }
    };
    let zone = named_zone(&zone);
    exact_passes(transit, target, kind, at)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|utc| Moment::in_zone(utc, &zone).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
fn events_list(db: State<'_, Database>, chart_id: i64) -> Result<Vec<LifeEvent>, String> {
    db.with(|c| db::list_events(c, chart_id))
}

#[tauri::command]
fn event_save(db: State<'_, Database>, event: LifeEvent) -> Result<LifeEvent, String> {
    event.validate()?;
    db.with(|c| {
        let id = db::save_event(c, &event)?;
        db::get_event(c, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
    })
}

#[tauri::command]
fn event_delete(db: State<'_, Database>, id: i64) -> Result<(), String> {
    db.with(|c| db::delete_event(c, id))
}

/// The profection year for an age, or, without an age, the year that holds
/// the reference moment `at` (now when absent). Year 0 is used for a
/// reference moment before the birth.
#[tauri::command]
fn profection_year(
    birth: BirthInput,
    options: ProfectionOptions,
    age: Option<u32>,
    at: Option<DateTime<Utc>>,
) -> Result<ProfectionReport, String> {
    let time = resolve_input(&birth)?;
    let chart = compute_chart(time.utc, birth.latitude, birth.longitude).map_err(|e| e.to_string())?;
    let rising_sign = chart.houses[0].sign;
    let born = parse_birth(&birth)?;
    let at = at.unwrap_or_else(Utc::now);

    let current_age = age_at(&born, &options, at).map_err(|e| e.to_string())?;
    let age = age.or(current_age).unwrap_or(0);
    let year =
        compute_profection_year(&born, rising_sign, &options, age).map_err(|e| e.to_string())?;
    let current_month = month_at(&year, at);
    Ok(ProfectionReport {
        year,
        current_age,
        current_month,
        time_assumed: time.time_assumed,
    })
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
            profection_year,
            sky_at,
            local_resolve,
            live_chart,
            transit_passes,
            planetary_condition,
            events_list,
            event_save,
            event_delete,
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
