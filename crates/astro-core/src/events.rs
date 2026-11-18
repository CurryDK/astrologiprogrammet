//! Exact events over a period, and the course of an aspect through its orb
//! (specification §10 and the decisions of 18 November 2026, points 7, 8
//! and 10): exact aspects in the four decided combinations, sign changes,
//! stations and the progressed events, and for an aspect the moments it
//! enters the orb, is exact and leaves the orb.
//!
//! There are no transit → progression aspects: a transiting point is only
//! ever compared with natal or transiting points, a progressed one with
//! natal or progressed points.

use chrono::{DateTime, Duration, TimeZone, Utc};
use serde::{Deserialize, Serialize};

use crate::aspects::{AngleId, AspectKind, ChartPoint};
use crate::chart::{Chart, body_longitude_and_speed};
use crate::condition::Turn;
use crate::ephemeris::{self, EphemerisError};
use crate::normalize_degrees;
use crate::progressions::{AngleMethod, MAX_AGE_YEARS, TROPICAL_YEAR_DAYS, angle_longitude};
use crate::rings::{RingSegment, wheel_rings};
use crate::zodiac::{Body, Sign, ZodiacPoint, whole_sign_house};

/// At most this many events or aspect courses are returned, the earliest.
pub const MAX_RESULTS: usize = 3000;

/// A course ends once the points are this far from exactness; no planet's
/// retrograde arc is longer.
const SERIES_LIMIT_DEGREES: f64 = 25.0;
/// A transit course is never followed further than this from where it was found.
const MAX_SPAN_DAYS: f64 = 15.0 * 365.25;
/// Sampling step of the transiting sky in days: with and without the Moon.
const TRANSIT_STEP_WITH_MOON: f64 = 0.25;
const TRANSIT_STEP: f64 = 1.0;
/// Sampling step of the progressed sky in days of life: the progressed Moon
/// moves about 0.18° in it.
const PROGRESSED_STEP: f64 = 5.0;

/// Which chart a point belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Layer {
    Transit,
    Progressed,
    Natal,
}

/// A point of one of the three charts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerPoint {
    pub layer: Layer,
    pub point: ChartPoint,
}

impl LayerPoint {
    fn new(layer: Layer, point: ChartPoint) -> LayerPoint {
        LayerPoint { layer, point }
    }

    fn body(layer: Layer, body: Body) -> LayerPoint {
        LayerPoint { layer, point: ChartPoint::Body(body) }
    }
}

/// What a moving point is compared with.
#[derive(Clone, Copy)]
enum Other {
    Point(LayerPoint),
    /// A fixed longitude: the start of a sign, a decan or a bound.
    Fixed(f64),
}

/// The two points of a comparison at one moment.
#[derive(Clone, Copy)]
struct Reading {
    jd: f64,
    a: f64,
    b: f64,
    a_speed: f64,
    b_speed: f64,
}

impl Reading {
    /// Signed distance from an aspect whose angle is `offset`, in (-180, 180].
    fn distance(&self, offset: f64) -> f64 {
        signed(self.a - self.b - offset)
    }

    /// Rate of change of the distance, degrees per day.
    fn rate(&self) -> f64 {
        self.a_speed - self.b_speed
    }
}

fn signed(degrees: f64) -> f64 {
    let d = normalize_degrees(degrees);
    if d > 180.0 { d - 360.0 } else { d }
}

fn utc_of(jd: f64) -> DateTime<Utc> {
    // Julian day 2451545.0 is 1 January 2000 at 12:00 UTC.
    let epoch = Utc.with_ymd_and_hms(2000, 1, 1, 12, 0, 0).unwrap();
    epoch + Duration::microseconds(((jd - 2_451_545.0) * 86_400e6).round() as i64)
}

/// The signed aspect angles of the chosen kinds.
fn offsets_of(kinds: &[AspectKind]) -> Vec<(f64, AspectKind)> {
    let mut offsets = Vec::new();
    for kind in AspectKind::ALL {
        if !kinds.contains(&kind) {
            continue;
        }
        offsets.push((kind.angle(), kind));
        if kind.angle() != 0.0 && kind.angle() != 180.0 {
            offsets.push((-kind.angle(), kind));
        }
    }
    offsets
}

/// The natal chart with what is needed to place a point of any layer at a moment.
struct Sky<'a> {
    natal: &'a Chart,
    method: AngleMethod,
}

impl Sky<'_> {
    /// Longitude of a point at a moment (Julian day, UT) and its speed in
    /// degrees per day of real time.
    fn at(&self, point: LayerPoint, jd: f64) -> Result<(f64, f64), EphemerisError> {
        match (point.layer, point.point) {
            (Layer::Natal, ChartPoint::Body(body)) => Ok((self.natal.position(body).point.longitude, 0.0)),
            (Layer::Natal, ChartPoint::Angle(AngleId::Ascendant)) => {
                Ok((self.natal.angles.ascendant.point.longitude, 0.0))
            }
            (Layer::Natal, ChartPoint::Angle(AngleId::Midheaven)) => {
                Ok((self.natal.angles.midheaven.point.longitude, 0.0))
            }
            (Layer::Transit, ChartPoint::Body(body)) => body_longitude_and_speed(jd, body),
            (Layer::Transit, ChartPoint::Angle(_)) => {
                Err(EphemerisError::Library("a transit has no angles".to_string()))
            }
            // A day after the birth for each year of life.
            (Layer::Progressed, ChartPoint::Body(body)) => {
                let progressed = self.natal.julian_day + (jd - self.natal.julian_day) / TROPICAL_YEAR_DAYS;
                let (longitude, speed) = body_longitude_and_speed(progressed, body)?;
                Ok((longitude, speed / TROPICAL_YEAR_DAYS))
            }
            (Layer::Progressed, ChartPoint::Angle(angle)) => {
                let age = (jd - self.natal.julian_day) / TROPICAL_YEAR_DAYS;
                let here = angle_longitude(self.natal, angle, age, self.method)?;
                let step = 0.01;
                let later = angle_longitude(self.natal, angle, age + step, self.method)?;
                Ok((here, signed(later - here) / (step * TROPICAL_YEAR_DAYS)))
            }
        }
    }

    fn reading(&self, a: LayerPoint, other: Other, jd: f64) -> Result<Reading, EphemerisError> {
        let (a, a_speed) = self.at(a, jd)?;
        let (b, b_speed) = match other {
            Other::Point(point) => self.at(point, jd)?,
            Other::Fixed(longitude) => (longitude, 0.0),
        };
        Ok(Reading { jd, a, b, a_speed, b_speed })
    }

    /// Halves an interval until it pins down where `value` changes sign.
    fn bisect(
        &self,
        a: LayerPoint,
        other: Other,
        mut low: Reading,
        mut high: Reading,
        value: impl Fn(&Reading) -> f64,
    ) -> Reading {
        for _ in 0..48 {
            let Ok(middle) = self.reading(a, other, (low.jd + high.jd) / 2.0) else { break };
            if (value(&middle) < 0.0) == (value(&low) < 0.0) {
                low = middle;
            } else {
                high = middle;
            }
        }
        high
    }

    /// The readings between two samples that matter: the samples, and the
    /// moment between them where the two points stop closing in, so that a
    /// point touching exactness and turning back within one step is seen.
    fn stretch(&self, a: LayerPoint, other: Other, from: Reading, to: Reading) -> Vec<Reading> {
        if (from.rate() < 0.0) != (to.rate() < 0.0) {
            vec![from, self.bisect(a, other, from, to, Reading::rate), to]
        } else {
            vec![from, to]
        }
    }

    /// The moments between two samples at which the distance from one of the
    /// `offsets` is zero, with the index of that offset.
    fn exact_between(
        &self,
        a: LayerPoint,
        other: Other,
        offsets: &[f64],
        from: Reading,
        to: Reading,
        found: &mut Vec<(Reading, usize)>,
    ) {
        // Cheap test first: most pairs of samples hold nothing.
        let possible = offsets.iter().any(|offset| {
            let (d0, d1) = (from.distance(*offset), to.distance(*offset));
            (d0 < 0.0) != (d1 < 0.0) || d0.abs().min(d1.abs()) < 2.0
        });
        if !possible {
            return;
        }
        let points = self.stretch(a, other, from, to);
        for pair in points.windows(2) {
            for (index, offset) in offsets.iter().enumerate() {
                let (d0, d1) = (pair[0].distance(*offset), pair[1].distance(*offset));
                // A sign change near ±180° is the wrap-around, not a pass.
                if d0.abs() < 90.0 && d1.abs() < 90.0 && (d0 < 0.0) != (d1 < 0.0) {
                    found.push((self.bisect(a, other, pair[0], pair[1], |r| r.distance(*offset)), index));
                }
            }
        }
    }

    /// A point sampled at every moment of `times`.
    fn sampled(&self, point: LayerPoint, times: &[f64]) -> Result<Vec<(f64, f64)>, EphemerisError> {
        times.iter().map(|jd| self.at(point, *jd)).collect()
    }
}

