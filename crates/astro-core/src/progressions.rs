//! Secondary progressions (specification §9 and the decision supplement of
//! 15 November 2026 on progressions and rectification).
//!
//! One day after the birth stands for one year of life, with a tropical
//! year of 365.2422 days. The progressed planets are simply the sky that
//! many days after the birth. The progressed angles are not read from that
//! sky: the Midheaven is moved forward by the Naibod rate, by default in
//! right ascension, and the Ascendant follows from it at the birthplace's
//! latitude.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::aspects::{
    AngleId, Aspect, AspectKind, AspectPoint, ChartPoint, Orbs, aspect_between, find_aspects,
};
use crate::chart::{Angle, BodyPosition, Chart, compute_chart};
use crate::ephemeris::{self, EphemerisError};
use crate::normalize_degrees;
use crate::transits::{PassTarget, exact_passes};
use crate::zodiac::{Body, ZodiacPoint, whole_sign_house};

/// Length of the year that one day stands for (decision 1).
pub const TROPICAL_YEAR_DAYS: f64 = 365.2422;

/// The Naibod rate in degrees per year: the Sun's mean daily motion,
/// 0°59′08.33″ (decision 3).
pub const NAIBOD_DEGREES_PER_YEAR: f64 = 360.0 / TROPICAL_YEAR_DAYS;

/// Progressions are not followed past this age.
pub(crate) const MAX_AGE_YEARS: f64 = 150.0;

/// How the progressed angles are moved forward.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AngleMethod {
    /// The Midheaven's right ascension grows by the Naibod rate. Default.
    NaibodRightAscension,
    /// The Midheaven's ecliptic longitude grows by the Naibod rate.
    NaibodLongitude,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ProgressionOptions {
    /// Maximum orb of progression aspects, in degrees.
    pub orb: f64,
    pub angle_method: AngleMethod,
    /// False when the birth time is unknown: the progressed angles, the
    /// house placements and every aspect involving an angle are left out
    /// (decision 15).
    pub birth_time_known: bool,
}

/// A progressed body. Like a chart's position, but the house is the natal
/// whole-sign house it stands in (decision 5), absent without a birth time.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressedPosition {
    pub body: Body,
    #[serde(flatten)]
    pub point: ZodiacPoint,
    /// Longitude speed in degrees per day of the ephemeris, that is per
    /// year of life; negative when retrograde.
    pub speed: f64,
    pub retrograde: bool,
    pub house: Option<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressedAngles {
    pub ascendant: Angle,
    pub midheaven: Angle,
}

/// An aspect from a progressed body or angle to a point of the natal chart.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressedAspect {
    pub progressed: ChartPoint,
    pub natal: ChartPoint,
    pub kind: AspectKind,
    /// Absolute distance from exactness in degrees.
    pub orb: f64,
    /// True when the progressed point's motion is shrinking the orb.
    pub applying: bool,
    pub out_of_sign: bool,
}

/// The progression layer at one moment of life.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progressions {
    /// The moment after the birth whose sky is the progressed chart.
    pub utc: DateTime<Utc>,
    /// Age in tropical years, with decimals.
    pub age_years: f64,
    pub positions: Vec<ProgressedPosition>,
    pub angles: Option<ProgressedAngles>,
    /// Progressed bodies to natal bodies and angles, then progressed angles
    /// to natal bodies (decision 7).
    pub to_natal: Vec<ProgressedAspect>,
    /// Aspects among the progressed bodies.
    pub to_progressed: Vec<Aspect>,
}

/// Age at `at` in tropical years; negative before the birth.
pub fn age_in_years(birth: DateTime<Utc>, at: DateTime<Utc>) -> f64 {
    (at - birth).num_milliseconds() as f64 / 86_400_000.0 / TROPICAL_YEAR_DAYS
}

/// The moment whose sky is the progressed chart for `at`: as many days
/// after the birth as `at` is tropical years after it.
pub fn progressed_moment(birth: DateTime<Utc>, at: DateTime<Utc>) -> DateTime<Utc> {
    birth + Duration::milliseconds(((at - birth).num_milliseconds() as f64 / TROPICAL_YEAR_DAYS).round() as i64)
}

/// The moment of life a progressed moment stands for; the reverse of
/// [`progressed_moment`].
fn life_moment(birth: DateTime<Utc>, progressed: DateTime<Utc>) -> DateTime<Utc> {
    birth
        + Duration::milliseconds(
            ((progressed - birth).num_nanoseconds().unwrap_or(0) as f64 / 1e6 * TROPICAL_YEAR_DAYS).round() as i64,
        )
}

