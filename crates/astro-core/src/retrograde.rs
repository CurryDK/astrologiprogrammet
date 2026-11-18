//! Retrograde cycles (decision supplement "Planetcyklusser" of 18 November
//! 2026): for Mercury to Pluto the retrograde periods around a reference
//! moment, each with its stations, its shadow and the sign changes that
//! belong to it.
//!
//! The decision leaves the calculation details open. What is used here:
//!
//! * A station is the moment the speed in longitude changes sign.
//! * The shadow is the stretch of the zodiac between the two station
//!   degrees. The pre-retrograde shadow starts when the planet, moving
//!   direct, last passes the degree of the coming direct station; the
//!   post-retrograde shadow ends when it first passes the degree of the
//!   retrograde station again.
//! * The retrograde sign is the sign the planet stations retrograde in. Its
//!   entry is the last time before that station the planet came into the
//!   sign; its final exit is the first time after the direct station (and
//!   after a re-entry, if the planet left the sign while retrograde) that
//!   the planet leaves it. For the slow planets these can lie years away.
//!
//! The events of a cycle are given in the order they happen; a sign entry
//! and a shadow entry come in no fixed order.

use chrono::{DateTime, Duration, Utc};
use serde::Serialize;

use crate::chart::body_longitude_and_speed;
use crate::ephemeris::{self, EphemerisError};
use crate::normalize_degrees;
use crate::profections::Moment;
use crate::synodic::SYNODIC_BODIES;
use crate::time::ZoneChoice;
use crate::zodiac::{Body, Sign, ZodiacPoint};