/// One exact event.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EventKind {
    /// An aspect is exact. `a` is the faster-listed point: the transiting or
    /// progressed one for aspects to the natal chart.
    Aspect { a: LayerPoint, b: LayerPoint, kind: AspectKind },
    /// A point enters a sign; `retrograde` when it backs into it.
    SignChange { point: LayerPoint, sign: Sign, retrograde: bool },
    /// A planet stands still and turns.
    Station { point: LayerPoint, turns: Turn },
    /// The progressed Moon enters a natal whole-sign house.
    MoonHouse { house: u8, sign: Sign },
    /// A progressed lunation phase: 0 new Moon, 2 first quarter, 4 full
    /// Moon, 6 last quarter; the odd numbers are the phases at 45°, 135°,
    /// 225° and 315°.
    Lunation { phase: u8 },
    /// A point enters an Egyptian bound.
    BoundChange { point: LayerPoint, lord: Body, retrograde: bool },
    /// A point enters a Chaldean decan.
    DecanChange { point: LayerPoint, lord: Body, retrograde: bool },
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub utc: DateTime<Utc>,
    #[serde(flatten)]
    pub kind: EventKind,
    /// Where the moving point (the first of an aspect; the Moon of a lunation) stands.
    pub position: ZodiacPoint,
    /// The birth time is unknown and the event depends on it: its moment
    /// may be far off.
    pub uncertain: bool,
}

/// What to search for. The lists are the objects that take part; an empty
/// list switches its part of the search off.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub transit_bodies: Vec<Body>,
    /// Progressed bodies and, with a known birth time, progressed angles.
    pub progressed_points: Vec<ChartPoint>,
    pub natal_points: Vec<ChartPoint>,
    pub aspect_kinds: Vec<AspectKind>,
    pub transit_to_natal: bool,
    pub transit_to_transit: bool,
    pub progressed_to_natal: bool,
    pub progressed_to_progressed: bool,
    pub transit_sign_changes: bool,
    pub transit_stations: bool,
    pub progressed_sign_changes: bool,
    pub progressed_stations: bool,
    pub progressed_moon_houses: bool,
    pub progressed_angle_signs: bool,
    pub lunations_major: bool,
    pub lunations_minor: bool,
    pub progressed_bounds: bool,
    pub progressed_decans: bool,
    pub angle_method: AngleMethod,
    pub birth_time_known: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    /// In time order.
    pub events: Vec<Event>,
    /// More than [`MAX_RESULTS`] were found; only the earliest are returned.
    pub truncated: bool,
}

/// A planet that can stand still: not the Sun, the Moon or the nodes.
fn has_stations(body: Body) -> bool {
    !matches!(body, Body::Sun | Body::Moon | Body::NorthNode | Body::SouthNode)
}

/// Sample moments from `start` to `end` inclusive, `step` apart.
fn sample_times(start: f64, end: f64, step: f64) -> Vec<f64> {
    let count = ((end - start) / step).ceil().max(1.0) as usize;
    let mut times: Vec<f64> = (0..count).map(|i| start + i as f64 * step).collect();
    times.push(end);
    times
}

/// The part of a period that lies within the life progressions are followed for.
fn life_span(natal: &Chart, start: f64, end: f64) -> Option<(f64, f64)> {
    let from = start.max(natal.julian_day);
    let to = end.min(natal.julian_day + MAX_AGE_YEARS * TROPICAL_YEAR_DAYS);
    (to > from).then_some((from, to))
}

/// Whether an unknown birth time makes a point's place or timing unreliable:
/// every progressed point (half a day of birth time is half a year of life)
/// and the natal Moon and angles.
fn depends_on_birth_time(point: LayerPoint) -> bool {
    match point.layer {
        Layer::Progressed => true,
        Layer::Natal => matches!(point.point, ChartPoint::Body(Body::Moon) | ChartPoint::Angle(_)),
        Layer::Transit => false,
    }
}

