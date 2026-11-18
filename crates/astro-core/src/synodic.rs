//! Synodic cycles (specification §10): for each planet the latest and next
//! conjunction with the Sun, and for the planets that can stand opposite
//! the Sun the latest and next opposition. Mercury and Venus never stand
//! opposite the Sun; their conjunctions are superior (direct, beyond the
//! Sun) or inferior (retrograde, between the Earth and the Sun).

use chrono::{DateTime, Duration, Utc};
use serde::Serialize;

use crate::chart::body_longitude_and_speed;
use crate::ephemeris::{self, EphemerisError};
use crate::normalize_degrees;
use crate::zodiac::{Body, ZodiacPoint};

/// The planets the overview covers, in display order.
pub const SYNODIC_BODIES: [Body; 8] = [
    Body::Mercury,
    Body::Venus,
    Body::Mars,
    Body::Jupiter,
    Body::Saturn,
    Body::Uranus,
    Body::Neptune,
    Body::Pluto,
];

/// Never search further than this from the reference moment; the longest
/// synodic cycle, that of Mars, is about 780 days.
const MAX_SPAN_DAYS: f64 = 900.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SynodicKind {
    /// Conjunction of a planet outside the Earth's orbit.
    Conjunction,
    /// Mercury or Venus beyond the Sun, moving direct.
    SuperiorConjunction,
    /// Mercury or Venus between the Earth and the Sun, moving retrograde.
    InferiorConjunction,
    Opposition,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SynodicEvent {
    pub kind: SynodicKind,
    pub utc: DateTime<Utc>,
    /// Where the planet stands at that moment.
    pub position: ZodiacPoint,
    /// Days from the reference moment: negative before it, positive after.
    pub days: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SynodicCycle {
    pub body: Body,
    /// Where the planet stands at the reference moment, and its direction then.
    pub position: ZodiacPoint,
    pub retrograde: bool,
    pub last_conjunction: Option<SynodicEvent>,
    pub next_conjunction: Option<SynodicEvent>,
    /// `None` for Mercury and Venus, which never stand opposite the Sun.
    pub last_opposition: Option<SynodicEvent>,
    pub next_opposition: Option<SynodicEvent>,
}

fn signed(degrees: f64) -> f64 {
    let d = normalize_degrees(degrees);
    if d > 180.0 { d - 360.0 } else { d }
}

/// Days between samples: short enough that the planet's distance from the
/// Sun changes by a few degrees at most.
fn step_days(body: Body) -> f64 {
    match body {
        Body::Mercury => 1.0,
        Body::Venus => 2.0,
        _ => 4.0,
    }
}

/// The nearest moment before (`direction` -1) or after (+1) `jd0` at which
/// the planet is `offset` degrees from the Sun in longitude.
fn find(body: Body, offset: f64, jd0: f64, direction: f64) -> Option<(f64, f64, f64)> {
    let distance = |jd: f64| -> Result<f64, EphemerisError> {
        let (planet, _) = body_longitude_and_speed(jd, body)?;
        let (sun, _) = body_longitude_and_speed(jd, Body::Sun)?;
        Ok(signed(planet - sun - offset))
    };
    let step = step_days(body);
    let (mut jd, mut value) = (jd0, distance(jd0).ok()?);
    while (jd - jd0).abs() < MAX_SPAN_DAYS {
        let next_jd = jd + direction * step;
        // Outside the ephemeris range there is nothing to find.
        let next = distance(next_jd).ok()?;
        // A sign change near ±180° is the wrap-around, not a meeting.
        if value.abs() < 90.0 && next.abs() < 90.0 && (value < 0.0) != (next < 0.0) {
            let (mut low, mut high, low_negative) = (jd, next_jd, value < 0.0);
            for _ in 0..48 {
                let middle = (low + high) / 2.0;
                if (distance(middle).ok()? < 0.0) == low_negative {
                    low = middle;
                } else {
                    high = middle;
                }
            }
            let (longitude, speed) = body_longitude_and_speed(high, body).ok()?;
            return Some((high, longitude, speed));
        }
        (jd, value) = (next_jd, next);
    }
    None
}

/// The synodic cycle of each planet around a reference moment.
pub fn synodic_cycles(at: DateTime<Utc>) -> Result<Vec<SynodicCycle>, EphemerisError> {
    let jd0 = ephemeris::julian_day(at)?;
    let mut cycles = Vec::with_capacity(SYNODIC_BODIES.len());
    for body in SYNODIC_BODIES {
        let inner = matches!(body, Body::Mercury | Body::Venus);
        let event = |offset: f64, direction: f64| -> Option<SynodicEvent> {
            let (jd, longitude, speed) = find(body, offset, jd0, direction)?;
            let kind = match (offset == 0.0, inner) {
                (false, _) => SynodicKind::Opposition,
                (true, false) => SynodicKind::Conjunction,
                (true, true) if speed < 0.0 => SynodicKind::InferiorConjunction,
                (true, true) => SynodicKind::SuperiorConjunction,
            };
            let days = jd - jd0;
            Some(SynodicEvent {
                kind,
                utc: at + Duration::microseconds((days * 86_400e6).round() as i64),
                position: ZodiacPoint::new(longitude),
                days,
            })
        };
        let (longitude, speed) = body_longitude_and_speed(jd0, body)?;
        cycles.push(SynodicCycle {
            body,
            position: ZodiacPoint::new(longitude),
            retrograde: speed < 0.0,
            last_conjunction: event(0.0, -1.0),
            next_conjunction: event(0.0, 1.0),
            last_opposition: if inner { None } else { event(180.0, -1.0) },
            next_opposition: if inner { None } else { event(180.0, 1.0) },
        });
    }
    Ok(cycles)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use std::path::PathBuf;

    fn init() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../resources/ephe");
        ephemeris::init(&dir).expect("ephemeris data files are present");
    }

    fn cycle(cycles: &[SynodicCycle], body: Body) -> SynodicCycle {
        *cycles.iter().find(|c| c.body == body).unwrap()
    }

    fn sun_at(utc: DateTime<Utc>) -> f64 {
        body_longitude_and_speed(ephemeris::julian_day(utc).unwrap(), Body::Sun).unwrap().0
    }

    #[test]
    fn every_meeting_is_exact_and_on_the_right_side_of_the_reference() {
        init();
        let at = Utc.with_ymd_and_hms(2026, 11, 18, 12, 0, 0).unwrap();
        let cycles = synodic_cycles(at).unwrap();
        assert_eq!(cycles.len(), 8);
        for c in &cycles {
            let inner = matches!(c.body, Body::Mercury | Body::Venus);
            assert_eq!(c.last_opposition.is_none(), inner);
            assert_eq!(c.next_opposition.is_none(), inner);
            let events = [
                (c.last_conjunction, 0.0, true),
                (c.next_conjunction, 0.0, false),
                (c.last_opposition, 180.0, true),
                (c.next_opposition, 180.0, false),
            ];
            for (event, offset, before) in events {
                let Some(event) = event else { continue };
                assert_eq!(event.days < 0.0, before, "{:?} {event:?}", c.body);
                assert_eq!(event.utc < at, before);
                let apart = signed(event.position.longitude - sun_at(event.utc) - offset);
                assert!(apart.abs() < 1e-4, "{:?}: {apart}° from exact", c.body);
            }
            // Between two conjunctions of an outer planet lies one opposition.
            if !inner {
                let (last, next) = (c.last_conjunction.unwrap(), c.next_conjunction.unwrap());
                let between = [c.last_opposition, c.next_opposition]
                    .iter()
                    .flatten()
                    .filter(|o| last.utc < o.utc && o.utc < next.utc)
                    .count();
                assert_eq!(between, 1, "{:?}", c.body);
            }
        }
    }

    /// Published: Mars stood opposite the Sun on 16 January 2025, and
    /// Venus passed between the Earth and the Sun (inferior conjunction)
    /// on 23 March 2025.
    #[test]
    fn known_meetings_are_found() {
        init();
        let cycles = synodic_cycles(Utc.with_ymd_and_hms(2025, 2, 10, 0, 0, 0).unwrap()).unwrap();
        let mars = cycle(&cycles, Body::Mars).last_opposition.unwrap();
        let expected = Utc.with_ymd_and_hms(2025, 1, 16, 2, 30, 0).unwrap();
        assert!((mars.utc - expected).abs() < Duration::hours(6), "{}", mars.utc);
        assert_eq!(mars.kind, SynodicKind::Opposition);

        let venus = cycle(&cycles, Body::Venus).next_conjunction.unwrap();
        let expected = Utc.with_ymd_and_hms(2025, 3, 23, 1, 0, 0).unwrap();
        assert!((venus.utc - expected).abs() < Duration::hours(6), "{}", venus.utc);
        assert_eq!(venus.kind, SynodicKind::InferiorConjunction);
    }

    #[test]
    fn mercury_and_venus_alternate_between_superior_and_inferior() {
        init();
        let cycles = synodic_cycles(Utc.with_ymd_and_hms(2026, 6, 1, 0, 0, 0).unwrap()).unwrap();
        for body in [Body::Mercury, Body::Venus] {
            let c = cycle(&cycles, body);
            let (last, next) = (c.last_conjunction.unwrap(), c.next_conjunction.unwrap());
            assert_ne!(last.kind, next.kind, "{body:?}");
            for event in [last, next] {
                assert!(matches!(
                    event.kind,
                    SynodicKind::SuperiorConjunction | SynodicKind::InferiorConjunction
                ));
            }
        }
        // The outer planets have plain conjunctions.
        assert_eq!(cycle(&cycles, Body::Jupiter).next_conjunction.unwrap().kind, SynodicKind::Conjunction);
    }
}
