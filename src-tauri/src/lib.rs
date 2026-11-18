mod db;

use std::sync::Mutex;

use astro_core::aspects::{Aspect, Orbs, find_aspects};
use astro_core::chart::{Chart, Sect, compute_chart};
use astro_core::condition::{ConditionOptions, ConditionReport, PlanetStations, condition_report, planet_stations};
use astro_core::ephemeris;
use astro_core::events::{
    AspectCourse, CourseOptions, Event, LayerPoint, SearchOptions, courses as core_courses, search as core_search,
};
use astro_core::retrograde::{PlanetRetrograde, retrograde_cycles as core_retrograde_cycles};
use astro_core::synodic::{SynodicEvent, SynodicKind, synodic_cycles as core_synodic_cycles};
use astro_core::zodiac::ZodiacPoint;
use astro_core::lots::{LotReport, lot_report};
use astro_core::places::{Place, PlaceIndex};
use astro_core::profections::{
    Birth, ProfectionOptions, ProfectionYear, age_at, month_at, profection_year as compute_profection_year,
};
use astro_core::aspects::{AspectKind, ChartPoint, AngleId};
use astro_core::chart::BodyPosition;
use astro_core::profections::Moment;
use astro_core::progressions::{
    AngleMethod, ProgressedTarget, ProgressionOptions, Progressions, progressed_passes, progressions,
};
use astro_core::rings::{WheelRings, wheel_rings as core_wheel_rings};
use astro_core::solar_return::{MAX_RETURN, active_return, return_moment};
use astro_core::profections::{annual_house, sign_of_house};
use astro_core::solarfire::{self, ImportedChart};
use astro_core::time::{ResolvedTime, StepUnit, ZoneChoice, resolve, step};
use astro_core::transits::{PassTarget, TransitAspect, exact_passes, transit_aspects};
use astro_core::zodiac::{Body, whole_sign_house};
use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

use db::{ChartRecord, Folder, LifeEvent, ReturnChoice};

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
    /// Secondary progressions for the same moment; absent before the birth.
    progressions: Option<Progressions>,
    /// True when the birth time is unknown and 12:00 was used.
    time_assumed: bool,
}

/// How the progression layer of a Live Chart is calculated.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProgressionInput {
    /// Maximum orb of progression aspects, in degrees.
    orb: f64,
    angle_method: AngleMethod,
}

/// What a progression aspect is made to.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum ProgressionOther {
    /// A point of the natal chart.
    Natal(ChartPoint),
    /// Another progressed body.
    Progressed(Body),
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

/// The transits and secondary progressions to a natal chart at a moment
/// (now when absent), optionally moved one navigation step. Both layers
/// always share that moment. `orb` is the maximum orb of transit aspects.
#[tauri::command]
fn live_chart(
    birth: BirthInput,
    at: Option<DateTime<Utc>>,
    step: Option<StepInput>,
    zone: String,
    orb: f64,
    profections: ProfectionOptions,
    progression: ProgressionInput,
) -> Result<LiveChart, String> {
    if !orb.is_finite() || orb < 0.0 {
        return Err("ugyldig orb for transitter".to_string());
    }
    if !progression.orb.is_finite() || progression.orb < 0.0 {
        return Err("ugyldig orb for progressioner".to_string());
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

    // Like the profections, the progressions are extra here.
    let progressions = progressions(
        &natal,
        at.utc,
        &ProgressionOptions {
            orb: progression.orb,
            angle_method: progression.angle_method,
            birth_time_known: !born.time_assumed,
        },
    )
    .ok()
    .flatten();

    Ok(LiveChart {
        at,
        positions,
        to_natal,
        to_transit,
        age,
        profection,
        profection_month,
        progressions,
        time_assumed: born.time_assumed,
    })
}

fn check_condition_options(options: &ConditionOptions) -> Result<(), String> {
    let limits = [options.cazimi, options.combust, options.beams];
    if limits.iter().any(|limit| !limit.is_finite() || *limit < 0.0)
        || options.cazimi > options.combust
        || options.combust > options.beams
    {
        return Err("ugyldige grænser for afstand til Solen".to_string());
    }
    Ok(())
}

/// A moment and place a chart is cast for without a birth form: a Solar Return.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CastInput {
    utc: DateTime<Utc>,
    latitude: f64,
    longitude: f64,
    zone: Option<String>,
    /// Manual UTC offset in seconds; overrides `zone` when set.
    offset_seconds: Option<i32>,
}