/// The exact events of a period, in time order.
pub fn search(natal: &Chart, options: &SearchOptions) -> Result<SearchResult, EphemerisError> {
    let sky = Sky { natal, method: options.angle_method };
    let known = options.birth_time_known;
    let start = ephemeris::julian_day(options.start)?;
    let end = ephemeris::julian_day(options.end)?;
    let mut events: Vec<Event> = Vec::new();
    if end <= start {
        return Ok(SearchResult { events, truncated: false });
    }
    let uncertain = |points: &[LayerPoint]| !known && points.iter().any(|p| depends_on_birth_time(*p));

    let aspect_offsets = offsets_of(&options.aspect_kinds);
    let angles: Vec<f64> = aspect_offsets.iter().map(|(offset, _)| *offset).collect();
    let natal_points: Vec<LayerPoint> = options
        .natal_points
        .iter()
        .filter(|point| known || matches!(point, ChartPoint::Body(_)))
        .map(|point| LayerPoint::new(Layer::Natal, *point))
        .collect();
    let sign_starts: Vec<f64> = (0..12).map(|i| i as f64 * 30.0).collect();
    let rings = wheel_rings();

    // Aspects of moving points to natal points and among themselves.
    let aspects = |events: &mut Vec<Event>,
                   times: &[f64],
                   movers: &[(LayerPoint, Vec<(f64, f64)>)],
                   to_natal: bool,
                   among: bool| {
        let reading = |a: &[(f64, f64)], b: Option<&[(f64, f64)]>, fixed: f64, i: usize| Reading {
            jd: times[i],
            a: a[i].0,
            a_speed: a[i].1,
            b: b.map_or(fixed, |b| b[i].0),
            b_speed: b.map_or(0.0, |b| b[i].1),
        };
        let mut found = Vec::new();
        for (index, (mover, track)) in movers.iter().enumerate() {
            let mut others: Vec<(LayerPoint, Option<&[(f64, f64)]>, f64)> = Vec::new();
            if to_natal {
                for fixed in &natal_points {
                    // A progressed angle is compared with the natal planets only.
                    if matches!(mover.point, ChartPoint::Angle(_)) && matches!(fixed.point, ChartPoint::Angle(_)) {
                        continue;
                    }
                    let Ok((longitude, _)) = sky.at(*fixed, times[0]) else { continue };
                    others.push((*fixed, None, longitude));
                }
            }
            if among && matches!(mover.point, ChartPoint::Body(_)) {
                for (other, other_track) in &movers[index + 1..] {
                    if matches!(other.point, ChartPoint::Body(_)) {
                        others.push((*other, Some(other_track.as_slice()), 0.0));
                    }
                }
            }
            for (other, other_track, fixed) in others {
                found.clear();
                for i in 0..times.len() - 1 {
                    sky.exact_between(
                        *mover,
                        Other::Point(other),
                        &angles,
                        reading(track, other_track, fixed, i),
                        reading(track, other_track, fixed, i + 1),
                        &mut found,
                    );
                }
                for (at, offset) in &found {
                    events.push(Event {
                        utc: utc_of(at.jd),
                        kind: EventKind::Aspect { a: *mover, b: other, kind: aspect_offsets[*offset].1 },
                        position: ZodiacPoint::new(at.a),
                        uncertain: uncertain(&[*mover, other]),
                    });
                }
            }
        }
    };

    // Crossings of fixed longitudes: the starts of signs, decans or bounds.
    let crossings = |times: &[f64], mover: LayerPoint, track: &[(f64, f64)], borders: &[f64]| {
        let mut found = Vec::new();
        for border in borders {
            for i in 0..times.len() - 1 {
                let reading = |i: usize| Reading {
                    jd: times[i],
                    a: track[i].0,
                    a_speed: track[i].1,
                    b: *border,
                    b_speed: 0.0,
                };
                sky.exact_between(mover, Other::Fixed(*border), &[0.0], reading(i), reading(i + 1), &mut found);
            }
        }
        found.into_iter().map(|(at, _)| at).collect::<Vec<Reading>>()
    };
    // The segment a point enters when it crosses a border forwards or backwards.
    let entered = |segments: &[RingSegment], at: &Reading| -> Option<RingSegment> {
        let backwards = at.a_speed < 0.0;
        segments.iter().copied().find(|segment| {
            let edge = if backwards { segment.end } else { segment.start };
            signed(edge - at.b).abs() < 1e-6
        })
    };
    let stations = |events: &mut Vec<Event>, times: &[f64], mover: LayerPoint, track: &[(f64, f64)]| {
        for i in 0..times.len() - 1 {
            if (track[i].1 < 0.0) == (track[i + 1].1 < 0.0) {
                continue;
            }
            let reading = |i: usize| Reading { jd: times[i], a: track[i].0, a_speed: track[i].1, b: 0.0, b_speed: 0.0 };
            let at = sky.bisect(mover, Other::Fixed(0.0), reading(i), reading(i + 1), |r| r.a_speed);
            events.push(Event {
                utc: utc_of(at.jd),
                kind: EventKind::Station {
                    point: mover,
                    turns: if track[i].1 >= 0.0 { Turn::Retrograde } else { Turn::Direct },
                },
                position: ZodiacPoint::new(at.a),
                uncertain: uncertain(&[mover]),
            });
        }
    };

    // The transiting sky.
    let transit_wanted = options.transit_to_natal
        || options.transit_to_transit
        || options.transit_sign_changes
        || options.transit_stations;
    if transit_wanted && !options.transit_bodies.is_empty() {
        let step = if options.transit_bodies.contains(&Body::Moon) { TRANSIT_STEP_WITH_MOON } else { TRANSIT_STEP };
        let times = sample_times(start, end, step);
        let mut movers = Vec::new();
        for body in Body::ALL {
            if options.transit_bodies.contains(&body) {
                let point = LayerPoint::body(Layer::Transit, body);
                movers.push((point, sky.sampled(point, &times)?));
            }
        }
        aspects(&mut events, &times, &movers, options.transit_to_natal, options.transit_to_transit);
        for (mover, track) in &movers {
            if options.transit_sign_changes {
                for at in crossings(&times, *mover, track, &sign_starts) {
                    let sign = Sign::from_longitude(if at.a_speed < 0.0 { at.b - 15.0 } else { at.b + 15.0 });
                    events.push(Event {
                        utc: utc_of(at.jd),
                        kind: EventKind::SignChange { point: *mover, sign, retrograde: at.a_speed < 0.0 },
                        position: ZodiacPoint::new(at.b),
                        uncertain: false,
                    });
                }
            }
            if options.transit_stations && matches!(mover.point, ChartPoint::Body(body) if has_stations(body)) {
                stations(&mut events, &times, *mover, track);
            }
        }
    }

    // The progressed sky, within the life progressions are followed for.
    let progressed_wanted = options.progressed_to_natal
        || options.progressed_to_progressed
        || options.progressed_sign_changes
        || options.progressed_stations
        || options.progressed_moon_houses
        || options.progressed_angle_signs
        || options.lunations_major
        || options.lunations_minor
        || options.progressed_bounds
        || options.progressed_decans;
    if let (true, Some((from, to))) = (progressed_wanted, life_span(natal, start, end)) {
        let times = sample_times(from, to, PROGRESSED_STEP);
        let mut movers = Vec::new();
        for body in Body::ALL {
            if options.progressed_points.contains(&ChartPoint::Body(body)) {
                let point = LayerPoint::body(Layer::Progressed, body);
                movers.push((point, sky.sampled(point, &times)?));
            }
        }
        // Progressed angles need the birth time.
        let mut angle_tracks = Vec::new();
        if known {
            for angle in [AngleId::Ascendant, AngleId::Midheaven] {
                let point = LayerPoint::new(Layer::Progressed, ChartPoint::Angle(angle));
                let track = sky.sampled(point, &times)?;
                if options.progressed_points.contains(&ChartPoint::Angle(angle)) {
                    movers.push((point, track.clone()));
                }
                angle_tracks.push((point, track));
            }
        }
        aspects(&mut events, &times, &movers, options.progressed_to_natal, options.progressed_to_progressed);

        for (mover, track) in &movers {
            let ChartPoint::Body(body) = mover.point else { continue };
            if options.progressed_sign_changes {
                for at in crossings(&times, *mover, track, &sign_starts) {
                    let sign = Sign::from_longitude(if at.a_speed < 0.0 { at.b - 15.0 } else { at.b + 15.0 });
                    events.push(Event {
                        utc: utc_of(at.jd),
                        kind: EventKind::SignChange { point: *mover, sign, retrograde: at.a_speed < 0.0 },
                        position: ZodiacPoint::new(at.b),
                        uncertain: !known,
                    });
                }
            }
            if options.progressed_stations && has_stations(body) {
                stations(&mut events, &times, *mover, track);
            }
            for (wanted, segments, bound) in [
                (options.progressed_bounds, &rings.bounds, true),
                (options.progressed_decans, &rings.chaldean_decans, false),
            ] {
                if !wanted {
                    continue;
                }
                let borders: Vec<f64> = segments.iter().map(|segment| segment.start).collect();
                for at in crossings(&times, *mover, track, &borders) {
                    let Some(segment) = entered(segments, &at) else { continue };
                    let retrograde = at.a_speed < 0.0;
                    events.push(Event {
                        utc: utc_of(at.jd),
                        kind: if bound {
                            EventKind::BoundChange { point: *mover, lord: segment.lord, retrograde }
                        } else {
                            EventKind::DecanChange { point: *mover, lord: segment.lord, retrograde }
                        },
                        position: ZodiacPoint::new(at.b),
                        uncertain: !known,
                    });
                }
            }
        }

        if options.progressed_angle_signs {
            for (mover, track) in &angle_tracks {
                for at in crossings(&times, *mover, track, &sign_starts) {
                    let sign = Sign::from_longitude(if at.a_speed < 0.0 { at.b - 15.0 } else { at.b + 15.0 });
                    events.push(Event {
                        utc: utc_of(at.jd),
                        kind: EventKind::SignChange { point: *mover, sign, retrograde: at.a_speed < 0.0 },
                        position: ZodiacPoint::new(at.b),
                        uncertain: false,
                    });
                }
            }
        }

        // The Moon's own events do not depend on which bodies were chosen.
        let moon = LayerPoint::body(Layer::Progressed, Body::Moon);
        if options.progressed_moon_houses && known {
            let track = sky.sampled(moon, &times)?;
            let rising = natal.houses[0].sign;
            for at in crossings(&times, moon, &track, &sign_starts) {
                let sign = Sign::from_longitude(if at.a_speed < 0.0 { at.b - 15.0 } else { at.b + 15.0 });
                events.push(Event {
                    utc: utc_of(at.jd),
                    kind: EventKind::MoonHouse { house: whole_sign_house(sign, rising), sign },
                    position: ZodiacPoint::new(at.b),
                    uncertain: false,
                });
            }
        }
        if options.lunations_major || options.lunations_minor {
            let sun = LayerPoint::body(Layer::Progressed, Body::Sun);
            let (moon_track, sun_track) = (sky.sampled(moon, &times)?, sky.sampled(sun, &times)?);
            let phases: Vec<u8> = (0..8u8)
                .filter(|phase| if phase % 2 == 0 { options.lunations_major } else { options.lunations_minor })
                .collect();
            let elongations: Vec<f64> = phases.iter().map(|phase| signed(*phase as f64 * 45.0)).collect();
            let mut found = Vec::new();
            for i in 0..times.len() - 1 {
                let reading = |i: usize| Reading {
                    jd: times[i],
                    a: moon_track[i].0,
                    a_speed: moon_track[i].1,
                    b: sun_track[i].0,
                    b_speed: sun_track[i].1,
                };
                sky.exact_between(moon, Other::Point(sun), &elongations, reading(i), reading(i + 1), &mut found);
            }
            for (at, index) in found {
                events.push(Event {
                    utc: utc_of(at.jd),
                    kind: EventKind::Lunation { phase: phases[index] },
                    position: ZodiacPoint::new(at.a),
                    uncertain: !known,
                });
            }
        }
    }

    events.sort_by_key(|event| event.utc);
    let truncated = events.len() > MAX_RESULTS;
    events.truncate(MAX_RESULTS);
    Ok(SearchResult { events, truncated })
}