/// Ecliptic longitude of the Midheaven for a right ascension of the
/// meridian and an obliquity, all in degrees.
fn midheaven_from_armc(armc: f64, obliquity: f64) -> f64 {
    let (armc, obliquity) = (armc.to_radians(), obliquity.to_radians());
    normalize_degrees(armc.sin().atan2(armc.cos() * obliquity.cos()).to_degrees())
}

/// Right ascension of the meridian that puts the Midheaven at a longitude.
fn armc_from_midheaven(midheaven: f64, obliquity: f64) -> f64 {
    let (midheaven, obliquity) = (midheaven.to_radians(), obliquity.to_radians());
    normalize_degrees((midheaven.sin() * obliquity.cos()).atan2(midheaven.cos()).to_degrees())
}

/// Ecliptic longitude of the Ascendant for a right ascension of the
/// meridian, an obliquity and a geographic latitude, all in degrees.
fn ascendant_from_armc(armc: f64, obliquity: f64, latitude: f64) -> f64 {
    let (armc, obliquity, latitude) = (armc.to_radians(), obliquity.to_radians(), latitude.to_radians());
    let x = -(armc.sin() * obliquity.cos() + latitude.tan() * obliquity.sin());
    normalize_degrees(armc.cos().atan2(x).to_degrees())
}

/// Right ascension of the meridian at the birth, in degrees.
fn natal_armc(natal: &Chart) -> Result<f64, EphemerisError> {
    Ok(normalize_degrees(ephemeris::sidereal_time(natal.julian_day)? * 15.0 + natal.longitude))
}

/// Progressed Ascendant and Midheaven longitudes at an age.
fn angle_longitudes(
    natal: &Chart,
    age_years: f64,
    method: AngleMethod,
) -> Result<(f64, f64), EphemerisError> {
    // The obliquity of the progressed sky; it differs from the natal one
    // by far less than an arc-second.
    let obliquity = ephemeris::true_obliquity(natal.julian_day + age_years)?;
    let arc = age_years * NAIBOD_DEGREES_PER_YEAR;
    let armc = match method {
        AngleMethod::NaibodRightAscension => natal_armc(natal)? + arc,
        AngleMethod::NaibodLongitude => {
            armc_from_midheaven(natal.angles.midheaven.point.longitude + arc, obliquity)
        }
    };
    Ok((
        ascendant_from_armc(armc, obliquity, natal.latitude),
        midheaven_from_armc(armc, obliquity),
    ))
}

pub(crate) fn angle_longitude(
    natal: &Chart,
    angle: AngleId,
    age_years: f64,
    method: AngleMethod,
) -> Result<f64, EphemerisError> {
    let (ascendant, midheaven) = angle_longitudes(natal, age_years, method)?;
    Ok(match angle {
        AngleId::Ascendant => ascendant,
        AngleId::Midheaven => midheaven,
    })
}

fn signed(degrees: f64) -> f64 {
    let d = normalize_degrees(degrees);
    if d > 180.0 { d - 360.0 } else { d }
}