/// Planetary Condition of a chart cast for a moment and place, from that
/// chart's own positions and houses alone (specification §10: Solar Return).
#[tauri::command]
fn planetary_condition_at(
    cast: CastInput,
    sect_override: Option<Sect>,
    options: ConditionOptions,
) -> Result<ConditionReply, String> {
    check_condition_options(&options)?;
    if !(-90.0..=90.0).contains(&cast.latitude) || !(-180.0..=180.0).contains(&cast.longitude) {
        return Err("ugyldige koordinater".to_string());
    }
    let zone = match (cast.offset_seconds, cast.zone) {
        (Some(seconds), _) => ZoneChoice::FixedOffset(seconds),
        (None, Some(name)) => ZoneChoice::Named(name),
        (None, None) => return Err("tidszone mangler".to_string()),
    };
    let chart = compute_chart(cast.utc, cast.latitude, cast.longitude).map_err(|e| e.to_string())?;
    Ok(ConditionReply {
        report: condition_report(&chart, sect_override, &options),
        stations: planet_stations(cast.utc, &zone),
    })
}

/// Where a Solar Return is cast for.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReturnPlaceShown {
    name: String,
    country_code: Option<String>,
    latitude: f64,
    longitude: f64,
    zone: Option<String>,
    offset_seconds: Option<i32>,
    /// False for the birthplace, true for a place chosen for this year.
    changed: bool,
}

/// One Solar Return of a saved chart.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SolarReturnReply {
    /// The number of the return: the age it begins. 0 is the birth itself.
    age: u32,
    /// The return in force now: the latest that has occurred.
    active_age: u32,
    /// The exact moment of the return, with the clock reading at the place.
    moment: Moment,
    place: ReturnPlaceShown,
    /// Manual day/night sect of this return; `None` when the Sun decides.
    sect_override: Option<Sect>,
    /// The chart of the return at the place. Without a birth time its
    /// angles and houses mean nothing and `lots` is absent.
    computed: ComputedChart,
    /// True when the birth time is unknown and 12:00 was used; the return
    /// is then limited to positions and aspects.
    time_assumed: bool,
    /// Lord of the Year of the natal annual profection for this age; absent
    /// without a birth time, which the rising sign depends on.
    time_lord: Option<Body>,
}

/// A Solar Return of a saved chart: the one for `age`, or without an age the
/// one in force now. The place and the manual sect are those stored for that
/// chart and year; the birthplace and the automatic sect otherwise.
#[tauri::command]
fn solar_return(
    db: State<'_, Database>,
    chart_id: i64,
    age: Option<u32>,
    orbs: Orbs,
    lot_orb: f64,
    lot_exact_orb: f64,
) -> Result<SolarReturnReply, String> {
    let record = db
        .with(|c| db::get_chart(c, chart_id))?
        .ok_or("horoskopet findes ikke")?;
    let birth = BirthInput {
        date: record.birth_date.clone(),
        time: record.birth_time.clone(),
        latitude: record.latitude,
        longitude: record.longitude,
        zone: record.zone.clone(),
        offset_seconds: record.offset_seconds,
    };
    let born = resolve_input(&birth)?;
    let active_age = active_return(born.utc, Utc::now()).map_err(|e| e.to_string())?;
    let age = age.unwrap_or(active_age);
    if age > MAX_RETURN {
        return Err(format!("Solar Return nr. {age} er uden for programmets område"));
    }
    let utc = return_moment(born.utc, age).map_err(|e| e.to_string())?;

    let choice = db.with(|c| db::get_return_choice(c, chart_id, age))?;
    let (place, zone) = match &choice.place {
        Some(place) => (
            ReturnPlaceShown {
                name: place.name.clone(),
                country_code: place.country_code.clone(),
                latitude: place.latitude,
                longitude: place.longitude,
                zone: Some(place.zone.clone()),
                offset_seconds: None,
                changed: true,
            },
            named_zone(&place.zone),
        ),
        None => (
            ReturnPlaceShown {
                name: record.place_name.clone(),
                country_code: record.country_code.clone(),
                latitude: record.latitude,
                longitude: record.longitude,
                zone: record.zone.clone(),
                offset_seconds: record.offset_seconds,
                changed: false,
            },
            parse_birth(&birth)?.zone,
        ),
    };
    let moment = Moment::in_zone(utc, &zone).map_err(|e| e.to_string())?;

    // Without a birth time the return moment may be half a day off, so
    // angles, houses, lots and sect are left out (decision of 18 November 2026).
    let lot_options = LotOptions {
        sect_override: choice.sect_override,
        orb: lot_orb,
        exact_orb: lot_exact_orb,
    };
    let lots = if born.time_assumed { None } else { Some(&lot_options) };
    let computed = compute(utc, place.latitude, place.longitude, &orbs, None, lots)?;

    let time_lord = if born.time_assumed {
        None
    } else {
        let natal =
            compute_chart(born.utc, birth.latitude, birth.longitude).map_err(|e| e.to_string())?;
        Some(sign_of_house(natal.houses[0].sign, annual_house(age)).ruler())
    };

    Ok(SolarReturnReply {
        age,
        active_age,
        moment,
        place,
        sect_override: choice.sect_override,
        computed,
        time_assumed: born.time_assumed,
        time_lord,
    })
}