/// Which aspects to follow through their orb, and when.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseOptions {
    /// The reference moment: positions, orb and applying/separating are given for it.
    pub at: DateTime<Utc>,
    /// The period: every aspect within orb at some time in it is followed.
    /// The same moment twice gives the aspects in orb at that moment.
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub transit_bodies: Vec<Body>,
    pub progressed_points: Vec<ChartPoint>,
    pub natal_points: Vec<ChartPoint>,
    pub aspect_kinds: Vec<AspectKind>,
    pub transit_to_natal: bool,
    pub transit_to_transit: bool,
    pub progressed_to_natal: bool,
    pub progressed_to_progressed: bool,
    /// Orb of transit aspects, in degrees.
    pub transit_orb: f64,
    /// Orb of progression aspects, in degrees.
    pub progressed_orb: f64,
    pub angle_method: AngleMethod,
    pub birth_time_known: bool,
}

/// One unbroken stay within the orb. A missing end lies outside the time
/// the aspect is followed for.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrbPeriod {
    pub enter: Option<DateTime<Utc>>,
    pub leave: Option<DateTime<Utc>>,
}

/// An aspect from the first time it enters the orb to the last time it
/// leaves it, with every exact pass on the way.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AspectCourse {
    pub a: LayerPoint,
    pub b: LayerPoint,
    pub kind: AspectKind,
    /// The two points at the reference moment.
    pub position_a: ZodiacPoint,
    pub position_b: ZodiacPoint,
    /// Distance from exact at the reference moment; `None` when outside the orb then.
    pub orb: Option<f64>,
    /// Applying (or exact) at the reference moment; `None` when outside the orb then.
    pub applying: Option<bool>,
    /// The stays within the orb, in time order: more than one when
    /// retrograde motion takes the aspect out of orb and back.
    pub periods: Vec<OrbPeriod>,
    /// Every exact pass, in time order; empty when it turns back before exactness.
    pub exact: Vec<DateTime<Utc>>,
    /// Days within orb, the periods added up; those without a known end are left out.
    pub days_in_orb: f64,
    pub uncertain: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseResult {
    /// In the order they first enter the orb.
    pub courses: Vec<AspectCourse>,
    pub truncated: bool,
}

/// What one walk through an aspect's course found.
struct Walk {
    exact: Vec<f64>,
    /// (moment, true when entering the orb).
    borders: Vec<(f64, bool)>,
    /// Where the walk forwards in time stopped.
    end: f64,
}