/// The progression layer for a natal chart at a moment of life. `None`
/// before the birth and past the age progressions are followed to.
pub fn progressions(
    natal: &Chart,
    at: DateTime<Utc>,
    options: &ProgressionOptions,
) -> Result<Option<Progressions>, EphemerisError> {
    let age_years = age_in_years(natal.utc, at);
    if !(0.0..=MAX_AGE_YEARS).contains(&age_years) {
        return Ok(None);
    }
    let utc = progressed_moment(natal.utc, at);
    let sky = compute_chart(utc, natal.latitude, natal.longitude)?;
    let rising_sign = natal.houses[0].sign;
    let known = options.birth_time_known;

    let positions: Vec<ProgressedPosition> = sky
        .positions
        .iter()
        .map(|p: &BodyPosition| ProgressedPosition {
            body: p.body,
            point: p.point,
            speed: p.speed,
            retrograde: p.retrograde,
            house: known.then(|| whole_sign_house(p.point.sign, rising_sign)),
        })
        .collect();

    // Angle longitudes with their direction of motion, for applying/separating.
    let moving_angles = if known {
        let (ascendant, midheaven) = angle_longitudes(natal, age_years, options.angle_method)?;
        let step = 0.01;
        let (later_ascendant, later_midheaven) =
            angle_longitudes(natal, age_years + step, options.angle_method)?;
        Some([
            (AngleId::Ascendant, ascendant, signed(later_ascendant - ascendant) / step),
            (AngleId::Midheaven, midheaven, signed(later_midheaven - midheaven) / step),
        ])
    } else {
        None
    };
    let angles = moving_angles.map(|[ascendant, midheaven]| {
        let angle = |longitude: f64| {
            let point = ZodiacPoint::new(longitude);
            Angle { point, house: whole_sign_house(point.sign, rising_sign) }
        };
        ProgressedAngles { ascendant: angle(ascendant.1), midheaven: angle(midheaven.1) }
    });

    let orbs = Orbs::uniform(options.orb);
    // The natal points stand still; only the progressed point's motion
    // decides applying or separating.
    let natal_points: Vec<AspectPoint> = natal
        .aspect_points()
        .into_iter()
        .filter(|point| known || matches!(point.id, ChartPoint::Body(_)))
        .map(|point| AspectPoint { speed: 0.0, ..point })
        .collect();
    let progressed_bodies: Vec<AspectPoint> = positions
        .iter()
        .map(|p| AspectPoint { id: ChartPoint::Body(p.body), longitude: p.point.longitude, speed: p.speed })
        .collect();
    let progressed_angles: Vec<AspectPoint> = moving_angles
        .iter()
        .flatten()
        .map(|(id, longitude, speed)| AspectPoint {
            id: ChartPoint::Angle(*id),
            longitude: *longitude,
            speed: *speed,
        })
        .collect();

    let mut to_natal = Vec::new();
    for moving in progressed_bodies.iter().chain(&progressed_angles) {
        for fixed in &natal_points {
            // A progressed angle is compared with the natal planets only.
            if matches!(moving.id, ChartPoint::Angle(_)) && matches!(fixed.id, ChartPoint::Angle(_)) {
                continue;
            }
            if let Some(aspect) = aspect_between(moving, fixed, &orbs) {
                to_natal.push(ProgressedAspect {
                    progressed: moving.id,
                    natal: fixed.id,
                    kind: aspect.kind,
                    orb: aspect.orb,
                    applying: aspect.applying,
                    out_of_sign: aspect.out_of_sign,
                });
            }
        }
    }
    let to_progressed = find_aspects(&progressed_bodies, &orbs);

    Ok(Some(Progressions { utc, age_years, positions, angles, to_natal, to_progressed }))
}

/// What a progressed point makes its aspect to.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ProgressedTarget {
    /// A fixed longitude: a natal planet or angle.
    Natal(f64),
    /// Another progressed body.
    Progressed(Body),
}