/// An exact event with the clock reading in the zone asked for.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TimedEvent {
    at: Moment,
    #[serde(flatten)]
    event: Event,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchReply {
    events: Vec<TimedEvent>,
    /// More were found than are returned; only the earliest are here.
    truncated: bool,
}

/// The longest period the transiting sky is searched over, in days.
const MAX_TRANSIT_SEARCH_DAYS: i64 = 3660;

fn check_period(start: DateTime<Utc>, end: DateTime<Utc>, transits: bool, limit_days: i64) -> Result<(), String> {
    if end < start {
        return Err("periodens slutning ligger før dens begyndelse".to_string());
    }
    if transits && (end - start).num_days() > limit_days {
        return Err(format!(
            "perioden er for lang til transitter: højst {} år",
            (limit_days as f64 / 365.25).round()
        ));
    }
    Ok(())
}

/// Exact events of a period for a natal chart: aspects in the four decided
/// combinations, sign changes, stations and the progressed events, in time
/// order with clock readings in `zone`.
#[tauri::command]
async fn event_search(birth: BirthInput, mut options: SearchOptions, zone: String) -> Result<SearchReply, String> {
    let transits = !options.transit_bodies.is_empty()
        && (options.transit_to_natal
            || options.transit_to_transit
            || options.transit_sign_changes
            || options.transit_stations);
    check_period(options.start, options.end, transits, MAX_TRANSIT_SEARCH_DAYS)?;
    let born = resolve_input(&birth)?;
    let natal = compute_chart(born.utc, birth.latitude, birth.longitude).map_err(|e| e.to_string())?;
    options.birth_time_known = !born.time_assumed;
    let found = core_search(&natal, &options).map_err(|e| e.to_string())?;
    let zone = named_zone(&zone);
    let events = found
        .events
        .into_iter()
        .map(|event| Ok(TimedEvent { at: Moment::in_zone(event.utc, &zone).map_err(|e| e.to_string())?, event }))
        .collect::<Result<Vec<_>, String>>()?;
    Ok(SearchReply { events, truncated: found.truncated })
}

/// One stay of an aspect within its orb; a missing end lies outside the
/// time the aspect is followed for.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TimedPeriod {
    enter: Option<Moment>,
    leave: Option<Moment>,
}

/// The course of an aspect through its orb, with clock readings.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TimedCourse {
    a: LayerPoint,
    b: LayerPoint,
    kind: AspectKind,
    position_a: ZodiacPoint,
    position_b: ZodiacPoint,
    orb: Option<f64>,
    applying: Option<bool>,
    periods: Vec<TimedPeriod>,
    exact: Vec<Moment>,
    days_in_orb: f64,
    uncertain: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CourseReply {
    courses: Vec<TimedCourse>,
    truncated: bool,
    /// The reference moment and the period, with their clock readings.
    at: Moment,
    start: Moment,
    end: Moment,
}