/// Longest gap searched between two stations (Mars: about 710 days).
const STATION_SEARCH_DAYS: f64 = 900.0;
/// Longest search for where a shadow starts or ends.
const SHADOW_SEARCH_DAYS: f64 = 500.0;
/// Longest search for a planet coming into or leaving a sign: Pluto can
/// stay in one for more than thirty years.
const SIGN_SEARCH_DAYS: f64 = 45.0 * 365.25;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RetroEventKind {
    /// The planet comes into the sign it will station retrograde in.
    SignEntry,
    /// It passes the degree of the coming direct station: the pre-retrograde shadow starts.
    ShadowEntry,
    StationRetrograde,
    /// A change of sign while retrograde.
    SignChange,
    StationDirect,
    /// Back into the retrograde sign after the direct station.
    SignReentry,
    /// It passes the degree of the retrograde station: the post-retrograde shadow ends.
    ShadowExit,
    /// It leaves the retrograde sign.
    SignExit,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetroEvent {
    pub kind: RetroEventKind,
    pub at: Moment,
    /// Where the planet stands just after the event: at a change of sign, in the new sign.
    pub position: ZodiacPoint,
    /// Days from the reference moment: negative before it, positive after.
    pub days: f64,
    /// The planet's latest event before the reference moment, or its next
    /// one after it: the only two that are shown with a number of days
    /// (decision point 19).
    pub nearest: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CycleStatus {
    /// The latest retrograde period that has ended.
    Completed,
    /// The planet is retrograde at the reference moment.
    Current,
    Next,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetroCycle {
    pub status: CycleStatus,
    /// The sign the planet stations retrograde in.
    pub sign: Sign,
    /// In the order they happen.
    pub events: Vec<RetroEvent>,
}

/// Where in its cycle a planet is at the reference moment (decision point 20).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RetroPhase {
    Direct,
    PreShadow,
    Retrograde,
    PostShadow,
    /// A slow planet can still be in the shadow of its last retrograde
    /// period when it enters the shadow of the next.
    PostAndPreShadow,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanetRetrograde {
    pub body: Body,
    /// Where the planet stands at the reference moment.
    pub position: ZodiacPoint,
    pub phase: RetroPhase,
    pub last_retrograde_station: Option<RetroEvent>,
    pub next_retrograde_station: Option<RetroEvent>,
    pub last_direct_station: Option<RetroEvent>,
    pub next_direct_station: Option<RetroEvent>,
    /// Latest completed, current (when retrograde) and next, in that order.
    pub cycles: Vec<RetroCycle>,
}

fn signed(degrees: f64) -> f64 {
    let d = normalize_degrees(degrees);
    if d > 180.0 { d - 360.0 } else { d }
}

fn longitude(body: Body, jd: f64) -> Option<f64> {
    Some(body_longitude_and_speed(jd, body).ok()?.0)
}

fn direct(body: Body, jd: f64) -> Option<bool> {
    Some(body_longitude_and_speed(jd, body).ok()?.1 >= 0.0)
}

/// Days between samples when looking for a crossing.
fn step_days(body: Body) -> f64 {
    match body {
        Body::Mercury => 1.0,
        Body::Venus => 2.0,
        _ => 4.0,
    }
}

/// The first moment, going from `from` backwards (`direction` −1) or
/// forwards (+1), at which `reached` becomes true; it must be false at
/// `from`. Returned is the later side of the change, to within a second,
/// so a position taken there is the one just after the event. `None` when
/// nothing is found within `limit` days or inside the ephemeris range.
fn crossing(
    from: f64,
    direction: f64,
    step: f64,
    limit: f64,
    reached: impl Fn(f64) -> Option<bool>,
) -> Option<f64> {
    let mut near = from;
    while (near - from).abs() < limit {
        let far = near + direction * step;
        if reached(far)? {
            let (mut inside, mut outside) = (near, far);
            while (outside - inside).abs() > 0.5 / 86_400.0 {
                let middle = (inside + outside) / 2.0;
                if reached(middle)? {
                    outside = middle;
                } else {
                    inside = middle;
                }
            }
            return Some(inside.max(outside));
        }
        near = far;
    }
    None
}

/// The station before or after one already found. The search starts a
/// quarter of a day beyond it, where the planet has clearly turned.
fn station_beyond(body: Body, found: f64, direction: f64) -> Option<f64> {
    station(body, found + direction * 0.25, direction)
}

/// The nearest station before or after `from`.
fn station(body: Body, from: f64, direction: f64) -> Option<f64> {
    let start = direct(body, from)?;
    crossing(from, direction, 1.0, STATION_SEARCH_DAYS, |jd| Some(direct(body, jd)? != start))
}

/// The events of the retrograde period between two stations, in order.
fn cycle_events(body: Body, retrograde: f64, direct_station: f64) -> Option<Vec<(RetroEventKind, f64)>> {
    use RetroEventKind as K;
    let step = step_days(body);
    let retrograde_degree = longitude(body, retrograde)?;
    let direct_degree = longitude(body, direct_station)?;
    let sign = Sign::from_longitude(retrograde_degree);
    let in_sign = |jd: f64| Some(Sign::from_longitude(longitude(body, jd)?) == sign);
    let mut events = vec![(K::StationRetrograde, retrograde), (K::StationDirect, direct_station)];

    if let Some(jd) = crossing(retrograde, -1.0, step, SHADOW_SEARCH_DAYS, |jd| {
        Some(signed(longitude(body, jd)? - direct_degree) <= 0.0)
    }) {
        events.push((K::ShadowEntry, jd));
    }
    if let Some(jd) = crossing(direct_station, 1.0, step, SHADOW_SEARCH_DAYS, |jd| {
        Some(signed(longitude(body, jd)? - retrograde_degree) >= 0.0)
    }) {
        events.push((K::ShadowExit, jd));
    }
    if let Some(jd) = crossing(retrograde, -1.0, step, SIGN_SEARCH_DAYS, |jd| Some(!in_sign(jd)?)) {
        events.push((K::SignEntry, jd));
    }

    // Changes of sign while retrograde: usually none, sometimes one.
    let mut from = retrograde;
    while from < direct_station {
        let here = Sign::from_longitude(longitude(body, from)?);
        let found = crossing(from, 1.0, step.min(1.0), direct_station - from, |jd| {
            Some(Sign::from_longitude(longitude(body, jd.min(direct_station))?) != here)
        });
        match found {
            Some(jd) if jd < direct_station => {
                events.push((K::SignChange, jd));
                from = jd;
            }
            _ => break,
        }
    }

    // Back into the retrograde sign, if the planet left it, and out of it again.
    let mut back = direct_station;
    if !in_sign(direct_station)? {
        match crossing(direct_station, 1.0, step, SIGN_SEARCH_DAYS, in_sign) {
            Some(jd) => {
                events.push((K::SignReentry, jd));
                back = jd;
            }
            None => back = f64::NAN,
        }
    }
    if back.is_finite() {
        if let Some(jd) = crossing(back, 1.0, step, SIGN_SEARCH_DAYS, |jd| Some(!in_sign(jd)?)) {
            events.push((K::SignExit, jd));
        }
    }

    events.sort_by(|a, b| a.1.total_cmp(&b.1));
    Some(events)
}

/// The retrograde cycles of Mercury to Pluto around a reference moment,
/// with clock readings in the given time zone.
pub fn retrograde_cycles(at: DateTime<Utc>, zone: &ZoneChoice) -> Result<Vec<PlanetRetrograde>, EphemerisError> {
    use RetroEventKind as K;
    let jd0 = ephemeris::julian_day(at)?;
    let mut planets = Vec::with_capacity(SYNODIC_BODIES.len());
    for body in SYNODIC_BODIES {
        let (now, speed) = body_longitude_and_speed(jd0, body)?;
        let retrograde = speed < 0.0;

        // The stations on each side of the reference moment, as pairs of a
        // retrograde station and the direct station that ends the period.
        let before = station(body, jd0, -1.0);
        let after = station(body, jd0, 1.0);
        let pair_before = |direct_station: Option<f64>| {
            let direct_station = direct_station?;
            Some((station_beyond(body, direct_station, -1.0)?, direct_station))
        };
        let pair_after = |retrograde_station: Option<f64>| {
            let retrograde_station = retrograde_station?;
            Some((retrograde_station, station_beyond(body, retrograde_station, 1.0)?))
        };
        let spans: [(CycleStatus, Option<(f64, f64)>); 3] = if retrograde {
            [
                (CycleStatus::Completed, pair_before(before.and_then(|jd| station_beyond(body, jd, -1.0)))),
                (CycleStatus::Current, before.zip(after)),
                (CycleStatus::Next, pair_after(after.and_then(|jd| station_beyond(body, jd, 1.0)))),
            ]
        } else {
            [
                (CycleStatus::Completed, pair_before(before)),
                (CycleStatus::Current, None),
                (CycleStatus::Next, pair_after(after)),
            ]
        };

        let mut found: Vec<(CycleStatus, Vec<(RetroEventKind, f64)>)> = Vec::new();
        for (status, span) in spans {
            let Some((start, end)) = span else { continue };
            if let Some(events) = cycle_events(body, start, end) {
                found.push((status, events));
            }
        }

        // Only the nearest event on each side of the reference moment is
        // shown with its distance in days.
        let all = || found.iter().flat_map(|(_, events)| events.iter().map(|(_, jd)| *jd));
        let latest = all().filter(|jd| *jd <= jd0).fold(f64::NEG_INFINITY, f64::max);
        let next = all().filter(|jd| *jd > jd0).fold(f64::INFINITY, f64::min);

        let mut cycles = Vec::with_capacity(found.len());
        for (status, events) in &found {
            let mut timed = Vec::with_capacity(events.len());
            for (kind, jd) in events {
                let days = jd - jd0;
                let utc = at + Duration::microseconds((days * 86_400e6).round() as i64);
                let Ok(moment) = Moment::in_zone(utc, zone) else { continue };
                let Some(position) = longitude(body, *jd) else { continue };
                timed.push(RetroEvent {
                    kind: *kind,
                    at: moment,
                    position: ZodiacPoint::new(position),
                    days,
                    nearest: *jd == latest || *jd == next,
                });
            }
            let Some(turn) = timed.iter().find(|e| e.kind == K::StationRetrograde) else { continue };
            cycles.push(RetroCycle { status: *status, sign: turn.position.sign, events: timed });
        }

        let event = |status: CycleStatus, kind: RetroEventKind| -> Option<RetroEvent> {
            let cycle = cycles.iter().find(|c| c.status == status)?;
            cycle.events.iter().find(|e| e.kind == kind).copied()
        };
        let in_post_shadow = !retrograde
            && event(CycleStatus::Completed, K::ShadowExit).is_some_and(|e| e.days > 0.0);
        let in_pre_shadow = !retrograde
            && event(CycleStatus::Next, K::ShadowEntry).is_some_and(|e| e.days <= 0.0);
        let phase = match (retrograde, in_post_shadow, in_pre_shadow) {
            (true, _, _) => RetroPhase::Retrograde,
            (_, true, true) => RetroPhase::PostAndPreShadow,
            (_, true, false) => RetroPhase::PostShadow,
            (_, false, true) => RetroPhase::PreShadow,
            _ => RetroPhase::Direct,
        };
        let running = if retrograde { CycleStatus::Current } else { CycleStatus::Completed };
        let coming = if retrograde { CycleStatus::Current } else { CycleStatus::Next };
        planets.push(PlanetRetrograde {
            body,
            position: ZodiacPoint::new(now),
            phase,
            last_retrograde_station: event(running, K::StationRetrograde),
            next_retrograde_station: event(CycleStatus::Next, K::StationRetrograde),
            last_direct_station: event(CycleStatus::Completed, K::StationDirect),
            next_direct_station: event(coming, K::StationDirect),
            cycles,
        });
    }
    Ok(planets)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use std::path::PathBuf;
    use CycleStatus as S;
    use RetroEventKind as K;

    fn init() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../resources/ephe");
        ephemeris::init(&dir).expect("ephemeris data files are present");
    }

    fn utc(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(year, month, day, hour, minute, 0).unwrap()
    }

    fn planet(at: DateTime<Utc>, body: Body) -> PlanetRetrograde {
        let zone = ZoneChoice::Named("UTC".to_string());
        retrograde_cycles(at, &zone).unwrap().into_iter().find(|p| p.body == body).unwrap()
    }

    fn cycle(planet: &PlanetRetrograde, status: CycleStatus) -> &RetroCycle {
        planet.cycles.iter().find(|c| c.status == status).unwrap()
    }

    fn event(cycle: &RetroCycle, kind: RetroEventKind) -> RetroEvent {
        *cycle.events.iter().find(|e| e.kind == kind).unwrap()
    }

    fn close(event: RetroEvent, expected: DateTime<Utc>, hours: i64) {
        assert!(
            (event.at.utc - expected).abs() < Duration::hours(hours),
            "{:?} at {}, expected {expected}",
            event.kind,
            event.at.utc
        );
    }

    /// Published for Mercury's retrograde period of spring 2025: retrograde
    /// station 15 March 06:46 UT at 9°35′ Aries, direct station 7 April
    /// 11:08 UT at 26°49′ Pisces; into Aries 3 March, back into Pisces
    /// 30 March, into Aries again 16 April, into Taurus 10 May; shadow from
    /// 28 February to 26 April.
    #[test]
    fn mercury_in_spring_2025_matches_the_published_dates() {
        init();
        let mercury = planet(utc(2025, 3, 20, 12, 0), Body::Mercury);
        assert_eq!(mercury.phase, RetroPhase::Retrograde);
        let current = cycle(&mercury, S::Current);
        assert_eq!(current.sign, Sign::Aries);
        let kinds: Vec<_> = current.events.iter().map(|e| e.kind).collect();
        assert_eq!(
            kinds,
            [
                K::ShadowEntry,
                K::SignEntry,
                K::StationRetrograde,
                K::SignChange,
                K::StationDirect,
                K::SignReentry,
                K::ShadowExit,
                K::SignExit
            ]
        );

        let turn = event(current, K::StationRetrograde);
        close(turn, utc(2025, 3, 15, 6, 46), 1);
        assert_eq!((turn.position.sign, turn.position.degree, turn.position.minute), (Sign::Aries, 9, 35));
        let back = event(current, K::StationDirect);
        close(back, utc(2025, 4, 7, 11, 8), 1);
        assert_eq!((back.position.sign, back.position.degree, back.position.minute), (Sign::Pisces, 26, 49));

        close(event(current, K::ShadowEntry), utc(2025, 3, 1, 0, 0), 36);
        close(event(current, K::SignEntry), utc(2025, 3, 3, 9, 0), 24);
        close(event(current, K::SignChange), utc(2025, 3, 30, 2, 0), 24);
        close(event(current, K::SignReentry), utc(2025, 4, 16, 6, 0), 24);
        close(event(current, K::ShadowExit), utc(2025, 4, 26, 12, 0), 36);
        close(event(current, K::SignExit), utc(2025, 5, 10, 12, 0), 24);

        // A change of sign is shown in the sign the planet comes into.
        assert_eq!(event(current, K::SignEntry).position.sign, Sign::Aries);
        assert_eq!(event(current, K::SignChange).position.sign, Sign::Pisces);
        assert_eq!(event(current, K::SignReentry).position.sign, Sign::Aries);
        assert_eq!(event(current, K::SignExit).position.sign, Sign::Taurus);

        // The four stations around the reference moment.
        assert_eq!(mercury.last_retrograde_station, Some(turn));
        assert_eq!(mercury.next_direct_station, Some(back));
        assert_eq!(
            mercury.last_direct_station,
            Some(event(cycle(&mercury, S::Completed), K::StationDirect))
        );
        assert_eq!(
            mercury.next_retrograde_station,
            Some(event(cycle(&mercury, S::Next), K::StationRetrograde))
        );
        // The next one: 18 July 2025 in Leo.
        close(mercury.next_retrograde_station.unwrap(), utc(2025, 7, 18, 4, 45), 3);
    }

    #[test]
    fn the_phase_follows_the_shadow_and_the_stations() {
        init();
        assert_eq!(planet(utc(2025, 2, 20, 0, 0), Body::Mercury).phase, RetroPhase::Direct);
        assert_eq!(planet(utc(2025, 3, 10, 0, 0), Body::Mercury).phase, RetroPhase::PreShadow);
        assert_eq!(planet(utc(2025, 3, 20, 0, 0), Body::Mercury).phase, RetroPhase::Retrograde);
        assert_eq!(planet(utc(2025, 4, 15, 0, 0), Body::Mercury).phase, RetroPhase::PostShadow);
        assert_eq!(planet(utc(2025, 6, 1, 0, 0), Body::Mercury).phase, RetroPhase::Direct);
        // Direct: no current period, and the completed one is the spring one.
        let direct = planet(utc(2025, 6, 1, 0, 0), Body::Mercury);
        assert!(direct.cycles.iter().all(|c| c.status != S::Current));
        close(direct.last_retrograde_station.unwrap(), utc(2025, 3, 15, 6, 46), 1);
        close(direct.last_direct_station.unwrap(), utc(2025, 4, 7, 11, 8), 1);
    }

    /// Saturn in 2025: into Aries 25 May, retrograde station 13 July in
    /// Aries, back into Pisces 1 September, direct station 28 November in
    /// Pisces, into Aries again 14 February 2026, and out of Aries in
    /// April 2028, after two later retrograde periods inside the sign.
    #[test]
    fn saturn_leaves_and_returns_to_its_retrograde_sign() {
        init();
        let saturn = planet(utc(2025, 10, 1, 0, 0), Body::Saturn);
        let current = cycle(&saturn, S::Current);
        assert_eq!(current.sign, Sign::Aries);
        let kinds: Vec<_> = current.events.iter().map(|e| e.kind).collect();
        assert_eq!(
            kinds,
            [
                K::ShadowEntry,
                K::SignEntry,
                K::StationRetrograde,
                K::SignChange,
                K::StationDirect,
                K::SignReentry,
                K::ShadowExit,
                K::SignExit
            ]
        );
        close(event(current, K::SignEntry), utc(2025, 5, 25, 3, 0), 24);
        close(event(current, K::StationRetrograde), utc(2025, 7, 13, 4, 0), 24);
        close(event(current, K::SignChange), utc(2025, 9, 1, 8, 0), 24);
        close(event(current, K::StationDirect), utc(2025, 11, 28, 4, 0), 24);
        close(event(current, K::SignReentry), utc(2026, 2, 14, 0, 0), 24);
        let exit = event(current, K::SignExit);
        assert_eq!(exit.position.sign, Sign::Taurus);
        close(exit, utc(2028, 4, 13, 0, 0), 48);
    }

    #[test]
    fn every_cycle_is_consistent() {
        init();
        let at = utc(2026, 11, 18, 12, 0);
        let zone = ZoneChoice::Named("UTC".to_string());
        let planets = retrograde_cycles(at, &zone).unwrap();
        assert_eq!(planets.len(), 8);
        for p in &planets {
            let retrograde = p.phase == RetroPhase::Retrograde;
            let statuses: Vec<_> = p.cycles.iter().map(|c| c.status).collect();
            if retrograde {
                assert_eq!(statuses, [S::Completed, S::Current, S::Next], "{:?}", p.body);
            } else {
                assert_eq!(statuses, [S::Completed, S::Next], "{:?}", p.body);
            }
            for c in &p.cycles {
                assert!(c.events.windows(2).all(|w| w[0].at.utc <= w[1].at.utc), "{:?}", p.body);
                let turn = event(c, K::StationRetrograde);
                let back = event(c, K::StationDirect);
                assert!(turn.at.utc < back.at.utc);
                assert_eq!(turn.position.sign, c.sign);
                // The shadow runs between the two station degrees.
                let enter = event(c, K::ShadowEntry);
                let leave = event(c, K::ShadowExit);
                assert!(signed(enter.position.longitude - back.position.longitude).abs() < 1e-4);
                assert!(signed(leave.position.longitude - turn.position.longitude).abs() < 1e-4);
                assert!(enter.at.utc < turn.at.utc && back.at.utc < leave.at.utc);
                // The retrograde sign is entered before the station and left after the period.
                let entry = event(c, K::SignEntry);
                assert_eq!(entry.position.sign, c.sign);
                assert!(entry.at.utc < turn.at.utc);
                let exit = event(c, K::SignExit);
                assert_ne!(exit.position.sign, c.sign);
                assert!(exit.at.utc > back.at.utc);
                // A re-entry is there exactly when the direct station is in another sign.
                let reentry = c.events.iter().any(|e| e.kind == K::SignReentry);
                assert_eq!(reentry, back.position.sign != c.sign, "{:?}", p.body);
                match c.status {
                    S::Completed => assert!(back.days < 0.0),
                    S::Current => assert!(turn.days < 0.0 && back.days > 0.0),
                    S::Next => assert!(turn.days > 0.0),
                }
            }
            // One event on each side of the reference moment carries the days.
            let events: Vec<_> = p.cycles.iter().flat_map(|c| &c.events).collect();
            let latest = events.iter().filter(|e| e.days <= 0.0).map(|e| e.days).fold(f64::NEG_INFINITY, f64::max);
            let next = events.iter().filter(|e| e.days > 0.0).map(|e| e.days).fold(f64::INFINITY, f64::min);
            for e in &events {
                assert_eq!(e.nearest, e.days == latest || e.days == next, "{:?} {e:?}", p.body);
            }
            assert!(events.iter().any(|e| e.nearest && e.days <= 0.0));
            assert!(events.iter().any(|e| e.nearest && e.days > 0.0));
        }
    }

    /// Neptune's retrograde arc is longer than its yearly advance, so the
    /// shadow of one period runs into the shadow of the next.
    #[test]
    fn a_slow_planet_can_be_in_two_shadows_at_once() {
        init();
        let neptune = planet(utc(2026, 3, 17, 0, 0), Body::Neptune);
        assert_eq!(neptune.phase, RetroPhase::PostAndPreShadow);
    }
}