/// The moments of life at which a progression aspect is exact, around a
/// given moment, in time order. Several moments mean the progressed body
/// passes the exact point more than once because of retrograde motion; an
/// empty list means it does not become exact within a lifetime.
pub fn progressed_passes(
    natal: &Chart,
    moving: ChartPoint,
    target: ProgressedTarget,
    kind: AspectKind,
    around: DateTime<Utc>,
    method: AngleMethod,
) -> Result<Vec<DateTime<Utc>>, EphemerisError> {
    let in_life = |moment: &DateTime<Utc>| {
        (0.0..=MAX_AGE_YEARS).contains(&age_in_years(natal.utc, *moment))
            && ephemeris::julian_day(*moment).is_ok()
    };
    match moving {
        // A progressed body is the sky some days after the birth, so its
        // passes are ordinary passes of that sky, counted back into years.
        ChartPoint::Body(body) => {
            let target = match target {
                ProgressedTarget::Natal(longitude) => PassTarget::Fixed(longitude),
                ProgressedTarget::Progressed(other) => PassTarget::Body(other),
            };
            let passes = exact_passes(body, target, kind, progressed_moment(natal.utc, around))?;
            Ok(passes
                .into_iter()
                .map(|progressed| life_moment(natal.utc, progressed))
                .filter(in_life)
                .collect())
        }
        ChartPoint::Angle(angle) => {
            let ProgressedTarget::Natal(longitude) = target else { return Ok(Vec::new()) };
            let age0 = age_in_years(natal.utc, around).clamp(0.0, MAX_AGE_YEARS);
            let here = angle_longitude(natal, angle, age0, method)?;
            let offset = if signed(here - longitude) >= 0.0 { kind.angle() } else { -kind.angle() };
            let distance = |age: f64| -> Result<f64, EphemerisError> {
                Ok(signed(angle_longitude(natal, angle, age, method)? - longitude - offset))
            };

            let mut ages: Vec<f64> = Vec::new();
            for direction in [-1.0, 1.0] {
                let (mut age, mut value) = (age0, distance(age0)?);
                loop {
                    let next_age = age + direction * 0.25;
                    if !(0.0..=MAX_AGE_YEARS).contains(&next_age) {
                        break;
                    }
                    let Ok(next) = distance(next_age) else { break };
                    // A sign change near ±180° is the wrap-around, not a pass.
                    if value.abs() < 90.0 && next.abs() < 90.0 && (value < 0.0) != (next < 0.0) {
                        let (mut low, mut high, low_negative) = (age, next_age, value < 0.0);
                        for _ in 0..50 {
                            let middle = (low + high) / 2.0;
                            if (distance(middle)? < 0.0) == low_negative {
                                low = middle;
                            } else {
                                high = middle;
                            }
                        }
                        ages.push(high);
                    }
                    if next.abs() > 25.0 {
                        break;
                    }
                    (age, value) = (next_age, next);
                }
            }
            ages.sort_by(f64::total_cmp);
            ages.dedup_by(|later, earlier| (*later - *earlier).abs() < 1e-6);
            Ok(ages
                .into_iter()
                .map(|age| {
                    natal.utc + Duration::milliseconds((age * TROPICAL_YEAR_DAYS * 86_400_000.0).round() as i64)
                })
                .filter(in_life)
                .collect())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn init() {
        let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../resources/ephe");
        ephemeris::init(&dir).expect("ephemeris data files are present");
    }

    fn natal() -> Chart {
        init();
        compute_chart(Utc.with_ymd_and_hms(1962, 2, 4, 13, 20, 0).unwrap(), 55.6759, 12.5655).unwrap()
    }

    fn years_after(natal: &Chart, years: f64) -> DateTime<Utc> {
        natal.utc + Duration::milliseconds((years * TROPICAL_YEAR_DAYS * 86_400_000.0).round() as i64)
    }

    const OPTIONS: ProgressionOptions = ProgressionOptions {
        orb: 1.0,
        angle_method: AngleMethod::NaibodRightAscension,
        birth_time_known: true,
    };

    fn distance(a: f64, b: f64) -> f64 {
        signed(a - b).abs()
    }

    #[test]
    fn one_day_stands_for_one_tropical_year() {
        let natal = natal();
        let at = years_after(&natal, 30.0);
        assert!((age_in_years(natal.utc, at) - 30.0).abs() < 1e-9);
        let progressed = progressed_moment(natal.utc, at);
        assert_eq!((progressed - natal.utc).num_seconds(), 30 * 86_400);
        assert!((life_moment(natal.utc, progressed) - at).num_seconds().abs() < 1);
    }

    #[test]
    fn the_naibod_rate_is_the_mean_motion_of_the_sun() {
        // 0°59′08.33″ per year.
        let arc_seconds = NAIBOD_DEGREES_PER_YEAR * 3600.0;
        assert!((arc_seconds - (59.0 * 60.0 + 8.33)).abs() < 0.01, "{arc_seconds}");
    }

    #[test]
    fn the_angle_formulas_agree_with_the_ephemeris_library() {
        // Independent of how the library derives its angles: the natal
        // angles must come back from the meridian's right ascension.
        init();
        for (latitude, longitude, hour) in [(55.6759, 12.5655, 13), (-33.87, 151.21, 2), (64.15, -21.94, 20), (0.0, 0.0, 7)] {
            let chart =
                compute_chart(Utc.with_ymd_and_hms(1975, 8, 19, hour, 41, 0).unwrap(), latitude, longitude)
                    .unwrap();
            let armc = natal_armc(&chart).unwrap();
            let obliquity = ephemeris::true_obliquity(chart.julian_day).unwrap();
            let midheaven = chart.angles.midheaven.point.longitude;
            let ascendant = chart.angles.ascendant.point.longitude;
            assert!(distance(midheaven_from_armc(armc, obliquity), midheaven) < 1e-6);
            assert!(distance(ascendant_from_armc(armc, obliquity, latitude), ascendant) < 1e-6);
            assert!(distance(armc_from_midheaven(midheaven, obliquity), armc) < 1e-6);
        }
    }

    #[test]
    fn at_the_birth_the_progressed_chart_is_the_natal_chart() {
        let natal = natal();
        for method in [AngleMethod::NaibodRightAscension, AngleMethod::NaibodLongitude] {
            let report = progressions(&natal, natal.utc, &ProgressionOptions { angle_method: method, ..OPTIONS })
                .unwrap()
                .unwrap();
            assert_eq!(report.utc, natal.utc);
            for (progressed, own) in report.positions.iter().zip(&natal.positions) {
                assert!(distance(progressed.point.longitude, own.point.longitude) < 1e-9);
                assert_eq!(progressed.house, Some(own.house));
            }
            let angles = report.angles.unwrap();
            assert!(distance(angles.midheaven.point.longitude, natal.angles.midheaven.point.longitude) < 1e-6);
            assert!(distance(angles.ascendant.point.longitude, natal.angles.ascendant.point.longitude) < 1e-6);
        }
    }

    #[test]
    fn progressed_planets_are_the_sky_that_many_days_after_the_birth() {
        let natal = natal();
        let report = progressions(&natal, years_after(&natal, 40.0), &OPTIONS).unwrap().unwrap();
        let sky = compute_chart(natal.utc + Duration::days(40), 0.0, 0.0).unwrap();
        for (progressed, real) in report.positions.iter().zip(&sky.positions) {
            assert!(distance(progressed.point.longitude, real.point.longitude) < 1e-9);
        }
        // The Sun moves about a degree a day: some 40° in 40 years.
        let sun = signed(report.positions[0].point.longitude - natal.positions[0].point.longitude);
        assert!((sun - 40.0).abs() < 1.5, "{sun}");
        // Houses are the natal whole-sign houses, not houses of a progressed Ascendant.
        let rising = natal.houses[0].sign;
        for p in &report.positions {
            assert_eq!(p.house, Some(whole_sign_house(p.point.sign, rising)));
        }
    }

    #[test]
    fn naibod_in_right_ascension_moves_the_meridian_evenly() {
        let natal = natal();
        let report = progressions(&natal, years_after(&natal, 35.0), &OPTIONS).unwrap().unwrap();
        let obliquity = ephemeris::true_obliquity(natal.julian_day + 35.0).unwrap();
        let armc = armc_from_midheaven(report.angles.unwrap().midheaven.point.longitude, obliquity);
        let moved = normalize_degrees(armc - natal_armc(&natal).unwrap());
        assert!((moved - 35.0 * NAIBOD_DEGREES_PER_YEAR).abs() < 1e-6, "{moved}");
    }

    #[test]
    fn naibod_in_longitude_moves_the_midheaven_evenly() {
        let natal = natal();
        let options = ProgressionOptions { angle_method: AngleMethod::NaibodLongitude, ..OPTIONS };
        let report = progressions(&natal, years_after(&natal, 35.0), &options).unwrap().unwrap();
        let moved = normalize_degrees(
            report.angles.unwrap().midheaven.point.longitude - natal.angles.midheaven.point.longitude,
        );
        assert!((moved - 35.0 * NAIBOD_DEGREES_PER_YEAR).abs() < 1e-6, "{moved}");
        // The two methods differ, but only by the unevenness of the ecliptic.
        let other = progressions(&natal, years_after(&natal, 35.0), &OPTIONS).unwrap().unwrap();
        let gap = distance(
            other.angles.unwrap().midheaven.point.longitude,
            report.angles.unwrap().midheaven.point.longitude,
        );
        assert!(gap > 0.01 && gap < 5.0, "{gap}");
    }

    #[test]
    fn aspects_follow_decision_seven() {
        let natal = natal();
        let options = ProgressionOptions { orb: 3.0, ..OPTIONS };
        let report = progressions(&natal, years_after(&natal, 27.0), &options).unwrap().unwrap();
        assert!(report.to_natal.iter().all(|a| a.orb <= 3.0));
        // Never a progressed angle to a natal angle.
        assert!(report.to_natal.iter().all(|a| {
            !(matches!(a.progressed, ChartPoint::Angle(_)) && matches!(a.natal, ChartPoint::Angle(_)))
        }));
        // Among the progressed bodies only.
        assert!(report.to_progressed.iter().all(|a| {
            matches!(a.a, ChartPoint::Body(_)) && matches!(a.b, ChartPoint::Body(_))
        }));
        // Over a life, both kinds of angle aspect occur.
        let mut planet_to_angle = false;
        let mut angle_to_planet = false;
        for age in 0..90 {
            let report = progressions(&natal, years_after(&natal, age as f64), &options).unwrap().unwrap();
            planet_to_angle |= report
                .to_natal
                .iter()
                .any(|a| matches!(a.progressed, ChartPoint::Body(_)) && matches!(a.natal, ChartPoint::Angle(_)));
            angle_to_planet |= report
                .to_natal
                .iter()
                .any(|a| matches!(a.progressed, ChartPoint::Angle(_)) && matches!(a.natal, ChartPoint::Body(_)));
        }
        assert!(planet_to_angle && angle_to_planet);
    }

    #[test]
    fn an_unknown_birth_time_leaves_out_angles_and_houses() {
        let natal = natal();
        let options = ProgressionOptions { orb: 5.0, birth_time_known: false, ..OPTIONS };
        for age in [10.0, 33.0, 61.0] {
            let report = progressions(&natal, years_after(&natal, age), &options).unwrap().unwrap();
            assert!(report.angles.is_none());
            assert!(report.positions.iter().all(|p| p.house.is_none()));
            assert!(report.to_natal.iter().all(|a| {
                matches!(a.progressed, ChartPoint::Body(_)) && matches!(a.natal, ChartPoint::Body(_))
            }));
            assert!(!report.positions.is_empty());
        }
    }

    #[test]
    fn nothing_before_the_birth() {
        let natal = natal();
        assert!(progressions(&natal, natal.utc - Duration::days(1), &OPTIONS).unwrap().is_none());
    }

    #[test]
    fn a_progressed_body_is_exact_at_the_moment_found() {
        let natal = natal();
        // The progressed Moon goes round in about 27 years.
        let target = normalize_degrees(natal.position(Body::Moon).point.longitude + 90.0);
        let around = years_after(&natal, 6.0);
        let passes = progressed_passes(
            &natal,
            ChartPoint::Body(Body::Moon),
            ProgressedTarget::Natal(target),
            AspectKind::Conjunction,
            around,
            AngleMethod::NaibodRightAscension,
        )
        .unwrap();
        assert_eq!(passes.len(), 1, "{passes:?}");
        let report = progressions(&natal, passes[0], &OPTIONS).unwrap().unwrap();
        let moon = report.positions.iter().find(|p| p.body == Body::Moon).unwrap();
        assert!(distance(moon.point.longitude, target) < 1e-4, "{}", moon.point.longitude);
        let age = age_in_years(natal.utc, passes[0]);
        assert!(age > 4.0 && age < 9.0, "{age}");
    }

    #[test]
    fn passes_between_two_progressed_bodies_are_found() {
        let natal = natal();
        // The progressed Moon meets the progressed Sun within any 30 years.
        let passes = progressed_passes(
            &natal,
            ChartPoint::Body(Body::Moon),
            ProgressedTarget::Progressed(Body::Sun),
            AspectKind::Conjunction,
            years_after(&natal, 1.0),
            AngleMethod::NaibodRightAscension,
        )
        .unwrap();
        assert!(!passes.is_empty());
        for pass in passes {
            let report = progressions(&natal, pass, &OPTIONS).unwrap().unwrap();
            let longitude = |body| report.positions.iter().find(|p| p.body == body).unwrap().point.longitude;
            assert!(distance(longitude(Body::Moon), longitude(Body::Sun)) < 1e-4);
        }
    }

    #[test]
    fn a_progressed_angle_is_exact_at_the_moment_found() {
        let natal = natal();
        for method in [AngleMethod::NaibodRightAscension, AngleMethod::NaibodLongitude] {
            let target = normalize_degrees(natal.angles.midheaven.point.longitude + 20.0);
            let passes = progressed_passes(
                &natal,
                ChartPoint::Angle(AngleId::Midheaven),
                ProgressedTarget::Natal(target),
                AspectKind::Conjunction,
                years_after(&natal, 15.0),
                method,
            )
            .unwrap();
            assert_eq!(passes.len(), 1, "{passes:?}");
            let options = ProgressionOptions { angle_method: method, ..OPTIONS };
            let report = progressions(&natal, passes[0], &options).unwrap().unwrap();
            assert!(distance(report.angles.unwrap().midheaven.point.longitude, target) < 1e-5);
            let age = age_in_years(natal.utc, passes[0]);
            assert!(age > 17.0 && age < 24.0, "{age}");
        }
    }
}