/// The longest period aspect courses of the transiting sky are collected over, in days.
const MAX_TRANSIT_COURSE_DAYS: i64 = 740;

/// The aspects within orb at some time in a period (or at one moment), each
/// with when it enters the orb, is exact and leaves the orb.
#[tauri::command]
async fn aspect_courses(birth: BirthInput, mut options: CourseOptions, zone: String) -> Result<CourseReply, String> {
    for orb in [options.transit_orb, options.progressed_orb] {
        if !orb.is_finite() || orb < 0.0 {
            return Err("ugyldig orb".to_string());
        }
    }
    let transits =
        !options.transit_bodies.is_empty() && (options.transit_to_natal || options.transit_to_transit);
    check_period(options.start, options.end, transits, MAX_TRANSIT_COURSE_DAYS)?;
    let born = resolve_input(&birth)?;
    let natal = compute_chart(born.utc, birth.latitude, birth.longitude).map_err(|e| e.to_string())?;
    options.birth_time_known = !born.time_assumed;
    let found = core_courses(&natal, &options).map_err(|e| e.to_string())?;
    let zone = named_zone(&zone);
    let moment = |utc: DateTime<Utc>| Moment::in_zone(utc, &zone).map_err(|e| e.to_string());
    let timed = |course: AspectCourse| -> Result<TimedCourse, String> {
        Ok(TimedCourse {
            a: course.a,
            b: course.b,
            kind: course.kind,
            position_a: course.position_a,
            position_b: course.position_b,
            orb: course.orb,
            applying: course.applying,
            periods: course
                .periods
                .iter()
                .map(|period| {
                    Ok(TimedPeriod {
                        enter: period.enter.map(&moment).transpose()?,
                        leave: period.leave.map(&moment).transpose()?,
                    })
                })
                .collect::<Result<Vec<_>, String>>()?,
            exact: course.exact.iter().map(|utc| moment(*utc)).collect::<Result<Vec<_>, String>>()?,
            days_in_orb: course.days_in_orb,
            uncertain: course.uncertain,
        })
    };
    Ok(CourseReply {
        courses: found.courses.into_iter().map(timed).collect::<Result<Vec<_>, String>>()?,
        truncated: found.truncated,
        at: moment(options.at)?,
        start: moment(options.start)?,
        end: moment(options.end)?,
    })
}