impl Sky<'_> {
    /// Follows an aspect both ways from `from` until the points are far
    /// apart, noting exact passes and crossings of the orb.
    fn walk(&self, a: LayerPoint, b: LayerPoint, offset: f64, orb: f64, from: f64, limits: (f64, f64)) -> Walk {
        let other = Other::Point(b);
        let mut walk = Walk { exact: Vec::new(), borders: Vec::new(), end: from };
        let Ok(start) = self.reading(a, other, from) else { return walk };
        for direction in [-1.0, 1.0] {
            let mut previous = start;
            loop {
                // Short enough that the faster point moves about half a degree.
                let fastest = previous.a_speed.abs().max(previous.b_speed.abs());
                let step = (0.5 / fastest.max(1e-9)).clamp(0.02, 400.0);
                let jd = previous.jd + direction * step;
                if jd < limits.0 || jd > limits.1 {
                    break;
                }
                // Outside the ephemeris range the walk simply ends.
                let Ok(next) = self.reading(a, other, jd) else { break };
                let (earlier, later) = if direction < 0.0 { (next, previous) } else { (previous, next) };
                let points = self.stretch(a, other, earlier, later);
                for pair in points.windows(2) {
                    let (d0, d1) = (pair[0].distance(offset), pair[1].distance(offset));
                    if d0.abs() < 90.0 && d1.abs() < 90.0 && (d0 < 0.0) != (d1 < 0.0) {
                        walk.exact.push(self.bisect(a, other, pair[0], pair[1], |r| r.distance(offset)).jd);
                    }
                    let inside = |r: &Reading| r.distance(offset).abs() - orb;
                    if (inside(&pair[0]) <= 0.0) != (inside(&pair[1]) <= 0.0) {
                        let at = self.bisect(a, other, pair[0], pair[1], |r| {
                            // Zero counts as inside, so the sign test needs it negative.
                            let value = inside(r);
                            if value == 0.0 { -f64::MIN_POSITIVE } else { value }
                        });
                        walk.borders.push((at.jd, inside(&pair[1]) <= 0.0));
                    }
                }
                if direction > 0.0 {
                    walk.end = next.jd;
                }
                if next.distance(offset).abs() > SERIES_LIMIT_DEGREES {
                    break;
                }
                previous = next;
            }
        }
        walk.exact.sort_by(f64::total_cmp);
        walk.exact.dedup_by(|later, earlier| (*later - *earlier).abs() < 1.0 / 86_400.0);
        walk.borders.sort_by(|x, y| x.0.total_cmp(&y.0));
        walk
    }
}

