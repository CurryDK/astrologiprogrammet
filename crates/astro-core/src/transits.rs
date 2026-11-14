//! Transits (specification §8): aspects from the moving sky to a fixed natal
//! chart, and the exact moments of a transit aspect, including every pass
//! when retrograde motion makes the aspect exact more than once.

use chrono::{DateTime, Duration, Utc};
use serde::Serialize;

use crate::aspects::{AspectKind, AspectPoint, ChartPoint, Orbs, aspect_between};
use crate::chart::{Chart, body_longitude_and_speed};
use crate::ephemeris::{self, EphemerisError};
use crate::normalize_degrees;
use crate::zodiac::Body;

/// An aspect from a transiting body to a point of the natal chart.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitAspect {
    pub transit: Body,
    pub natal: ChartPoint,
    pub kind: AspectKind,
    /// Absolute distance from exactness in degrees.
    pub orb: f64,
    /// True when the transiting body's motion is shrinking the orb.
    pub applying: bool,
    pub out_of_sign: bool,
}

/// Every aspect within orb from a transiting body to a natal body or angle,
/// grouped by transiting body in display order. The natal points stand
/// still; only the transiting body's motion decides applying/separating.
pub fn transit_aspects(transit: &Chart, natal: &Chart, orbs: &Orbs) -> Vec<TransitAspect> {
    let natal_points: Vec<AspectPoint> = natal
        .aspect_points()
        .into_iter()
        .map(|point| AspectPoint { speed: 0.0, ..point })
        .collect();
    let mut found = Vec::new();
    for position in &transit.positions {
        let moving = AspectPoint {
            id: ChartPoint::Body(position.body),
            longitude: position.point.longitude,
            speed: position.speed,
        };
        for fixed in &natal_points {
            if let Some(aspect) = aspect_between(&moving, fixed, orbs) {
                found.push(TransitAspect {
                    transit: position.body,
                    natal: fixed.id,
                    kind: aspect.kind,
                    orb: aspect.orb,
                    applying: aspect.applying,
                    out_of_sign: aspect.out_of_sign,
                });
            }
        }
    }
    found
}

/// What a transiting body makes its aspect to.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PassTarget {
    /// A fixed longitude, such as a natal planet or angle.
    Fixed(f64),
    /// Another transiting body.
    Body(Body),
}

/// A series of passes ends once the bodies are this far from exactness.
/// No planet's retrograde arc is longer, so a body that far away is not
/// coming back without going all the way round.
const SERIES_LIMIT_DEGREES: f64 = 25.0;
/// Never search further than this from the starting moment.
const MAX_SPAN_DAYS: f64 = 15.0 * 365.25;
/// At most this many passes are returned, those nearest the starting moment.
pub const MAX_PASSES: usize = 9;

#[derive(Clone, Copy)]
struct Sample {
    jd: f64,
    /// Signed distance from exactness, in (-180, 180].
    distance: f64,
    /// Rate of change of the distance, degrees per day.
    rate: f64,
    /// Speed of the faster of the two bodies, degrees per day.
    fastest: f64,
}

fn signed(degrees: f64) -> f64 {
    let d = normalize_degrees(degrees);
    if d > 180.0 { d - 360.0 } else { d }
}