/// A conjunction with or opposition to the Sun, with its clock reading.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TimedSynodicEvent {
    kind: SynodicKind,
    at: Moment,
    position: ZodiacPoint,
    /// Days from the reference moment; negative before it.
    days: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TimedSynodicCycle {
    body: Body,
    position: ZodiacPoint,
    retrograde: bool,
    last_conjunction: Option<TimedSynodicEvent>,
    next_conjunction: Option<TimedSynodicEvent>,
    last_opposition: Option<TimedSynodicEvent>,
    next_opposition: Option<TimedSynodicEvent>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SynodicReply {
    /// The reference moment (now when none was asked for).
    at: Moment,
    cycles: Vec<TimedSynodicCycle>,
}

/// The synodic cycle of each planet around a moment (now when absent):
/// latest and next conjunction with the Sun, and opposition where there is one.
#[tauri::command]
fn synodic_cycles(at: Option<DateTime<Utc>>, zone: String) -> Result<SynodicReply, String> {
    let zone = named_zone(&zone);
    let at = at.unwrap_or_else(Utc::now);
    let timed = |event: Option<SynodicEvent>| -> Result<Option<TimedSynodicEvent>, String> {
        event
            .map(|event| {
                Ok(TimedSynodicEvent {
                    kind: event.kind,
                    at: Moment::in_zone(event.utc, &zone).map_err(|e| e.to_string())?,
                    position: event.position,
                    days: event.days,
                })
            })
            .transpose()
    };
    let cycles = core_synodic_cycles(at)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|cycle| {
            Ok(TimedSynodicCycle {
                body: cycle.body,
                position: cycle.position,
                retrograde: cycle.retrograde,
                last_conjunction: timed(cycle.last_conjunction)?,
                next_conjunction: timed(cycle.next_conjunction)?,
                last_opposition: timed(cycle.last_opposition)?,
                next_opposition: timed(cycle.next_opposition)?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(SynodicReply { at: Moment::in_zone(at, &zone).map_err(|e| e.to_string())?, cycles })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RetrogradeReply {
    /// The reference moment (now when none was asked for).
    at: Moment,
    planets: Vec<PlanetRetrograde>,
}

/// The retrograde cycles of Mercury to Pluto around a moment (now when
/// absent): stations, shadow and sign changes of the latest completed,
/// the current and the next retrograde period.
#[tauri::command]
async fn retrograde_cycles(at: Option<DateTime<Utc>>, zone: String) -> Result<RetrogradeReply, String> {
    let zone = named_zone(&zone);
    let at = at.unwrap_or_else(Utc::now);
    Ok(RetrogradeReply {
        at: Moment::in_zone(at, &zone).map_err(|e| e.to_string())?,
        planets: core_retrograde_cycles(at, &zone).map_err(|e| e.to_string())?,
    })
}

/// Stores the place and manual sect chosen for one Solar Return of a chart.
#[tauri::command]
fn solar_return_set(
    db: State<'_, Database>,
    chart_id: i64,
    age: u32,
    choice: ReturnChoice,
) -> Result<(), String> {
    if let Some(place) = &choice.place {
        if place.name.trim().is_empty() {
            return Err("stednavn mangler".to_string());
        }
        if !(-90.0..=90.0).contains(&place.latitude) || !(-180.0..=180.0).contains(&place.longitude) {
            return Err("ugyldige koordinater".to_string());
        }
        Moment::in_zone(Utc::now(), &named_zone(&place.zone)).map_err(|e| e.to_string())?;
    }
    db.with(|c| db::set_return_choice(c, chart_id, age, &choice))
}

/// Planetary Condition of a natal chart. `sect_override` is the manual
/// day/night choice; `options` holds the adjustable distances from the Sun.
#[tauri::command]
fn planetary_condition(
    birth: BirthInput,
    sect_override: Option<Sect>,
    options: ConditionOptions,
) -> Result<ConditionReply, String> {
    check_condition_options(&options)?;
    let born = resolve_input(&birth)?;
    let chart = compute_chart(born.utc, birth.latitude, birth.longitude).map_err(|e| e.to_string())?;
    let zone = parse_birth(&birth)?.zone;
    Ok(ConditionReply {
        report: condition_report(&chart, sect_override, &options),
        stations: planet_stations(born.utc, &zone),
    })
}

/// The moments of life at which a progression aspect is exact around `at`:
/// several when retrograde motion makes the progressed body pass more than once.
#[tauri::command]
fn progression_passes(
    birth: BirthInput,
    progressed: ChartPoint,
    other: ProgressionOther,
    kind: AspectKind,
    at: DateTime<Utc>,
    zone: String,
    angle_method: AngleMethod,
) -> Result<Vec<Moment>, String> {
    let born = resolve_input(&birth)?;
    let natal = compute_chart(born.utc, birth.latitude, birth.longitude).map_err(|e| e.to_string())?;
    let target = match other {
        ProgressionOther::Progressed(body) => ProgressedTarget::Progressed(body),
        ProgressionOther::Natal(point) => ProgressedTarget::Natal(match point {
            ChartPoint::Body(body) => natal.position(body).point.longitude,
            ChartPoint::Angle(AngleId::Ascendant) => natal.angles.ascendant.point.longitude,
            ChartPoint::Angle(AngleId::Midheaven) => natal.angles.midheaven.point.longitude,
        }),
    };
    let zone = named_zone(&zone);
    progressed_passes(&natal, progressed, target, kind, at, angle_method)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|utc| Moment::in_zone(utc, &zone).map_err(|e| e.to_string()))
        .collect()
}

/// The decan and bounds rings of the wheel: fixed tables, the same for every chart.
#[tauri::command]
fn wheel_rings() -> WheelRings {
    core_wheel_rings()
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

/// A chart of a Solar Fire file with whether the archive already has it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SolarFireChart {
    #[serde(flatten)]
    chart: ImportedChart,
    /// A chart with the same name, birth date and birth time is in the archive.
    in_archive: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SolarFireFile {
    /// The title the file carries; often Solar Fire's "New Chart File".
    title: String,
    charts: Vec<SolarFireChart>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportSummary {
    folder_id: Option<i64>,
    charts: usize,
    events: usize,
}

fn solar_fire_charts(
    places: &Option<PlaceIndex>,
    bytes: &[u8],
) -> Result<(String, Vec<ImportedChart>), String> {
    let file = solarfire::parse(bytes)?;
    // Without the place list the charts keep the offsets of the file.
    let empty;
    let index = match places {
        Some(index) => index,
        None => {
            empty = PlaceIndex::parse("")?;
            &empty
        }
    };
    let charts = solarfire::convert(&file, index);
    Ok((file.title, charts))
}

/// What a Solar Fire chart file (`.SFcht`) holds, as it would be imported.
#[tauri::command]
fn solar_fire_read(
    db: State<'_, Database>,
    places: State<'_, Option<PlaceIndex>>,
    bytes: Vec<u8>,
) -> Result<SolarFireFile, String> {
    let (title, charts) = solar_fire_charts(places.inner(), &bytes)?;
    let archive = db.with(db::list_charts)?;
    let same = |a: &str, b: &str| a.trim().to_lowercase() == b.trim().to_lowercase();
    let charts = charts
        .into_iter()
        .map(|chart| {
            let in_archive = archive.iter().any(|stored| {
                same(&stored.name, &chart.name)
                    && stored.birth_date == chart.birth_date
                    && stored.birth_time == chart.birth_time
            });
            SolarFireChart { chart, in_archive }
        })
        .collect();
    Ok(SolarFireFile { title, charts })
}

/// Saves the charts at the positions `selected` of a Solar Fire file, with
/// their life events, in the folder called `folder` (created when missing;
/// empty for no folder).
#[tauri::command]
fn solar_fire_import(
    db: State<'_, Database>,
    places: State<'_, Option<PlaceIndex>>,
    bytes: Vec<u8>,
    folder: String,
    selected: Vec<usize>,
) -> Result<ImportSummary, String> {
    let (_, charts) = solar_fire_charts(places.inner(), &bytes)?;
    let mut batch = Vec::new();
    for index in selected {
        let chart = charts.get(index).ok_or("horoskopet findes ikke i filen")?;
        if let Some(problem) = &chart.problem {
            return Err(format!("{}: {problem}", chart.name));
        }
        let record = ChartRecord {
            id: None,
            name: chart.name.clone(),
            folder_id: None,
            birth_date: chart.birth_date.clone(),
            birth_time: chart.birth_time.clone(),
            place_name: chart.place_name.clone(),
            country_code: chart.country_code.clone(),
            latitude: chart.latitude,
            longitude: chart.longitude,
            zone: chart.zone.clone(),
            offset_seconds: chart.offset_seconds,
            featured: false,
            sect_override: None,
        };
        let events = chart
            .events
            .iter()
            .map(|event| {
                let event = LifeEvent {
                    id: None,
                    chart_id: 0,
                    title: event.title.clone(),
                    year: event.year,
                    month: Some(event.month),
                    day: Some(event.day),
                    time: Some(event.time.clone()),
                    zone: event.zone.clone(),
                    note: event.note.clone(),
                };
                event.validate().map(|()| event)
            })
            .collect::<Result<Vec<_>, _>>()?;
        batch.push((record, events));
    }
    let folder_id = db.with(|c| db::import_charts(c, &folder, &batch))?;
    Ok(ImportSummary {
        folder_id,
        charts: batch.len(),
        events: batch.iter().map(|(_, events)| events.len()).sum(),
    })
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
            progression_passes,
            planetary_condition,
            planetary_condition_at,
            solar_return,
            solar_return_set,
            event_search,
            aspect_courses,
            synodic_cycles,
            retrograde_cycles,
            wheel_rings,
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
            solar_fire_read,
            solar_fire_import,
            setting_get,
            setting_set,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