/// The aspects within orb at some time in a period, each followed from its
/// first entry into the orb to its last exit.
pub fn courses(natal: &Chart, options: &CourseOptions) -> Result<CourseResult, EphemerisError> {
    let sky = Sky { natal, method: options.angle_method };
    let known = options.birth_time_known;
    let reference = ephemeris::julian_day(options.at)?;
    let start = ephemeris::julian_day(options.start)?;
    let end = ephemeris::julian_day(options.end)?.max(start);
    let offsets = offsets_of(&options.aspect_kinds);
    let natal_points: Vec<LayerPoint> = options
        .natal_points
        .iter()
        .filter(|point| known || matches!(point, ChartPoint::Body(_)))
        .map(|point| LayerPoint::new(Layer::Natal, *point))
        .collect();
    let mut found: Vec<(f64, AspectCourse)> = Vec::new();

    let mut follow = |times: &[f64],
                      movers: &[(LayerPoint, Vec<(f64, f64)>)],
                      to_natal: bool,
                      among: bool,
                      orb: f64,
                      limits: (f64, f64)| {
        for (index, (mover, track)) in movers.iter().enumerate() {
            let mut others: Vec<(LayerPoint, Option<&[(f64, f64)]>, f64)> = Vec::new();
            if to_natal {
                for fixed in &natal_points {
                    if matches!(mover.point, ChartPoint::Angle(_)) && matches!(fixed.point, ChartPoint::Angle(_)) {
                        continue;
                    }
                    let Ok((longitude, _)) = sky.at(*fixed, times[0]) else { continue };
                    others.push((*fixed, None, longitude));
                }
            }
            if among && matches!(mover.point, ChartPoint::Body(_)) {
                for (other, other_track) in &movers[index + 1..] {
                    if matches!(other.point, ChartPoint::Body(_)) {
                        others.push((*other, Some(other_track.as_slice()), 0.0));
                    }
                }
            }
            for (other, other_track, fixed) in others {
                let distance = |i: usize, offset: f64| {
                    signed(track[i].0 - other_track.map_or(fixed, |t| t[i].0) - offset)
                };
                for (offset, kind) in &offsets {
                    // Courses already followed are skipped up to where their walk ended.
                    let mut done_until = f64::NEG_INFINITY;
                    for i in 0..times.len() {
                        if times[i] <= done_until {
                            continue;
                        }
                        let here = distance(i, *offset);
                        let from = if here.abs() <= orb {
                            times[i]
                        } else if i + 1 < times.len() {
                            let next = distance(i + 1, *offset);
                            // Passed through exactness between two samples.
                            if here.abs() < 90.0 && next.abs() < 90.0 && (here < 0.0) != (next < 0.0) {
                                (times[i] + times[i + 1]) / 2.0
                            } else {
                                continue;
                            }
                        } else {
                            continue;
                        };
                        let walk = sky.walk(*mover, other, *offset, orb, from, limits);
                        done_until = walk.end.max(times[i]);

                        // Pair the crossings into stays within the orb.
                        let mut periods: Vec<OrbPeriod> = Vec::new();
                        let mut open: Option<Option<f64>> = None;
                        for (jd, entering) in &walk.borders {
                            if *entering {
                                open = Some(Some(*jd));
                            } else {
                                // A leave with nothing open: the entry lies before the walk began.
                                let enter = open.take().unwrap_or(None);
                                periods.push(OrbPeriod { enter: enter.map(utc_of), leave: Some(utc_of(*jd)) });
                            }
                        }
                        if let Some(enter) = open {
                            periods.push(OrbPeriod { enter: enter.map(utc_of), leave: None });
                        }
                        if periods.is_empty() {
                            if walk.borders.is_empty() && here.abs() <= orb {
                                periods.push(OrbPeriod { enter: None, leave: None });
                            } else {
                                continue;
                            }
                        }
                        // Only the stays that touch the period count as active in it.
                        let touches = periods.iter().any(|period| {
                            let enter = period.enter.and_then(|utc| ephemeris::julian_day(utc).ok());
                            let leave = period.leave.and_then(|utc| ephemeris::julian_day(utc).ok());
                            enter.is_none_or(|jd| jd <= end) && leave.is_none_or(|jd| jd >= start)
                        });
                        if !touches {
                            continue;
                        }
                        let days_in_orb = periods
                            .iter()
                            .filter_map(|period| Some((period.leave? - period.enter?).num_seconds() as f64 / 86_400.0))
                            .sum();
                        let Ok(now) = sky.reading(*mover, Other::Point(other), reference) else { continue };
                        let off = now.distance(*offset);
                        let within = off.abs() <= orb;
                        let first = periods[0].enter.or(periods[0].leave).map_or(from, |utc| {
                            ephemeris::julian_day(utc).unwrap_or(from)
                        });
                        found.push((
                            first,
                            AspectCourse {
                                a: *mover,
                                b: other,
                                kind: *kind,
                                position_a: ZodiacPoint::new(now.a),
                                position_b: ZodiacPoint::new(now.b),
                                orb: within.then_some(off.abs()),
                                applying: within.then_some(off * now.rate() <= 0.0),
                                periods,
                                exact: walk.exact.iter().map(|jd| utc_of(*jd)).collect(),
                                days_in_orb,
                                uncertain: !known && (depends_on_birth_time(*mover) || depends_on_birth_time(other)),
                            },
                        ));
                    }
                }
            }
        }
    };

    if (options.transit_to_natal || options.transit_to_transit) && !options.transit_bodies.is_empty() {
        let step = if options.transit_bodies.contains(&Body::Moon) { TRANSIT_STEP_WITH_MOON } else { TRANSIT_STEP };
        let times = if end > start { sample_times(start, end, step) } else { vec![start] };
        let mut movers = Vec::new();
        for body in Body::ALL {
            if options.transit_bodies.contains(&body) {
                let point = LayerPoint::body(Layer::Transit, body);
                movers.push((point, sky.sampled(point, &times)?));
            }
        }
        let limits = (start - MAX_SPAN_DAYS, end + MAX_SPAN_DAYS);
        follow(&times, &movers, options.transit_to_natal, options.transit_to_transit, options.transit_orb, limits);
    }

    if options.progressed_to_natal || options.progressed_to_progressed {
        let life = (natal.julian_day, natal.julian_day + MAX_AGE_YEARS * TROPICAL_YEAR_DAYS);
        let span = if end > start {
            life_span(natal, start, end)
        } else {
            (life.0..=life.1).contains(&start).then_some((start, start))
        };
        if let Some((from, to)) = span {
            let times = if to > from { sample_times(from, to, PROGRESSED_STEP) } else { vec![from] };
            let mut movers = Vec::new();
            for body in Body::ALL {
                if options.progressed_points.contains(&ChartPoint::Body(body)) {
                    let point = LayerPoint::body(Layer::Progressed, body);
                    movers.push((point, sky.sampled(point, &times)?));
                }
            }
            if known {
                for angle in [AngleId::Ascendant, AngleId::Midheaven] {
                    if options.progressed_points.contains(&ChartPoint::Angle(angle)) {
                        let point = LayerPoint::new(Layer::Progressed, ChartPoint::Angle(angle));
                        movers.push((point, sky.sampled(point, &times)?));
                    }
                }
            }
            follow(
                &times,
                &movers,
                options.progressed_to_natal,
                options.progressed_to_progressed,
                options.progressed_orb,
                life,
            );
        }
    }

    found.sort_by(|x, y| x.0.total_cmp(&y.0));
    let truncated = found.len() > MAX_RESULTS;
    found.truncate(MAX_RESULTS);
    Ok(CourseResult { courses: found.into_iter().map(|(_, course)| course).collect(), truncated })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chart::compute_chart;
    use crate::progressions::{ProgressedTarget, progressed_passes};
    use crate::solar_return::return_moment;
    use std::path::PathBuf;

    fn natal() -> Chart {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../resources/ephe");
        ephemeris::init(&dir).expect("ephemeris data files are present");
        compute_chart(utc(1962, 2, 4, 13, 20), 55.6759, 12.5655).unwrap()
    }

    fn utc(y: i32, m: u32, d: u32, h: u32, min: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, m, d, h, min, 0).unwrap()
    }

    fn nothing(start: DateTime<Utc>, end: DateTime<Utc>) -> SearchOptions {
        SearchOptions {
            start,
            end,
            transit_bodies: Vec::new(),
            progressed_points: Vec::new(),
            natal_points: Vec::new(),
            aspect_kinds: AspectKind::ALL.to_vec(),
            transit_to_natal: false,
            transit_to_transit: false,
            progressed_to_natal: false,
            progressed_to_progressed: false,
            transit_sign_changes: false,
            transit_stations: false,
            progressed_sign_changes: false,
            progressed_stations: false,
            progressed_moon_houses: false,
            progressed_angle_signs: false,
            lunations_major: false,
            lunations_minor: false,
            progressed_bounds: false,
            progressed_decans: false,
            angle_method: AngleMethod::NaibodRightAscension,
            birth_time_known: true,
        }
    }

    fn close(found: DateTime<Utc>, expected: DateTime<Utc>, minutes: i64) -> bool {
        (found - expected).abs() <= Duration::minutes(minutes)
    }

    /// Independent of Swiss Ephemeris: the published March equinox of 2026,
    /// 20 March 14:46 UTC, is the Sun entering Aries.
    #[test]
    fn the_sun_enters_aries_at_the_published_equinox() {
        let natal = natal();
        let options = SearchOptions {
            transit_bodies: vec![Body::Sun],
            transit_sign_changes: true,
            ..nothing(utc(2026, 3, 1, 0, 0), utc(2026, 4, 1, 0, 0))
        };
        let result = search(&natal, &options).unwrap();
        assert_eq!(result.events.len(), 1);
        let event = result.events[0];
        assert!(close(event.utc, utc(2026, 3, 20, 14, 46), 2), "{}", event.utc);
        assert!(matches!(
            event.kind,
            EventKind::SignChange { sign: Sign::Aries, retrograde: false, point }
                if point == LayerPoint::body(Layer::Transit, Body::Sun)
        ));
    }

    /// Published: new Moon 29 January 2025 12:36 UTC, full Moon 13 January 2025 22:27 UTC.
    #[test]
    fn sun_moon_conjunction_and_opposition_are_the_published_lunations() {
        let natal = natal();
        let options = SearchOptions {
            transit_bodies: vec![Body::Sun, Body::Moon],
            transit_to_transit: true,
            aspect_kinds: vec![AspectKind::Conjunction, AspectKind::Opposition],
            ..nothing(utc(2025, 1, 5, 0, 0), utc(2025, 2, 5, 0, 0))
        };
        let result = search(&natal, &options).unwrap();
        let kinds: Vec<(AspectKind, DateTime<Utc>)> = result
            .events
            .iter()
            .map(|event| match event.kind {
                EventKind::Aspect { kind, .. } => (kind, event.utc),
                other => panic!("unexpected {other:?}"),
            })
            .collect();
        assert_eq!(kinds.len(), 2);
        assert_eq!(kinds[0].0, AspectKind::Opposition);
        assert!(close(kinds[0].1, utc(2025, 1, 13, 22, 27), 3), "{}", kinds[0].1);
        assert_eq!(kinds[1].0, AspectKind::Conjunction);
        assert!(close(kinds[1].1, utc(2025, 1, 29, 12, 36), 3), "{}", kinds[1].1);
    }

    #[test]
    fn the_transiting_sun_meets_the_natal_sun_at_the_solar_return() {
        let natal = natal();
        let options = SearchOptions {
            transit_bodies: vec![Body::Sun],
            natal_points: vec![ChartPoint::Body(Body::Sun)],
            transit_to_natal: true,
            aspect_kinds: vec![AspectKind::Conjunction],
            ..nothing(utc(2026, 1, 1, 0, 0), utc(2027, 1, 1, 0, 0))
        };
        let result = search(&natal, &options).unwrap();
        assert_eq!(result.events.len(), 1);
        let expected = return_moment(natal.utc, 64).unwrap();
        assert!((result.events[0].utc - expected).abs() < Duration::seconds(2));
        assert!(!result.events[0].uncertain);
    }

    /// Mercury turned retrograde on 15 March 2025 and direct on 7 April 2025.
    #[test]
    fn stations_are_found_with_their_direction() {
        let natal = natal();
        let options = SearchOptions {
            transit_bodies: vec![Body::Sun, Body::Mercury],
            transit_stations: true,
            ..nothing(utc(2025, 3, 1, 0, 0), utc(2025, 4, 20, 0, 0))
        };
        let result = search(&natal, &options).unwrap();
        let turns: Vec<(Turn, u32, u32)> = result
            .events
            .iter()
            .map(|event| match event.kind {
                EventKind::Station { turns, .. } => {
                    use chrono::Datelike;
                    (turns, event.utc.month(), event.utc.day())
                }
                other => panic!("unexpected {other:?}"),
            })
            .collect();
        assert_eq!(turns, [(Turn::Retrograde, 3, 15), (Turn::Direct, 4, 7)]);
    }

    #[test]
    fn every_exact_aspect_found_is_exact() {
        let natal = natal();
        let options = SearchOptions {
            transit_bodies: Body::ALL.to_vec(),
            natal_points: vec![ChartPoint::Body(Body::Venus), ChartPoint::Angle(AngleId::Ascendant)],
            transit_to_natal: true,
            transit_to_transit: true,
            ..nothing(utc(2026, 1, 1, 0, 0), utc(2026, 3, 1, 0, 0))
        };
        let result = search(&natal, &options).unwrap();
        assert!(result.events.len() > 100);
        let sky = Sky { natal: &natal, method: AngleMethod::NaibodRightAscension };
        for pair in result.events.windows(2) {
            assert!(pair[0].utc <= pair[1].utc);
        }
        for event in &result.events {
            let EventKind::Aspect { a, b, kind } = event.kind else { panic!() };
            assert_ne!((a.layer, b.layer), (Layer::Transit, Layer::Progressed));
            let jd = ephemeris::julian_day(event.utc).unwrap();
            let apart = signed(sky.at(a, jd).unwrap().0 - sky.at(b, jd).unwrap().0).abs();
            assert!((apart - kind.angle()).abs() < 1e-4, "{event:?}: {apart}");
        }
    }

    #[test]
    fn progressed_aspects_agree_with_the_live_chart_passes() {
        let natal = natal();
        let options = SearchOptions {
            progressed_points: vec![ChartPoint::Body(Body::Moon), ChartPoint::Angle(AngleId::Midheaven)],
            natal_points: vec![ChartPoint::Body(Body::Sun), ChartPoint::Body(Body::Mars)],
            progressed_to_natal: true,
            ..nothing(utc(2020, 1, 1, 0, 0), utc(2026, 1, 1, 0, 0))
        };
        let result = search(&natal, &options).unwrap();
        assert!(result.events.len() >= 6, "{} events", result.events.len());
        for event in &result.events {
            let EventKind::Aspect { a, b, kind } = event.kind else { panic!() };
            assert_eq!((a.layer, b.layer), (Layer::Progressed, Layer::Natal));
            let ChartPoint::Body(target) = b.point else { panic!() };
            let passes = progressed_passes(
                &natal,
                a.point,
                ProgressedTarget::Natal(natal.position(target).point.longitude),
                kind,
                event.utc,
                AngleMethod::NaibodRightAscension,
            )
            .unwrap();
            assert!(
                passes.iter().any(|pass| (*pass - event.utc).abs() < Duration::hours(12)),
                "{event:?} not among {passes:?}"
            );
        }
    }

    #[test]
    fn the_progressed_moon_changes_sign_and_house_together_and_meets_the_sun() {
        let natal = natal();
        let options = SearchOptions {
            progressed_points: vec![ChartPoint::Body(Body::Moon)],
            progressed_sign_changes: true,
            progressed_moon_houses: true,
            lunations_major: true,
            lunations_minor: true,
            progressed_bounds: true,
            progressed_decans: true,
            ..nothing(utc(1990, 1, 1, 0, 0), utc(2020, 1, 1, 0, 0))
        };
        let result = search(&natal, &options).unwrap();
        let count = |test: fn(&EventKind) -> bool| result.events.iter().filter(|e| test(&e.kind)).count();
        // The progressed Moon goes round in about 27.3 years.
        let signs = count(|kind| matches!(kind, EventKind::SignChange { .. }));
        assert!((12..=14).contains(&signs), "{signs} sign changes");
        assert_eq!(count(|kind| matches!(kind, EventKind::MoonHouse { .. })), signs);
        // Three decans and five bounds to a sign; the period ends inside a sign.
        let decans = count(|kind| matches!(kind, EventKind::DecanChange { .. }));
        assert!(decans.abs_diff(signs * 3) <= 2, "{decans} decan changes");
        let bounds = count(|kind| matches!(kind, EventKind::BoundChange { .. }));
        assert!(bounds.abs_diff(signs * 5) <= 4, "{bounds} bound changes");
        // A lunation cycle of the progressed Moon is about 29.5 years.
        let lunations = count(|kind| matches!(kind, EventKind::Lunation { .. }));
        assert!((7..=9).contains(&lunations), "{lunations} lunation phases");
        // House and sign change at the same moment, and the house is the natal one of that sign.
        let rising = natal.houses[0].sign;
        for event in &result.events {
            if let EventKind::MoonHouse { house, sign } = event.kind {
                assert_eq!(house, whole_sign_house(sign, rising));
                assert!(result.events.iter().any(|other| {
                    other.utc == event.utc && matches!(other.kind, EventKind::SignChange { sign: s, .. } if s == sign)
                }));
            }
        }
    }

    #[test]
    fn without_a_birth_time_progressed_events_are_marked_and_angles_left_out() {
        let natal = natal();
        let options = SearchOptions {
            progressed_points: vec![ChartPoint::Body(Body::Sun), ChartPoint::Angle(AngleId::Ascendant)],
            natal_points: vec![ChartPoint::Body(Body::Jupiter), ChartPoint::Angle(AngleId::Midheaven)],
            progressed_to_natal: true,
            progressed_sign_changes: true,
            progressed_moon_houses: true,
            progressed_angle_signs: true,
            birth_time_known: false,
            ..nothing(utc(1962, 3, 1, 0, 0), utc(2030, 1, 1, 0, 0))
        };
        let result = search(&natal, &options).unwrap();
        assert!(!result.events.is_empty());
        for event in &result.events {
            assert!(event.uncertain, "{event:?}");
            match event.kind {
                EventKind::Aspect { a, b, .. } => {
                    assert!(matches!(a.point, ChartPoint::Body(_)) && matches!(b.point, ChartPoint::Body(_)));
                }
                EventKind::SignChange { point, .. } => assert!(matches!(point.point, ChartPoint::Body(_))),
                other => panic!("unexpected {other:?}"),
            }
        }
    }

    fn course_options(at: DateTime<Utc>) -> CourseOptions {
        CourseOptions {
            at,
            start: at,
            end: at,
            transit_bodies: vec![Body::Sun],
            progressed_points: Vec::new(),
            natal_points: vec![ChartPoint::Body(Body::Sun)],
            aspect_kinds: vec![AspectKind::Conjunction],
            transit_to_natal: true,
            transit_to_transit: false,
            progressed_to_natal: false,
            progressed_to_progressed: false,
            transit_orb: 7.0,
            progressed_orb: 1.0,
            angle_method: AngleMethod::NaibodRightAscension,
            birth_time_known: true,
        }
    }

    #[test]
    fn a_course_runs_from_entering_the_orb_over_exact_to_leaving_it() {
        let natal = natal();
        let exact = return_moment(natal.utc, 64).unwrap();
        let at = exact - Duration::days(3);
        let result = courses(&natal, &course_options(at)).unwrap();
        assert_eq!(result.courses.len(), 1);
        let course = &result.courses[0];
        assert_eq!(course.exact.len(), 1);
        assert!((course.exact[0] - exact).abs() < Duration::seconds(2));
        assert_eq!(course.periods.len(), 1);
        let (enter, leave) = (course.periods[0].enter.unwrap(), course.periods[0].leave.unwrap());
        // The Sun moves about a degree a day: seven days either side.
        assert!(close(enter, exact - Duration::days(7), 12 * 60), "{enter}");
        assert!(close(leave, exact + Duration::days(7), 12 * 60), "{leave}");
        assert!((course.days_in_orb - (leave - enter).num_seconds() as f64 / 86_400.0).abs() < 1e-6);
        // Three days before exact: about 3° away and applying.
        assert!((course.orb.unwrap() - 3.0).abs() < 0.2, "{:?}", course.orb);
        assert_eq!(course.applying, Some(true));
        // At the borders the aspect is exactly the orb away.
        let sky = Sky { natal: &natal, method: AngleMethod::NaibodRightAscension };
        for border in [enter, leave] {
            let jd = ephemeris::julian_day(border).unwrap();
            let apart = signed(sky.at(course.a, jd).unwrap().0 - sky.at(course.b, jd).unwrap().0).abs();
            assert!((apart - 7.0).abs() < 1e-4, "{apart}");
        }
    }

    #[test]
    fn outside_the_orb_nothing_is_active() {
        let natal = natal();
        let at = return_moment(natal.utc, 64).unwrap() + Duration::days(20);
        assert!(courses(&natal, &course_options(at)).unwrap().courses.is_empty());
    }

    #[test]
    fn a_period_holds_aspects_that_are_never_exact_in_it_and_each_only_once() {
        let natal = natal();
        let exact = return_moment(natal.utc, 64).unwrap();
        // The period ends two days before exactness: the aspect is active, not exact, within it.
        let options = CourseOptions {
            start: exact - Duration::days(30),
            end: exact - Duration::days(2),
            ..course_options(exact - Duration::days(30))
        };
        let result = courses(&natal, &options).unwrap();
        assert_eq!(result.courses.len(), 1);
        let course = &result.courses[0];
        assert!((course.exact[0] - exact).abs() < Duration::seconds(2));
        // Outside the orb at the reference moment.
        assert_eq!((course.orb, course.applying), (None, None));

        // A whole year of the Moon: one course a month, never the same twice.
        let options = CourseOptions {
            transit_bodies: vec![Body::Moon],
            start: utc(2026, 1, 1, 0, 0),
            end: utc(2027, 1, 1, 0, 0),
            ..course_options(utc(2026, 1, 1, 0, 0))
        };
        let result = courses(&natal, &options).unwrap();
        assert!((13..=14).contains(&result.courses.len()), "{} courses", result.courses.len());
        for pair in result.courses.windows(2) {
            assert!(pair[1].exact[0] - pair[0].exact[0] > Duration::days(26));
        }
    }

    /// Mercury's retrograde of March–April 2025 takes it three times over
    /// the degree it stood at on 20 March.
    #[test]
    fn a_retrograde_course_has_three_exact_passes() {
        let natal = natal();
        let at = utc(2025, 3, 20, 0, 0);
        let jd = ephemeris::julian_day(at).unwrap();
        let (mercury, speed) = body_longitude_and_speed(jd, Body::Mercury).unwrap();
        assert!(speed < 0.0);
        // A chart whose Venus stands where Mercury is that day.
        let mut shifted = natal.clone();
        let venus = shifted.positions.iter_mut().find(|p| p.body == Body::Venus).unwrap();
        venus.point = ZodiacPoint::new(mercury);
        let options = CourseOptions {
            transit_bodies: vec![Body::Mercury],
            natal_points: vec![ChartPoint::Body(Body::Venus)],
            transit_orb: 1.0,
            ..course_options(at)
        };
        let result = courses(&shifted, &options).unwrap();
        assert_eq!(result.courses.len(), 1);
        let course = &result.courses[0];
        assert_eq!(course.exact.len(), 3, "{:?}", course.exact);
        assert!(close(course.exact[1], at, 5), "{}", course.exact[1]);
        // The stays within the orb are in time order and each holds its passes.
        assert!(!course.periods.is_empty());
        for period in &course.periods {
            assert!(period.enter.unwrap() < period.leave.unwrap());
        }
        for exact in &course.exact {
            assert!(course.periods.iter().any(|p| p.enter.unwrap() <= *exact && *exact <= p.leave.unwrap()));
        }
        let total: f64 = course
            .periods
            .iter()
            .map(|p| (p.leave.unwrap() - p.enter.unwrap()).num_seconds() as f64 / 86_400.0)
            .sum();
        assert!((course.days_in_orb - total).abs() < 1e-6);
    }

    #[test]
    fn a_progressed_course_lasts_years() {
        let natal = natal();
        // The progressed Sun moves about a degree a year: with a 1° orb it
        // is within orb of an aspect for about two years.
        let options = CourseOptions {
            transit_bodies: Vec::new(),
            transit_to_natal: false,
            progressed_points: vec![ChartPoint::Body(Body::Sun)],
            natal_points: vec![ChartPoint::Body(Body::Jupiter)],
            aspect_kinds: AspectKind::ALL.to_vec(),
            progressed_to_natal: true,
            start: utc(1962, 3, 1, 0, 0),
            end: utc(2040, 1, 1, 0, 0),
            ..course_options(utc(2026, 1, 1, 0, 0))
        };
        let result = courses(&natal, &options).unwrap();
        assert!(!result.courses.is_empty());
        for course in &result.courses {
            assert_eq!(course.exact.len(), 1);
            assert!((600.0..900.0).contains(&course.days_in_orb), "{} days", course.days_in_orb);
        }
    }
}