/// The moments a transit aspect is exact, around a given moment.
///
/// The aspect is the one in force at `around`: for a sextile, square or
/// trine, the side (ahead of or behind the target) the body is on then.
/// Returned in time order. Several moments mean the body passes the exact
/// point more than once because of retrograde motion; an empty list means it
/// turns back before reaching exactness. Two transiting bodies that never
/// move far apart (such as the Sun and Mercury) meet again and again; then
/// the [`MAX_PASSES`] moments nearest `around` are returned.
pub fn exact_passes(
    body: Body,
    target: PassTarget,
    kind: AspectKind,
    around: DateTime<Utc>,
) -> Result<Vec<DateTime<Utc>>, EphemerisError> {
    let jd0 = ephemeris::julian_day(around)?;
    let positions = |jd: f64| -> Result<(f64, f64, f64, f64), EphemerisError> {
        let (a, a_speed) = body_longitude_and_speed(jd, body)?;
        let (b, b_speed) = match target {
            PassTarget::Fixed(longitude) => (longitude, 0.0),
            PassTarget::Body(other) => body_longitude_and_speed(jd, other)?,
        };
        Ok((a, a_speed, b, b_speed))
    };

    let (a, _, b, _) = positions(jd0)?;
    let offset = if signed(a - b) >= 0.0 { kind.angle() } else { -kind.angle() };
    let sample = |jd: f64| -> Result<Sample, EphemerisError> {
        let (a, a_speed, b, b_speed) = positions(jd)?;
        Ok(Sample {
            jd,
            distance: signed(a - b - offset),
            rate: a_speed - b_speed,
            fastest: a_speed.abs().max(b_speed.abs()),
        })
    };

    // Halve an interval until it pins down where `value` changes sign.
    let bisect = |mut low: Sample, mut high: Sample, value: fn(&Sample) -> f64| {
        for _ in 0..60 {
            let Ok(middle) = sample((low.jd + high.jd) / 2.0) else { break };
            if (value(&middle) < 0.0) == (value(&low) < 0.0) {
                low = middle;
            } else {
                high = middle;
            }
        }
        high
    };

    let start = sample(jd0)?;
    let mut roots: Vec<f64> = Vec::new();
    for direction in [-1.0, 1.0] {
        let mut previous = start;
        loop {
            // Short enough that the faster body moves at most one degree.
            let step = (1.0 / previous.fastest.max(1e-6)).clamp(0.02, 1.0);
            // Outside the ephemeris range the search simply ends.
            let Ok(next) = sample(previous.jd + direction * step) else { break };

            // A station between the two samples is looked at as well, so
            // that a body touching the exact point and turning back within
            // one step is not missed.
            let mut points = vec![previous, next];
            if (previous.rate < 0.0) != (next.rate < 0.0) {
                let station = bisect(previous, next, |s| s.rate);
                points.insert(1, station);
            }
            for pair in points.windows(2) {
                let (from, to) = (pair[0], pair[1]);
                // A sign change near ±180° is the wrap-around, not a pass.
                let near = from.distance.abs() < 90.0 && to.distance.abs() < 90.0;
                if near && (from.distance < 0.0) != (to.distance < 0.0) {
                    roots.push(bisect(from, to, |s| s.distance).jd);
                }
            }

            if next.distance.abs() > SERIES_LIMIT_DEGREES || (next.jd - jd0).abs() > MAX_SPAN_DAYS {
                break;
            }
            previous = next;
        }
    }

    roots.sort_by(f64::total_cmp);
    // The same pass can be found from both directions.
    roots.dedup_by(|later, earlier| (*later - *earlier).abs() < 1.0 / 86_400.0);
    if roots.len() > MAX_PASSES {
        roots.sort_by(|x, y| (x - jd0).abs().total_cmp(&(y - jd0).abs()));
        roots.truncate(MAX_PASSES);
        roots.sort_by(f64::total_cmp);
    }
    Ok(roots
        .into_iter()
        .map(|jd| around + Duration::nanoseconds(((jd - jd0) * 86_400e9).round() as i64))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::aspects::AngleId;
    use crate::chart::compute_chart;
    use chrono::TimeZone;

    fn init() {
        let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../resources/ephe");
        ephemeris::init(&dir).expect("ephemeris data files are present");
    }

    fn utc(y: i32, m: u32, d: u32, h: u32, min: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, m, d, h, min, 0).unwrap()
    }

    fn longitude(body: Body, at: DateTime<Utc>) -> f64 {
        body_longitude_and_speed(ephemeris::julian_day(at).unwrap(), body).unwrap().0
    }

    fn distance(a: f64, b: f64) -> f64 {
        signed(a - b).abs()
    }

    #[test]
    fn transit_aspects_go_from_each_transiting_body_to_the_natal_points() {
        init();
        let natal = compute_chart(utc(1962, 2, 4, 13, 20), 55.6759, 12.5655).unwrap();
        // The same moment as the birth: every body is conjunct itself.
        let found = transit_aspects(&natal, &natal, &Orbs::uniform(3.0));
        for body in Body::ALL {
            let own = found
                .iter()
                .find(|a| a.transit == body && a.natal == ChartPoint::Body(body))
                .unwrap_or_else(|| panic!("{body:?} conjunct itself"));
            assert_eq!(own.kind, AspectKind::Conjunction);
            assert!(own.orb < 1e-9);
        }
        // Unlike aspects within one chart, the nodes are compared across charts.
        assert!(found.iter().any(|a| a.transit == Body::NorthNode
            && a.natal == ChartPoint::Body(Body::SouthNode)
            && a.kind == AspectKind::Opposition));
        // No transiting angles, but natal angles are targets.
        assert!(found.iter().all(|a| a.orb <= 3.0));
        let _ = ChartPoint::Angle(AngleId::Ascendant);
    }

    #[test]
    fn applying_follows_the_transiting_body_alone() {
        init();
        let natal = compute_chart(utc(1962, 2, 4, 13, 20), 55.6759, 12.5655).unwrap();
        let natal_sun = natal.position(Body::Sun).point.longitude;
        // The Sun returns to its natal place around 4 February each year.
        let before = compute_chart(utc(2020, 2, 2, 12, 0), 55.6759, 12.5655).unwrap();
        let after = compute_chart(utc(2020, 2, 6, 12, 0), 55.6759, 12.5655).unwrap();
        let sun_to_sun = |transit: &Chart| {
            *transit_aspects(transit, &natal, &Orbs::uniform(5.0))
                .iter()
                .find(|a| a.transit == Body::Sun && a.natal == ChartPoint::Body(Body::Sun))
                .unwrap()
        };
        assert!(sun_to_sun(&before).applying);
        assert!(!sun_to_sun(&after).applying);
        assert!(distance(before.position(Body::Sun).point.longitude, natal_sun) < 5.0);
    }

    #[test]
    fn a_direct_body_passes_a_natal_point_once() {
        init();
        let target = 100.0;
        let passes =
            exact_passes(Body::Sun, PassTarget::Fixed(target), AspectKind::Conjunction, utc(2020, 6, 28, 0, 0))
                .unwrap();
        assert_eq!(passes.len(), 1);
        assert!(distance(longitude(Body::Sun, passes[0]), target) < 1e-6);
        // The Sun is at 10° Cancer around 1–2 July.
        assert!((passes[0] - utc(2020, 7, 1, 12, 0)).num_hours().abs() < 36);
    }

    #[test]
    fn squares_are_exact_on_the_side_the_body_is_on() {
        init();
        // Natal point at 100°. In early April the Sun is near 10° (behind
        // it, square from 10°); in early October near 190° (ahead of it).
        let spring =
            exact_passes(Body::Sun, PassTarget::Fixed(100.0), AspectKind::Square, utc(2020, 3, 28, 0, 0))
                .unwrap();
        assert_eq!(spring.len(), 1);
        assert!(distance(longitude(Body::Sun, spring[0]), 10.0) < 1e-6);

        let autumn =
            exact_passes(Body::Sun, PassTarget::Fixed(100.0), AspectKind::Square, utc(2020, 10, 1, 0, 0))
                .unwrap();
        assert_eq!(autumn.len(), 1);
        assert!(distance(longitude(Body::Sun, autumn[0]), 190.0) < 1e-6);
    }

    #[test]
    fn a_retrograde_body_passes_three_times() {
        init();
        // Mercury turned retrograde on 23 August 2023 near 22° Virgo and
        // direct on 15 September near 8° Virgo, so it crossed 15° Virgo
        // three times: direct, retrograde, direct.
        let target = 165.0;
        let passes = exact_passes(
            Body::Mercury,
            PassTarget::Fixed(target),
            AspectKind::Conjunction,
            utc(2023, 9, 1, 0, 0),
        )
        .unwrap();
        assert_eq!(passes.len(), 3, "{passes:?}");
        for pass in &passes {
            assert!(distance(longitude(Body::Mercury, *pass), target) < 1e-6);
        }
        assert!(passes[0] < passes[1] && passes[1] < passes[2]);
        assert!(passes[0] < utc(2023, 8, 23, 0, 0));
        assert!(passes[1] > utc(2023, 8, 23, 0, 0) && passes[1] < utc(2023, 9, 15, 0, 0));
        assert!(passes[2] > utc(2023, 9, 15, 0, 0));
        let speed_at = |t| body_longitude_and_speed(ephemeris::julian_day(t).unwrap(), Body::Mercury).unwrap().1;
        assert!(speed_at(passes[0]) > 0.0 && speed_at(passes[1]) < 0.0 && speed_at(passes[2]) > 0.0);

        // Asked from any of the three, the same three are found.
        let again =
            exact_passes(Body::Mercury, PassTarget::Fixed(target), AspectKind::Conjunction, passes[2]).unwrap();
        assert_eq!(again.len(), 3);
        for (x, y) in passes.iter().zip(&again) {
            assert!((*x - *y).num_seconds().abs() < 2);
        }
    }

    #[test]
    fn a_body_that_turns_back_first_never_becomes_exact() {
        init();
        // Mercury stationed near 21°51′ Virgo; 23° Virgo was within orb but never reached.
        let passes = exact_passes(
            Body::Mercury,
            PassTarget::Fixed(173.0),
            AspectKind::Conjunction,
            utc(2023, 8, 23, 0, 0),
        )
        .unwrap();
        assert!(passes.iter().all(|p| *p > utc(2023, 9, 20, 0, 0)), "{passes:?}");
    }

    #[test]
    fn two_moving_bodies_meet_at_the_new_moon() {
        init();
        // New moon (and solar eclipse) of 8 April 2024, 18:21 UTC.
        let passes = exact_passes(
            Body::Moon,
            PassTarget::Body(Body::Sun),
            AspectKind::Conjunction,
            utc(2024, 4, 8, 6, 0),
        )
        .unwrap();
        assert_eq!(passes.len(), 1);
        assert!((passes[0] - utc(2024, 4, 8, 18, 21)).num_seconds().abs() < 120, "{passes:?}");
    }
}
