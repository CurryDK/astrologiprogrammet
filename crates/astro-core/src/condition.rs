//! Planetary Condition (specification §6).
//!
//! The rules come from the decision documents of 14 and 15 November 2026
//! (`docs/planetary_condition_*.txt`); where they differ the latest wins.
//! Only the seven traditional planets take part. Every condition is a
//! separate fact: there is no score, no total and no ranking, and day/night
//! sect never changes a bonification or maltreatment rating.
//!
//! Deliberately absent, because the documents reject them: counteraction
//! and hayz. Conditions the documents classify as neutral (own decan,
//! nearness to an angle, one-sided reception, the bare overcoming
//! relation) are reported with no rating.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::aspects::AspectKind;
use crate::chart::{Chart, Sect, body_longitude_and_speed};
use crate::ephemeris::{self, EphemerisError};
use crate::normalize_degrees;
use crate::profections::Moment;
use crate::time::ZoneChoice;
use crate::zodiac::{Body, Sign};

/// The planets Planetary Condition covers, in display order.
pub const PLANETS: [Body; 7] = [
    Body::Sun,
    Body::Moon,
    Body::Mercury,
    Body::Venus,
    Body::Mars,
    Body::Jupiter,
    Body::Saturn,
];

/// Within this many degrees of an angle counts as near it (inclusive).
pub const ANGLE_LIMIT: f64 = 3.0;
/// Enclosing planets or rays must be within this many degrees on each side (inclusive).
pub const ENCLOSURE_LIMIT: f64 = 7.0;
/// Engagement, adherence and striking with a ray: degrees from exact (inclusive).
pub const CLOSE_LIMIT: f64 = 3.0;
/// The same limit when the Moon is one of the two planets.
pub const MOON_LIMIT: f64 = 13.0;

/// Guards the inclusive limits against floating-point noise.
const EPSILON: f64 = 1e-9;

/// The user-adjustable distances from the Sun, in degrees. Each is inclusive.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionOptions {
    pub cazimi: f64,
    pub combust: f64,
    pub beams: f64,
}

impl Default for ConditionOptions {
    /// Cazimi within 1°, combust to 8°, under the beams to 15°.
    fn default() -> Self {
        ConditionOptions {
            cazimi: 1.0,
            combust: 8.0,
            beams: 15.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Rating {
    VerySupportive,
    Supportive,
    Challenging,
    VeryChallenging,
}

/// The analysis categories the user can switch on and off.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ConditionGroup {
    Sect,
    Joys,
    Dignities,
    Sun,
    Houses,
    Copresence,
    DomicileLord,
    Reception,
    Overcoming,
    Bonification,
    Maltreatment,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ConditionKind {
    SectLight,
    SectFavored,
    SectContrary,
    JoyHemisphere,
    JoySignPolarity,
    JoySolarPhase,
    JoyHouse,
    Domicile,
    Exaltation,
    Triplicity,
    Bounds,
    Decan,
    Detriment,
    Fall,
    Cazimi,
    Combust,
    UnderBeams,
    Chariot,
    HouseAngular,
    HouseFortunate,
    HouseUnfortunate,
    NearAngle,
    Copresence,
    LordWitness,
    LordCopresent,
    LordAversion,
    Reception,
    MutualReception,
    /// This planet overcomes another (right-hand whole-sign sextile, square or trine).
    Overcomes,
    OvercomeBy,
    /// Bonification or maltreatment through being overcome.
    ByOvercoming,
    /// Overcome by a benefic's sextile: supportive, not a full bonification.
    SuperiorSextile,
    /// Whole-sign trine from a benefic, from either side.
    SignTrine,
    /// Whole-sign opposition from a malefic.
    SignOpposition,
    Engagement,
    Adherence,
    StrikingRay,
    Enclosure,
    /// An enclosure that another planet's body or ray breaks; not active.
    EnclosureBroken,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Dignity {
    Domicile,
    Exaltation,
    Triplicity,
    Bounds,
    Decan,
}

impl Dignity {
    pub const ALL: [Dignity; 5] = [
        Dignity::Domicile,
        Dignity::Exaltation,
        Dignity::Triplicity,
        Dignity::Bounds,
        Dignity::Decan,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TriplicityRole {
    Day,
    Night,
    Participating,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SectRole {
    /// The Sun or the Moon.
    Leader,
    Benefic,
    Malefic,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PlanetSect {
    Diurnal,
    Nocturnal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SolarPhase {
    /// West of the Sun in ecliptic longitude: rises before it.
    Morning,
    Evening,
    /// Exactly conjunct the Sun.
    Undetermined,
}

/// How a planet moves compared with its mean daily motion.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SpeedStatus {
    /// Retrograde, whatever the numeric speed.
    Retro,
    /// Direct and slower than the reference speed.
    Slow,
    /// Direct and at or above the reference speed.
    Fast,
}

/// Mean daily motion in degrees: Demetra George, Ancient Astrology in
/// Theory and Practice, vol. I, table 20 (decision of 15 November 2026).
pub fn reference_speed(body: Body) -> Option<f64> {
    let minutes = match body {
        Body::Moon => 13.0 * 60.0 + 10.56,
        Body::Sun => 59.16,
        Body::Mercury | Body::Venus => 59.0,
        Body::Mars => 31.444,
        Body::Jupiter => 4.987,
        Body::Saturn => 2.009,
        _ => return None,
    };
    Some(minutes / 60.0)
}

/// Retro when retrograde; otherwise Slow below the reference speed and
/// Fast at or above it. Compared at full precision, with no tolerance.
pub fn speed_status(body: Body, speed: f64) -> Option<SpeedStatus> {
    let reference = reference_speed(body)?;
    Some(if speed < 0.0 {
        SpeedStatus::Retro
    } else if speed < reference {
        SpeedStatus::Slow
    } else {
        SpeedStatus::Fast
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HouseType {
    Angular,
    Succedent,
    Cadent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AngleName {
    Ascendant,
    Descendant,
    Midheaven,
    ImumCoeli,
}

/// A planet whose body (no aspect) or aspect ray breaks an enclosure.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Breaker {
    pub body: Body,
    pub aspect: Option<AspectKind>,
}

/// One condition of one planet. Fields that do not apply are `None`/empty.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Condition {
    pub kind: ConditionKind,
    pub group: ConditionGroup,
    /// `None` for a fact that carries no evaluation.
    pub rating: Option<Rating>,
    /// The other planets involved.
    pub others: Vec<Body>,
    pub aspect: Option<AspectKind>,
    /// Degrees: from exact aspect, from the Sun, or from an angle.
    pub orb: Option<f64>,
    /// Degree-based conditions: `Some(true)` applying (or exact),
    /// `Some(false)` separating, `None` when the relative motion is zero.
    pub applying: Option<bool>,
    pub sect_role: Option<SectRole>,
    /// Co-presence: whether the benefic or malefic belongs to the sect in favour.
    pub favored: Option<bool>,
    /// Co-presence with a benefic or malefic: whether it is of the same sect
    /// as the planet it is listed under. Only how the pair is named (corrections
    /// of 24 November 2026, point 03); the rating follows `favored`.
    pub same_sect: Option<bool>,
    pub triplicity_role: Option<TriplicityRole>,
    pub angle: Option<AngleName>,
    /// Reception: the dignities the other planet has where this one stands.
    /// Chariot: the dignities that protect the planet.
    pub dignities: Vec<Dignity>,
    /// Mutual reception: the dignities this planet has where the other stands.
    pub return_dignities: Vec<Dignity>,
    /// Enclosure: by bodies (`true`) or by rays (`false`).
    pub bodily: Option<bool>,
    pub breakers: Vec<Breaker>,
    /// Combust or under the beams whose negative rating the chariot removes.
    pub suppressed: bool,
}

impl Condition {
    fn new(kind: ConditionKind, group: ConditionGroup, rating: Option<Rating>) -> Condition {
        Condition {
            kind,
            group,
            rating,
            others: Vec::new(),
            aspect: None,
            orb: None,
            applying: None,
            sect_role: None,
            favored: None,
            same_sect: None,
            triplicity_role: None,
            angle: None,
            dignities: Vec::new(),
            return_dignities: Vec::new(),
            bodily: None,
            breakers: Vec::new(),
            suppressed: false,
        }
    }

    fn with(mut self, other: Body) -> Condition {
        self.others.push(other);
        self
    }
}

/// The planets that rule the place a planet stands in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lords {
    pub domicile: Body,
    pub exaltation: Option<Body>,
    /// Day, night and participating lord of the sign's triplicity.
    pub triplicity: [Body; 3],
    pub bounds: Body,
    pub decan: Body,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanetCondition {
    pub body: Body,
    pub sign: Sign,
    /// Whole-sign house, 1–12.
    pub house: u8,
    pub house_type: HouseType,
    /// `None` for Mercury exactly conjunct the Sun.
    pub sect: Option<PlanetSect>,
    /// On or above the Ascendant–Descendant axis.
    pub above_horizon: bool,
    /// Morning or evening star; `None` for the Sun and the Moon.
    pub phase: Option<SolarPhase>,
    /// Degrees of ecliptic longitude from the Sun; `None` for the Sun.
    pub sun_distance: Option<f64>,
    /// Degrees per day; negative when retrograde.
    pub speed: f64,
    pub retrograde: bool,
    /// Retro, Slow or Fast against the planet's mean daily motion.
    pub speed_status: Option<SpeedStatus>,
    pub lords: Lords,
    pub conditions: Vec<Condition>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionReport {
    /// The sect used, which may be the user's manual choice.
    pub sect: Sect,
    pub overridden: bool,
    pub sect_light: Body,
    pub planets: Vec<PlanetCondition>,
}

// --- Tables -----------------------------------------------------------------

fn opposite(sign: Sign) -> Sign {
    Sign::ALL[(sign.index() + 6) % 12]
}

/// The sign a planet is exalted in.
pub fn exaltation_sign(body: Body) -> Option<Sign> {
    match body {
        Body::Sun => Some(Sign::Aries),
        Body::Moon => Some(Sign::Taurus),
        Body::Mercury => Some(Sign::Virgo),
        Body::Venus => Some(Sign::Pisces),
        Body::Mars => Some(Sign::Capricorn),
        Body::Jupiter => Some(Sign::Cancer),
        Body::Saturn => Some(Sign::Libra),
        _ => None,
    }
}

fn exaltation_lord(sign: Sign) -> Option<Body> {
    PLANETS.into_iter().find(|&body| exaltation_sign(body) == Some(sign))
}

/// Dorothean triplicity lords of a sign: day, night, participating.
pub fn triplicity_lords(sign: Sign) -> [Body; 3] {
    match sign.index() % 4 {
        0 => [Body::Sun, Body::Jupiter, Body::Saturn],   // fire
        1 => [Body::Venus, Body::Moon, Body::Mars],      // earth
        2 => [Body::Saturn, Body::Mercury, Body::Jupiter], // air
        _ => [Body::Venus, Body::Mars, Body::Moon],      // water
    }
}

/// Egyptian bounds: for each sign, the degree each bound ends before and its lord.
const BOUNDS: [[(u8, Body); 5]; 12] = {
    use Body::{Jupiter as J, Mars as Ma, Mercury as Me, Saturn as S, Venus as V};
    [
        [(6, J), (12, V), (20, Me), (25, Ma), (30, S)],  // Aries
        [(8, V), (14, Me), (22, J), (27, S), (30, Ma)],  // Taurus
        [(6, Me), (12, J), (17, V), (24, Ma), (30, S)],  // Gemini
        [(7, Ma), (13, V), (19, Me), (26, J), (30, S)],  // Cancer
        [(6, J), (11, V), (18, S), (24, Me), (30, Ma)],  // Leo
        [(7, Me), (17, V), (21, J), (28, Ma), (30, S)],  // Virgo
        [(6, S), (14, Me), (21, J), (28, V), (30, Ma)],  // Libra
        [(7, Ma), (11, V), (19, Me), (24, J), (30, S)],  // Scorpio
        [(12, J), (17, V), (21, Me), (26, S), (30, Ma)], // Sagittarius
        [(7, Me), (14, J), (22, V), (26, S), (30, Ma)],  // Capricorn
        [(7, Me), (13, V), (20, J), (25, Ma), (30, S)],  // Aquarius
        [(12, V), (16, J), (19, Me), (28, Ma), (30, S)], // Pisces
    ]
};

/// Lord of the Egyptian bound at a longitude. A point exactly on a
/// boundary belongs to the bound that begins there.
pub fn bound_lord(longitude: f64) -> Body {
    let longitude = normalize_degrees(longitude);
    let sign = Sign::from_longitude(longitude);
    let in_sign = longitude - sign.index() as f64 * 30.0;
    let bounds = &BOUNDS[sign.index()];
    bounds
        .iter()
        .find(|(end, _)| in_sign < *end as f64)
        .unwrap_or(&bounds[4])
        .1
}

/// Lord of the Chaldean decan at a longitude: the planets in descending
/// order from Mars at 0° Aries, one per ten degrees.
pub fn decan_lord(longitude: f64) -> Body {
    const ORDER: [Body; 7] = [
        Body::Mars,
        Body::Sun,
        Body::Venus,
        Body::Mercury,
        Body::Moon,
        Body::Saturn,
        Body::Jupiter,
    ];
    let index = ((normalize_degrees(longitude) / 10.0) as usize).min(35);
    ORDER[index % 7]
}

fn lords_at(longitude: f64) -> Lords {
    let sign = Sign::from_longitude(longitude);
    Lords {
        domicile: sign.ruler(),
        exaltation: exaltation_lord(sign),
        triplicity: triplicity_lords(sign),
        bounds: bound_lord(longitude),
        decan: decan_lord(longitude),
    }
}

/// The dignities `body` has at a longitude.
fn dignities_at(body: Body, longitude: f64) -> Vec<Dignity> {
    let lords = lords_at(longitude);
    Dignity::ALL
        .into_iter()
        .filter(|dignity| match dignity {
            Dignity::Domicile => lords.domicile == body,
            Dignity::Exaltation => lords.exaltation == Some(body),
            Dignity::Triplicity => lords.triplicity.contains(&body),
            Dignity::Bounds => lords.bounds == body,
            Dignity::Decan => lords.decan == body,
        })
        .collect()
}

fn is_benefic(body: Body) -> bool {
    matches!(body, Body::Venus | Body::Jupiter)
}

fn is_malefic(body: Body) -> bool {
    matches!(body, Body::Mars | Body::Saturn)
}

fn house_joy(body: Body) -> Option<u8> {
    match body {
        Body::Mercury => Some(1),
        Body::Moon => Some(3),
        Body::Venus => Some(5),
        Body::Mars => Some(6),
        Body::Sun => Some(9),
        Body::Jupiter => Some(11),
        Body::Saturn => Some(12),
        _ => None,
    }
}

// --- Geometry ---------------------------------------------------------------

/// Reduce an angle to (-180, 180].
fn signed(degrees: f64) -> f64 {
    let reduced = normalize_degrees(degrees);
    if reduced > 180.0 { reduced - 360.0 } else { reduced }
}

/// How many signs forward from `from` to `to`, 0–11.
fn signs_forward(from: Sign, to: Sign) -> usize {
    (to.index() + 12 - from.index()) % 12
}

/// The whole-sign aspect between signs that many signs apart, if any.
fn sign_aspect(signs_apart: usize) -> Option<AspectKind> {
    match signs_apart {
        0 => Some(AspectKind::Conjunction),
        2 | 10 => Some(AspectKind::Sextile),
        3 | 9 => Some(AspectKind::Square),
        4 | 8 => Some(AspectKind::Trine),
        6 => Some(AspectKind::Opposition),
        _ => None,
    }
}

/// Morning or evening star by ecliptic longitude alone; no claim of visibility.
pub fn solar_phase(longitude: f64, sun: f64) -> SolarPhase {
    let ahead = normalize_degrees(longitude - sun);
    if ahead == 0.0 {
        SolarPhase::Undetermined
    } else if ahead > 180.0 {
        SolarPhase::Morning
    } else {
        SolarPhase::Evening
    }
}

/// On or above the Ascendant–Descendant axis, as for the Sun in [`crate::chart::sect_from_sun`].
fn above_horizon(longitude: f64, ascendant: f64) -> bool {
    let ahead = normalize_degrees(longitude - ascendant);
    !(ahead > 0.0 && ahead < 180.0)
}

struct Planet {
    body: Body,
    longitude: f64,
    speed: f64,
    sign: Sign,
    house: u8,
}

/// A degree-based aspect between two planets within a limit.
struct CloseAspect {
    kind: AspectKind,
    orb: f64,
    /// `Some(true)` applying or exact, `Some(false)` separating, `None` undetermined.
    applying: Option<bool>,
}

fn close_aspect(a: &Planet, b: &Planet, limit: f64) -> Option<CloseAspect> {
    let arc = signed(b.longitude - a.longitude);
    let separation = arc.abs();
    let (kind, deviation) = AspectKind::ALL
        .into_iter()
        .map(|kind| (kind, separation - kind.angle()))
        .find(|(_, deviation)| deviation.abs() <= limit + EPSILON)?;
    let separation_rate = if arc >= 0.0 { b.speed - a.speed } else { a.speed - b.speed };
    let orb_rate = if deviation >= 0.0 { separation_rate } else { -separation_rate };
    let applying = if deviation.abs() < EPSILON {
        Some(true)
    } else if orb_rate == 0.0 {
        None
    } else {
        Some(orb_rate < 0.0)
    };
    Some(CloseAspect {
        kind,
        orb: deviation.abs(),
        applying,
    })
}

/// A ray cast backwards in the order of the signs: `striker` stands later
/// in the zodiac than `target` by one of the given aspects, within the
/// close limit of exact (inclusive). An opposition has no direction.
fn backward_ray(target: &Planet, striker: &Planet, kinds: &[AspectKind]) -> Option<CloseAspect> {
    let ahead = signed(striker.longitude - target.longitude);
    kinds.iter().find_map(|&kind| {
        let deviation = if kind == AspectKind::Opposition {
            ahead.abs() - 180.0
        } else {
            ahead - kind.angle()
        };
        if deviation.abs() > CLOSE_LIMIT + EPSILON {
            return None;
        }
        let separation_rate = if ahead >= 0.0 {
            striker.speed - target.speed
        } else {
            target.speed - striker.speed
        };
        let orb_rate = if deviation >= 0.0 { separation_rate } else { -separation_rate };
        Some(CloseAspect {
            kind,
            orb: deviation.abs(),
            applying: if deviation.abs() < EPSILON {
                Some(true)
            } else if orb_rate == 0.0 {
                None
            } else {
                Some(orb_rate < 0.0)
            },
        })
    })
}

/// The points a planet's sextile, square, trine and opposition rays fall on.
fn ray_points(longitude: f64) -> [(AspectKind, f64); 7] {
    [
        (AspectKind::Sextile, longitude + 60.0),
        (AspectKind::Sextile, longitude - 60.0),
        (AspectKind::Square, longitude + 90.0),
        (AspectKind::Square, longitude - 90.0),
        (AspectKind::Trine, longitude + 120.0),
        (AspectKind::Trine, longitude - 120.0),
        (AspectKind::Opposition, longitude + 180.0),
    ]
}

/// The nearest point of one encloser behind and ahead of the target,
/// as signed offsets within the enclosure limit.
fn nearest_sides(target: f64, encloser: &Planet, bodily: bool) -> (Option<f64>, Option<f64>) {
    let offsets: Vec<f64> = if bodily {
        vec![signed(encloser.longitude - target)]
    } else {
        ray_points(encloser.longitude)
            .iter()
            .map(|(_, point)| signed(point - target))
            .collect()
    };
    let within = |offset: &f64| offset.abs() > EPSILON && offset.abs() <= ENCLOSURE_LIMIT + EPSILON;
    let behind = offsets
        .iter()
        .copied()
        .filter(within)
        .filter(|o| *o < 0.0)
        .max_by(f64::total_cmp);
    let ahead = offsets
        .iter()
        .copied()
        .filter(within)
        .filter(|o| *o > 0.0)
        .min_by(f64::total_cmp);
    (behind, ahead)
}

/// The interval an enclosure spans around the target: offsets of the
/// enclosing point behind (negative) and ahead (positive).
fn enclosure_span(target: f64, a: &Planet, b: &Planet, bodily: bool) -> Option<(f64, f64)> {
    let (a_behind, a_ahead) = nearest_sides(target, a, bodily);
    let (b_behind, b_ahead) = nearest_sides(target, b, bodily);
    // One encloser on each side; with rays both arrangements can occur.
    [(a_behind, b_ahead), (b_behind, a_ahead)]
        .into_iter()
        .filter_map(|(behind, ahead)| Some((behind?, ahead?)))
        .min_by(|x, y| (x.1 - x.0).total_cmp(&(y.1 - y.0)))
}

/// Planets whose body or ray falls between the target and an enclosing
/// point. A point on the same longitude as an enclosing point counts.
fn interveners(target: f64, span: (f64, f64), others: &[&Planet]) -> Vec<Breaker> {
    let between = |point: f64| {
        let offset = signed(point - target);
        (offset < -EPSILON && offset >= span.0 - EPSILON)
            || (offset > EPSILON && offset <= span.1 + EPSILON)
    };
    let mut breakers = Vec::new();
    for planet in others {
        if between(planet.longitude) {
            breakers.push(Breaker {
                body: planet.body,
                aspect: None,
            });
        }
        for (kind, point) in ray_points(planet.longitude) {
            let breaker = Breaker {
                body: planet.body,
                aspect: Some(kind),
            };
            if between(point) && !breakers.contains(&breaker) {
                breakers.push(breaker);
            }
        }
    }
    breakers
}

// --- The report -------------------------------------------------------------

/// Planetary Condition of a chart. `sect_override` is the user's manual
/// day/night choice; without it the chart's own sect is used.
pub fn condition_report(
    chart: &Chart,
    sect_override: Option<Sect>,
    options: &ConditionOptions,
) -> ConditionReport {
    use ConditionGroup as G;
    use ConditionKind as K;

    let sect = sect_override.unwrap_or(chart.sect);
    let sect_light = match sect {
        Sect::Day => Body::Sun,
        Sect::Night => Body::Moon,
    };
    let ascendant = chart.angles.ascendant.point.longitude;
    let planets: Vec<Planet> = PLANETS
        .into_iter()
        .map(|body| {
            let position = chart.position(body);
            Planet {
                body,
                longitude: position.point.longitude,
                speed: position.speed,
                sign: position.point.sign,
                house: position.house,
            }
        })
        .collect();
    let sun = planets[0].longitude;
    let mercury_phase = solar_phase(planets[2].longitude, sun);

    let sect_of = |body: Body| match body {
        Body::Sun | Body::Jupiter | Body::Saturn => Some(PlanetSect::Diurnal),
        Body::Moon | Body::Venus | Body::Mars => Some(PlanetSect::Nocturnal),
        _ => match mercury_phase {
            SolarPhase::Morning => Some(PlanetSect::Diurnal),
            SolarPhase::Evening => Some(PlanetSect::Nocturnal),
            SolarPhase::Undetermined => None,
        },
    };
    let in_favor = |planet_sect: PlanetSect| (planet_sect == PlanetSect::Diurnal) == (sect == Sect::Day);

    let report = planets
        .iter()
        .map(|planet| {
            let body = planet.body;
            let mut conditions = Vec::new();
            let planet_sect = sect_of(body);
            let above = above_horizon(planet.longitude, ascendant);
            let phase = (!matches!(body, Body::Sun | Body::Moon))
                .then(|| solar_phase(planet.longitude, sun));

            // Sect: shown on its own, never a rating.
            if body == sect_light {
                conditions.push(Condition::new(K::SectLight, G::Sect, None));
            }
            if let Some(planet_sect) = planet_sect {
                let kind = if in_favor(planet_sect) { K::SectFavored } else { K::SectContrary };
                let mut condition = Condition::new(kind, G::Sect, None);
                condition.sect_role = match body {
                    Body::Sun | Body::Moon => Some(SectRole::Leader),
                    _ if is_benefic(body) => Some(SectRole::Benefic),
                    _ if is_malefic(body) => Some(SectRole::Malefic),
                    _ => None,
                };
                conditions.push(condition);
            }

            // Joys: four separate conditions, each supportive.
            let joy = Some(Rating::Supportive);
            if let Some(planet_sect) = planet_sect {
                if in_favor(planet_sect) == above {
                    conditions.push(Condition::new(K::JoyHemisphere, G::Joys, joy));
                }
                let masculine = planet.sign.index() % 2 == 0;
                if (planet_sect == PlanetSect::Diurnal) == masculine {
                    conditions.push(Condition::new(K::JoySignPolarity, G::Joys, joy));
                }
            }
            let rejoicing_phase = match body {
                Body::Jupiter | Body::Saturn => Some(SolarPhase::Morning),
                Body::Venus | Body::Mars => Some(SolarPhase::Evening),
                // Mercury: morning star in a day chart, evening star at night.
                Body::Mercury => Some(match sect {
                    Sect::Day => SolarPhase::Morning,
                    Sect::Night => SolarPhase::Evening,
                }),
                _ => None,
            };
            if rejoicing_phase.is_some() && rejoicing_phase == phase {
                conditions.push(Condition::new(K::JoySolarPhase, G::Joys, joy));
            }
            if house_joy(body) == Some(planet.house) {
                conditions.push(Condition::new(K::JoyHouse, G::Joys, joy));
            }

            // Essential dignities and debilities.
            let own = dignities_at(body, planet.longitude);
            let very = Some(Rating::VerySupportive);
            if own.contains(&Dignity::Domicile) {
                conditions.push(Condition::new(K::Domicile, G::Dignities, very));
            }
            if own.contains(&Dignity::Exaltation) {
                conditions.push(Condition::new(K::Exaltation, G::Dignities, very));
            }
            if own.contains(&Dignity::Triplicity) {
                let lords = triplicity_lords(planet.sign);
                let mut condition = Condition::new(K::Triplicity, G::Dignities, very);
                condition.triplicity_role = Some(if lords[0] == body {
                    TriplicityRole::Day
                } else if lords[1] == body {
                    TriplicityRole::Night
                } else {
                    TriplicityRole::Participating
                });
                conditions.push(condition);
            }
            if own.contains(&Dignity::Bounds) {
                conditions.push(Condition::new(K::Bounds, G::Dignities, very));
            }
            if own.contains(&Dignity::Decan) {
                conditions.push(Condition::new(K::Decan, G::Dignities, None));
            }
            if opposite(planet.sign).ruler() == body {
                conditions.push(Condition::new(K::Detriment, G::Dignities, Some(Rating::Challenging)));
            }
            if exaltation_sign(body) == Some(opposite(planet.sign)) {
                conditions.push(Condition::new(K::Fall, G::Dignities, Some(Rating::Challenging)));
            }

            // Relation to the Sun.
            let sun_distance = (body != Body::Sun).then(|| signed(planet.longitude - sun).abs());
            if let Some(distance) = sun_distance {
                let within = |limit: f64| distance <= limit + EPSILON;
                if within(options.cazimi) {
                    let mut condition = Condition::new(K::Cazimi, G::Sun, very);
                    condition.orb = Some(distance);
                    conditions.push(condition);
                } else if within(options.beams) {
                    let (kind, negative) = if within(options.combust) {
                        (K::Combust, Rating::VeryChallenging)
                    } else {
                        (K::UnderBeams, Rating::Challenging)
                    };
                    let protecting: Vec<Dignity> = own
                        .iter()
                        .copied()
                        .filter(|d| matches!(d, Dignity::Domicile | Dignity::Exaltation | Dignity::Bounds))
                        .collect();
                    let protected = !protecting.is_empty();
                    let rating = (!protected).then_some(negative);
                    let mut condition = Condition::new(kind, G::Sun, rating);
                    condition.orb = Some(distance);
                    condition.suppressed = protected;
                    conditions.push(condition);
                    if protected {
                        let mut chariot = Condition::new(K::Chariot, G::Sun, very);
                        chariot.dignities = protecting;
                        conditions.push(chariot);
                    }
                }
            }

            // Houses and angles.
            let supportive = Some(Rating::Supportive);
            let challenging = Some(Rating::Challenging);
            if matches!(planet.house, 1 | 4 | 7 | 10) {
                conditions.push(Condition::new(K::HouseAngular, G::Houses, supportive));
            }
            if matches!(planet.house, 1 | 3 | 4 | 5 | 7 | 9 | 10 | 11) {
                conditions.push(Condition::new(K::HouseFortunate, G::Houses, supportive));
            }
            if matches!(planet.house, 2 | 6 | 8 | 12) {
                conditions.push(Condition::new(K::HouseUnfortunate, G::Houses, challenging));
            }
            let angles = [
                (AngleName::Ascendant, chart.angles.ascendant.point.longitude),
                (AngleName::Descendant, chart.angles.descendant.point.longitude),
                (AngleName::Midheaven, chart.angles.midheaven.point.longitude),
                (AngleName::ImumCoeli, chart.angles.imum_coeli.point.longitude),
            ];
            for (name, longitude) in angles {
                let distance = signed(planet.longitude - longitude).abs();
                if distance <= ANGLE_LIMIT + EPSILON {
                    let mut condition = Condition::new(K::NearAngle, G::Houses, None);
                    condition.angle = Some(name);
                    condition.orb = Some(distance);
                    conditions.push(condition);
                }
            }

            let others = || planets.iter().filter(move |other| other.body != body);

            // Co-presence: same sign, no orb. Benefics and malefics are
            // rated by whether they belong to the sect in favour.
            for other in others().filter(|other| other.sign == planet.sign) {
                let favored = sect_of(other.body).map(in_favor);
                let rating = match (is_benefic(other.body), is_malefic(other.body), favored) {
                    (true, _, Some(true)) => Some(Rating::VerySupportive),
                    (true, _, Some(false)) => Some(Rating::Supportive),
                    (_, true, Some(true)) => Some(Rating::Challenging),
                    (_, true, Some(false)) => Some(Rating::VeryChallenging),
                    _ => None,
                };
                let mut condition = Condition::new(K::Copresence, G::Copresence, rating).with(other.body);
                if rating.is_some() {
                    condition.favored = favored;
                    condition.same_sect = planet_sect
                        .zip(sect_of(other.body))
                        .map(|(own, theirs)| own == theirs);
                }
                conditions.push(condition);
            }

            // Domicile lord: witness, co-present or in aversion.
            let lord = planet.sign.ruler();
            if lord != body {
                let lord_sign = chart.position(lord).point.sign;
                let aspect = sign_aspect(signs_forward(planet.sign, lord_sign));
                let mut condition = match aspect {
                    Some(AspectKind::Conjunction) => Condition::new(K::LordCopresent, G::DomicileLord, supportive),
                    Some(_) => Condition::new(K::LordWitness, G::DomicileLord, supportive),
                    None => Condition::new(K::LordAversion, G::DomicileLord, challenging),
                }
                .with(lord);
                condition.aspect = aspect.filter(|kind| *kind != AspectKind::Conjunction);
                conditions.push(condition);
            }

            // Reception by any of the five dignities; no aspect required.
            for other in others() {
                let received = dignities_at(other.body, planet.longitude);
                if received.is_empty() {
                    continue;
                }
                let returned = dignities_at(body, other.longitude);
                let kind = if returned.is_empty() { K::Reception } else { K::MutualReception };
                let mutual_domicile =
                    received.contains(&Dignity::Domicile) && returned.contains(&Dignity::Domicile);
                let mut condition =
                    Condition::new(kind, G::Reception, mutual_domicile.then_some(Rating::Supportive))
                        .with(other.body);
                condition.dignities = received;
                condition.return_dignities = returned;
                conditions.push(condition);
            }

            // Overcoming: the planet earlier in the zodiac, 2–4 signs back,
            // overcomes the later one. Sign-based, whatever the degrees.
            for other in others() {
                let overcoming = |signs: usize| matches!(signs, 2..=4).then(|| sign_aspect(signs)).flatten();
                if let Some(aspect) = overcoming(signs_forward(planet.sign, other.sign)) {
                    let mut condition = Condition::new(K::Overcomes, G::Overcoming, None).with(other.body);
                    condition.aspect = Some(aspect);
                    conditions.push(condition);
                }
                if let Some(aspect) = overcoming(signs_forward(other.sign, planet.sign)) {
                    let mut condition = Condition::new(K::OvercomeBy, G::Overcoming, None).with(other.body);
                    condition.aspect = Some(aspect);
                    conditions.push(condition);
                }
            }

            // Bonification by Venus and Jupiter.
            let very_bad = Some(Rating::VeryChallenging);
            for other in others().filter(|other| is_benefic(other.body)) {
                let from_other = signs_forward(other.sign, planet.sign);
                match from_other {
                    3 | 4 => {
                        let mut condition = Condition::new(K::ByOvercoming, G::Bonification, very).with(other.body);
                        condition.aspect = sign_aspect(from_other);
                        conditions.push(condition);
                    }
                    2 => {
                        let mut condition =
                            Condition::new(K::SuperiorSextile, G::Bonification, supportive).with(other.body);
                        condition.aspect = Some(AspectKind::Sextile);
                        conditions.push(condition);
                    }
                    _ => {}
                }
                if matches!(from_other, 4 | 8) {
                    let mut condition = Condition::new(K::SignTrine, G::Bonification, very).with(other.body);
                    condition.aspect = Some(AspectKind::Trine);
                    conditions.push(condition);
                }
                let limit = close_limit(body, other.body);
                if let Some(close) = close_aspect(planet, other, limit).filter(|c| c.applying != Some(false)) {
                    let conjunction = close.kind == AspectKind::Conjunction;
                    let rating = match (close.applying, close.kind) {
                        (None, _) => None,
                        (_, AspectKind::Sextile) => supportive,
                        _ => very,
                    };
                    let kind = if conjunction { K::Adherence } else { K::Engagement };
                    let mut condition = Condition::new(kind, G::Bonification, rating).with(other.body);
                    condition.aspect = Some(close.kind);
                    condition.orb = Some(close.orb);
                    condition.applying = close.applying;
                    conditions.push(condition);
                }
            }
            // Striking with a ray from a benefic: a backward ray by sextile,
            // square, trine or opposition within 3° of exact, applying or
            // separating. Kept apart from engagement.
            const BENEFIC_RAYS: [AspectKind; 4] = [
                AspectKind::Sextile,
                AspectKind::Square,
                AspectKind::Trine,
                AspectKind::Opposition,
            ];
            for other in others().filter(|other| is_benefic(other.body)) {
                if let Some(ray) = backward_ray(planet, other, &BENEFIC_RAYS) {
                    let rating = if ray.kind == AspectKind::Sextile { supportive } else { very };
                    let mut condition = Condition::new(K::StrikingRay, G::Bonification, rating).with(other.body);
                    condition.aspect = Some(ray.kind);
                    condition.orb = Some(ray.orb);
                    condition.applying = ray.applying;
                    conditions.push(condition);
                }
            }
            if let Some(condition) = enclosure(planet, &planets, [Body::Venus, Body::Jupiter], G::Bonification, very) {
                conditions.extend(condition);
            }

            // Maltreatment by Mars and Saturn.
            for other in others().filter(|other| is_malefic(other.body)) {
                let from_other = signs_forward(other.sign, planet.sign);
                if from_other == 3 {
                    let mut condition =
                        Condition::new(K::ByOvercoming, G::Maltreatment, very_bad).with(other.body);
                    condition.aspect = Some(AspectKind::Square);
                    conditions.push(condition);
                }
                if from_other == 6 {
                    let mut condition =
                        Condition::new(K::SignOpposition, G::Maltreatment, very_bad).with(other.body);
                    condition.aspect = Some(AspectKind::Opposition);
                    conditions.push(condition);
                }
                let limit = close_limit(body, other.body);
                if let Some(close) = close_aspect(planet, other, limit).filter(|c| c.applying != Some(false)) {
                    let conjunction = close.kind == AspectKind::Conjunction;
                    // A sextile or trine is recorded as the relation it is,
                    // without becoming maltreatment.
                    let rating = match (close.applying, close.kind) {
                        (None, _) => None,
                        (_, AspectKind::Sextile | AspectKind::Trine) => None,
                        _ => very_bad,
                    };
                    let kind = if conjunction { K::Adherence } else { K::Engagement };
                    let mut condition = Condition::new(kind, G::Maltreatment, rating).with(other.body);
                    condition.aspect = Some(close.kind);
                    condition.orb = Some(close.orb);
                    condition.applying = close.applying;
                    conditions.push(condition);
                }
                // Striking with a ray: the malefic in the inferior position
                // (later in the zodiac) with a square within 3° of exact.
                if let Some(ray) = backward_ray(planet, other, &[AspectKind::Square]) {
                    let mut condition = Condition::new(K::StrikingRay, G::Maltreatment, very_bad).with(other.body);
                    condition.aspect = Some(AspectKind::Square);
                    condition.orb = Some(ray.orb);
                    condition.applying = ray.applying;
                    conditions.push(condition);
                }
            }
            if let Some(condition) = enclosure(planet, &planets, [Body::Mars, Body::Saturn], G::Maltreatment, very_bad) {
                conditions.extend(condition);
            }

            PlanetCondition {
                body,
                sign: planet.sign,
                house: planet.house,
                house_type: match planet.house % 3 {
                    1 => HouseType::Angular,
                    2 => HouseType::Succedent,
                    _ => HouseType::Cadent,
                },
                sect: planet_sect,
                above_horizon: above,
                phase,
                sun_distance,
                speed: planet.speed,
                retrograde: planet.speed < 0.0,
                speed_status: speed_status(body, planet.speed),
                lords: lords_at(planet.longitude),
                conditions,
            }
        })
        .collect();

    ConditionReport {
        sect,
        overridden: sect_override.is_some(),
        sect_light,
        planets: report,
    }
}

fn close_limit(a: Body, b: Body) -> f64 {
    if a == Body::Moon || b == Body::Moon { MOON_LIMIT } else { CLOSE_LIMIT }
}

/// Enclosure of a planet by a pair, by bodies and by rays, each reported
/// once. A broken enclosure is reported as such, with no rating.
fn enclosure(
    planet: &Planet,
    planets: &[Planet],
    pair: [Body; 2],
    group: ConditionGroup,
    rating: Option<Rating>,
) -> Option<Vec<Condition>> {
    if pair.contains(&planet.body) {
        return None;
    }
    let find = |body: Body| planets.iter().find(|p| p.body == body);
    let (a, b) = (find(pair[0])?, find(pair[1])?);
    let others: Vec<&Planet> = planets
        .iter()
        .filter(|p| p.body != planet.body && !pair.contains(&p.body))
        .collect();
    let mut conditions = Vec::new();
    for bodily in [true, false] {
        let Some(span) = enclosure_span(planet.longitude, a, b, bodily) else {
            continue;
        };
        let breakers = interveners(planet.longitude, span, &others);
        let mut condition = if breakers.is_empty() {
            Condition::new(ConditionKind::Enclosure, group, rating)
        } else {
            Condition::new(ConditionKind::EnclosureBroken, group, None)
        };
        condition.others = pair.to_vec();
        condition.bodily = Some(bodily);
        condition.breakers = breakers;
        conditions.push(condition);
    }
    Some(conditions)
}

// --- Stations ---------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Turn {
    /// The planet stops and turns retrograde.
    Retrograde,
    Direct,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Station {
    pub utc: DateTime<Utc>,
    pub turns: Turn,
}

/// Longest gap searched between two stations (Mars: about 710 days).
const STATION_SEARCH_DAYS: i64 = 900;

fn speed_at(body: Body, at: DateTime<Utc>) -> Result<f64, EphemerisError> {
    Ok(body_longitude_and_speed(ephemeris::julian_day(at)?, body)?.1)
}

/// The nearest station of a body before (`direction` −1) or after (+1) an
/// instant: the moment its speed in longitude changes sign. `None` for the
/// Sun and the Moon, or when none lies within the search span or the
/// ephemeris range.
pub fn station(body: Body, at: DateTime<Utc>, direction: i64) -> Option<Station> {
    if !matches!(
        body,
        Body::Mercury | Body::Venus | Body::Mars | Body::Jupiter | Body::Saturn
    ) {
        return None;
    }
    let start_direct = speed_at(body, at).ok()? >= 0.0;
    let mut near = at;
    for _ in 0..STATION_SEARCH_DAYS {
        let far = near + Duration::days(direction);
        if (speed_at(body, far).ok()? >= 0.0) != start_direct {
            // The sign change lies between `near` and `far`.
            let (mut inside, mut outside) = (near, far);
            while (outside - inside).num_seconds().abs() > 30 {
                let middle = inside + (outside - inside) / 2;
                if (speed_at(body, middle).ok()? >= 0.0) == start_direct {
                    inside = middle;
                } else {
                    outside = middle;
                }
            }
            // Going forward the planet turns away from its present motion;
            // going back, the station found is where that motion began.
            let turns_retrograde = if direction > 0 { start_direct } else { !start_direct };
            return Some(Station {
                utc: inside + (outside - inside) / 2,
                turns: if turns_retrograde { Turn::Retrograde } else { Turn::Direct },
            });
        }
        near = far;
    }
    None
}

/// A station with the clock reading at the birthplace.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StationMoment {
    pub at: Moment,
    pub turns: Turn,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanetStations {
    pub body: Body,
    pub previous: Option<StationMoment>,
    pub next: Option<StationMoment>,
}

/// The last and next station of Mercury to Saturn around an instant,
/// shown in the given time zone.
pub fn planet_stations(at: DateTime<Utc>, zone: &ZoneChoice) -> Vec<PlanetStations> {
    let moment = |found: Option<Station>| {
        let found = found?;
        Some(StationMoment {
            at: Moment::in_zone(found.utc, zone).ok()?,
            turns: found.turns,
        })
    };
    PLANETS
        .into_iter()
        .filter(|body| !matches!(body, Body::Sun | Body::Moon))
        .map(|body| PlanetStations {
            body,
            previous: moment(station(body, at, -1)),
            next: moment(station(body, at, 1)),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chart::{Angle, Angles, BodyPosition, House};
    use crate::zodiac::{ZodiacPoint, whole_sign_house};
    use chrono::TimeZone;
    use ConditionGroup as G;
    use ConditionKind as K;

    /// Mean daily motion, so that faster planets apply to slower ones.
    fn mean_speed(body: Body) -> f64 {
        match body {
            Body::Sun => 0.9856,
            Body::Moon => 13.1764,
            Body::Mercury => 1.3833,
            Body::Venus => 1.2,
            Body::Mars => 0.524,
            Body::Jupiter => 0.0831,
            Body::Saturn => 0.0335,
            _ => 0.01,
        }
    }

    /// Positions that produce no close aspect, enclosure or shared sign
    /// among themselves, used for every planet a test does not place.
    fn default_longitude(body: Body) -> f64 {
        match body {
            Body::Sun => 196.0,      // Libra
            Body::Moon => 175.0,     // Virgo
            Body::Mercury => 224.0,  // Scorpio
            Body::Venus => 251.0,    // Sagittarius
            Body::Mars => 24.0,      // Aries
            Body::Jupiter => 100.0,  // Cancer
            Body::Saturn => 320.0,   // Aquarius
            Body::Uranus => 5.0,
            Body::Neptune => 65.0,
            Body::Pluto => 125.0,
            Body::NorthNode => 185.0,
            Body::SouthNode => 5.0,
        }
    }

    /// A chart with the given ascendant and placements `(body, longitude, speed)`.
    fn chart_with(ascendant: f64, placed: &[(Body, f64, f64)]) -> Chart {
        let rising = Sign::from_longitude(ascendant);
        let positions = Body::ALL
            .into_iter()
            .map(|body| {
                let (longitude, speed) = placed
                    .iter()
                    .find(|(b, _, _)| *b == body)
                    .map(|(_, longitude, speed)| (*longitude, *speed))
                    .unwrap_or((default_longitude(body), mean_speed(body)));
                let point = ZodiacPoint::new(longitude);
                BodyPosition {
                    body,
                    point,
                    latitude: 0.0,
                    speed,
                    retrograde: speed < 0.0,
                    house: whole_sign_house(point.sign, rising),
                }
            })
            .collect::<Vec<_>>();
        let angle = |longitude: f64| {
            let point = ZodiacPoint::new(longitude);
            Angle {
                point,
                house: whole_sign_house(point.sign, rising),
            }
        };
        let sun = positions[0].point.longitude;
        Chart {
            utc: Utc.with_ymd_and_hms(2000, 1, 1, 12, 0, 0).unwrap(),
            julian_day: 2_451_545.0,
            latitude: 55.0,
            longitude: 12.0,
            positions,
            angles: Angles {
                ascendant: angle(ascendant),
                descendant: angle(ascendant + 180.0),
                midheaven: angle(ascendant + 270.0),
                imum_coeli: angle(ascendant + 90.0),
            },
            houses: std::array::from_fn(|i| {
                let sign = Sign::ALL[(rising.index() + i) % 12];
                House {
                    number: i as u8 + 1,
                    sign,
                    ruler: sign.ruler(),
                }
            }),
            sect: crate::chart::sect_from_sun(sun, ascendant),
        }
    }

    /// Placements at mean speed.
    fn chart_at(ascendant: f64, placed: &[(Body, f64)]) -> Chart {
        let placed: Vec<_> = placed.iter().map(|(b, l)| (*b, *l, mean_speed(*b))).collect();
        chart_with(ascendant, &placed)
    }

    fn report(chart: &Chart) -> ConditionReport {
        condition_report(chart, None, &ConditionOptions::default())
    }

    fn planet(report: &ConditionReport, body: Body) -> &PlanetCondition {
        report.planets.iter().find(|p| p.body == body).unwrap()
    }

    fn find<'a>(
        report: &'a ConditionReport,
        body: Body,
        group: ConditionGroup,
        kind: ConditionKind,
    ) -> Vec<&'a Condition> {
        planet(report, body)
            .conditions
            .iter()
            .filter(|c| c.group == group && c.kind == kind)
            .collect()
    }

    fn has(report: &ConditionReport, body: Body, group: ConditionGroup, kind: ConditionKind) -> bool {
        !find(report, body, group, kind).is_empty()
    }

    // 0° of each sign.
    const ARIES: f64 = 0.0;
    const TAURUS: f64 = 30.0;
    const GEMINI: f64 = 60.0;
    const CANCER: f64 = 90.0;
    const LEO: f64 = 120.0;
    const VIRGO: f64 = 150.0;
    const LIBRA: f64 = 180.0;
    const SCORPIO: f64 = 210.0;
    const SAGITTARIUS: f64 = 240.0;
    const CAPRICORN: f64 = 270.0;
    const AQUARIUS: f64 = 300.0;
    const PISCES: f64 = 330.0;

    #[test]
    fn the_default_placements_are_quiet() {
        let r = report(&chart_at(ARIES, &[]));
        for p in &r.planets {
            for c in &p.conditions {
                assert!(
                    !matches!(
                        c.kind,
                        K::Engagement | K::Adherence | K::StrikingRay | K::Enclosure | K::EnclosureBroken | K::Copresence
                    ),
                    "{:?} has {:?}",
                    p.body,
                    c
                );
            }
        }
    }

    #[test]
    fn only_the_seven_traditional_planets_take_part() {
        // Uranus stands between Venus and Saturn, inside the enclosure.
        let chart = chart_at(
            ARIES,
            &[
                (Body::Venus, 100.0),
                (Body::Mars, 96.0),
                (Body::Saturn, 105.0),
                (Body::Uranus, 102.0),
                (Body::Moon, 50.0),
                (Body::Sun, 115.0),
                (Body::Mercury, 118.0),
                (Body::Jupiter, 55.0),
            ],
        );
        let r = report(&chart);
        assert_eq!(r.planets.iter().map(|p| p.body).collect::<Vec<_>>(), PLANETS);
        for p in &r.planets {
            for c in &p.conditions {
                assert!(c.others.iter().all(|o| PLANETS.contains(o)));
                assert!(c.breakers.iter().all(|b| PLANETS.contains(&b.body)));
            }
        }
        // Uranus does not break the enclosure either.
        assert!(has(&r, Body::Venus, G::Maltreatment, K::Enclosure));
    }

    #[test]
    fn egyptian_bounds_and_their_boundaries() {
        assert_eq!(bound_lord(ARIES), Body::Jupiter);
        assert_eq!(bound_lord(ARIES + 5.999), Body::Jupiter);
        // Exactly on a boundary: the new bound.
        assert_eq!(bound_lord(ARIES + 6.0), Body::Venus);
        assert_eq!(bound_lord(ARIES + 29.9), Body::Saturn);
        assert_eq!(bound_lord(TAURUS), Body::Venus);
        assert_eq!(bound_lord(LEO + 11.0), Body::Saturn);
        assert_eq!(bound_lord(SAGITTARIUS + 11.99), Body::Jupiter);
        assert_eq!(bound_lord(PISCES + 28.0), Body::Saturn);
        assert_eq!(bound_lord(360.0), Body::Jupiter);
    }

    #[test]
    fn every_sign_has_five_bounds_shared_by_the_five_planets() {
        for sign in BOUNDS {
            assert_eq!(sign[4].0, 30);
            assert!(sign.windows(2).all(|w| w[0].0 < w[1].0));
            for body in [Body::Mercury, Body::Venus, Body::Mars, Body::Jupiter, Body::Saturn] {
                assert_eq!(sign.iter().filter(|(_, lord)| *lord == body).count(), 1);
            }
        }
        // Each planet's bounds add up to its "greater years".
        let total = |body: Body| -> u32 {
            BOUNDS
                .iter()
                .map(|sign| {
                    let mut start = 0;
                    let mut sum = 0;
                    for (end, lord) in sign {
                        if *lord == body {
                            sum += (*end - start) as u32;
                        }
                        start = *end;
                    }
                    sum
                })
                .sum()
        };
        assert_eq!(total(Body::Saturn), 57);
        assert_eq!(total(Body::Jupiter), 79);
        assert_eq!(total(Body::Mars), 66);
        assert_eq!(total(Body::Venus), 82);
        assert_eq!(total(Body::Mercury), 76);
    }

    #[test]
    fn chaldean_decans() {
        assert_eq!(decan_lord(ARIES), Body::Mars);
        assert_eq!(decan_lord(ARIES + 10.0), Body::Sun);
        assert_eq!(decan_lord(ARIES + 20.0), Body::Venus);
        assert_eq!(decan_lord(TAURUS), Body::Mercury);
        assert_eq!(decan_lord(GEMINI + 5.0), Body::Jupiter);
        assert_eq!(decan_lord(PISCES + 29.9), Body::Mars);
    }

    #[test]
    fn dignities_are_very_supportive_and_the_decan_has_no_rating() {
        // Mars at 2° Aries: domicile and own decan, in Jupiter's bounds.
        let r = report(&chart_at(ARIES, &[(Body::Mars, ARIES + 2.0)]));
        let mars = planet(&r, Body::Mars);
        let rating = |kind| mars.conditions.iter().find(|c| c.kind == kind).map(|c| c.rating);
        assert_eq!(rating(K::Domicile), Some(Some(Rating::VerySupportive)));
        assert_eq!(rating(K::Decan), Some(None));
        assert_eq!(rating(K::Bounds), None);
        let r = report(&chart_at(ARIES, &[(Body::Mars, ARIES + 22.0)]));
        assert_eq!(
            find(&r, Body::Mars, G::Dignities, K::Bounds)[0].rating,
            Some(Rating::VerySupportive)
        );
        // Sun in Aries: exalted, and day lord of the fire triplicity.
        let r = report(&chart_at(ARIES, &[(Body::Sun, ARIES + 19.0)]));
        assert!(has(&r, Body::Sun, G::Dignities, K::Exaltation));
        // Saturn in Aries: fall, participating triplicity lord.
        let r = report(&chart_at(ARIES, &[(Body::Saturn, ARIES + 15.0)]));
        assert_eq!(
            find(&r, Body::Saturn, G::Dignities, K::Fall)[0].rating,
            Some(Rating::Challenging)
        );
        // Venus in Aries: detriment.
        let r = report(&chart_at(ARIES, &[(Body::Venus, ARIES + 15.0)]));
        assert_eq!(
            find(&r, Body::Venus, G::Dignities, K::Detriment)[0].rating,
            Some(Rating::Challenging)
        );
    }

    #[test]
    fn all_three_triplicity_lords_rate_the_same_and_show_their_role() {
        let cases = [
            (Body::Sun, TriplicityRole::Day),
            (Body::Jupiter, TriplicityRole::Night),
            (Body::Saturn, TriplicityRole::Participating),
        ];
        for (body, role) in cases {
            let r = report(&chart_at(ARIES, &[(body, LEO + 15.0)]));
            let found = find(&r, body, G::Dignities, K::Triplicity);
            assert_eq!(found[0].rating, Some(Rating::VerySupportive));
            assert_eq!(found[0].triplicity_role, Some(role));
        }
    }

    #[test]
    fn sun_distances_are_inclusive() {
        let at = |distance: f64| {
            let r = report(&chart_at(ARIES, &[(Body::Sun, 200.0), (Body::Mars, 200.0 + distance)]));
            planet(&r, Body::Mars)
                .conditions
                .iter()
                .find(|c| c.group == G::Sun)
                .map(|c| c.kind)
        };
        assert_eq!(at(0.5), Some(K::Cazimi));
        assert_eq!(at(1.0), Some(K::Cazimi));
        assert_eq!(at(1.01), Some(K::Combust));
        assert_eq!(at(8.0), Some(K::Combust));
        assert_eq!(at(-8.0), Some(K::Combust));
        assert_eq!(at(8.01), Some(K::UnderBeams));
        assert_eq!(at(15.0), Some(K::UnderBeams));
        assert_eq!(at(15.01), None);
    }

    #[test]
    fn cazimi_combust_and_beams_each_have_their_own_rating() {
        // Mercury in Aquarius, outside its own bounds: no chariot.
        let rating = |distance: f64| {
            let r = report(&chart_at(ARIES, &[(Body::Sun, 310.0), (Body::Mercury, 310.0 + distance)]));
            let p = planet(&r, Body::Mercury);
            let found: Vec<_> = p.conditions.iter().filter(|c| c.group == G::Sun).collect();
            assert_eq!(found.len(), 1, "{found:?}");
            (found[0].kind, found[0].rating)
        };
        assert_eq!(rating(0.5), (K::Cazimi, Some(Rating::VerySupportive)));
        assert_eq!(rating(5.0), (K::Combust, Some(Rating::VeryChallenging)));
        assert_eq!(rating(12.0), (K::UnderBeams, Some(Rating::Challenging)));
    }

    #[test]
    fn sun_limits_follow_the_settings() {
        let chart = chart_at(ARIES, &[(Body::Sun, 200.0), (Body::Mars, 210.0)]);
        let options = ConditionOptions {
            cazimi: 1.0,
            combust: 12.0,
            beams: 17.0,
        };
        let r = condition_report(&chart, None, &options);
        assert!(has(&r, Body::Mars, G::Sun, K::Combust));
    }

    #[test]
    fn the_sun_distance_works_across_the_aries_point() {
        let r = report(&chart_at(ARIES, &[(Body::Sun, 357.0), (Body::Saturn, 2.0)]));
        let found = find(&r, Body::Saturn, G::Sun, K::Combust);
        assert!((found[0].orb.unwrap() - 5.0).abs() < 1e-9);
        assert_eq!(found[0].rating, Some(Rating::VeryChallenging));
    }

    #[test]
    fn chariot_hides_the_negative_rating_but_keeps_the_solar_phase() {
        // Mars at 5° Aries (domicile), Sun at 9° Aries: combust.
        let r = report(&chart_at(ARIES, &[(Body::Sun, 9.0), (Body::Mars, 5.0)]));
        let combust = find(&r, Body::Mars, G::Sun, K::Combust);
        assert_eq!(combust.len(), 1);
        assert_eq!(combust[0].rating, None);
        assert!(combust[0].suppressed);
        let chariot = find(&r, Body::Mars, G::Sun, K::Chariot);
        assert_eq!(chariot[0].rating, Some(Rating::VerySupportive));
        assert_eq!(chariot[0].dignities, vec![Dignity::Domicile]);
        assert!((planet(&r, Body::Mars).sun_distance.unwrap() - 4.0).abs() < 1e-9);

        // Under the beams with own bounds only (Venus 8° Aries, bounds 6–12).
        let r = report(&chart_at(ARIES, &[(Body::Sun, 20.0), (Body::Venus, 8.0)]));
        assert!(find(&r, Body::Venus, G::Sun, K::UnderBeams)[0].suppressed);
        assert_eq!(find(&r, Body::Venus, G::Sun, K::Chariot)[0].dignities, vec![Dignity::Bounds]);
    }

    #[test]
    fn triplicity_alone_gives_no_chariot() {
        // Jupiter at 20° Aries: night triplicity lord, not its bounds (Mars).
        let r = report(&chart_at(ARIES, &[(Body::Sun, 25.0), (Body::Jupiter, 20.5)]));
        assert!(has(&r, Body::Jupiter, G::Dignities, K::Triplicity));
        assert!(!has(&r, Body::Jupiter, G::Sun, K::Chariot));
        assert_eq!(
            find(&r, Body::Jupiter, G::Sun, K::Combust)[0].rating,
            Some(Rating::VeryChallenging)
        );
    }

    #[test]
    fn houses_fortunate_unfortunate_and_angular_are_separate_facts() {
        let kinds = |house_start: f64| {
            let r = report(&chart_at(ARIES, &[(Body::Saturn, house_start + 15.0)]));
            planet(&r, Body::Saturn)
                .conditions
                .iter()
                .filter(|c| c.group == G::Houses)
                .map(|c| (c.kind, c.rating))
                .collect::<Vec<_>>()
        };
        let good = Some(Rating::Supportive);
        let bad = Some(Rating::Challenging);
        // House 1: angular and fortunate.
        assert_eq!(kinds(ARIES), vec![(K::HouseAngular, good), (K::HouseFortunate, good)]);
        // House 4: angular and fortunate.
        assert_eq!(kinds(CANCER), vec![(K::HouseAngular, good), (K::HouseFortunate, good)]);
        // House 11 is fortunate.
        assert_eq!(kinds(AQUARIUS), vec![(K::HouseFortunate, good)]);
        for start in [TAURUS, VIRGO, SCORPIO, PISCES] {
            assert_eq!(kinds(start), vec![(K::HouseUnfortunate, bad)]);
        }
        for start in [GEMINI, LEO, SAGITTARIUS] {
            assert_eq!(kinds(start), vec![(K::HouseFortunate, good)]);
        }
    }

    #[test]
    fn near_an_angle_counts_at_exactly_three_degrees_whatever_the_house() {
        // Ascendant 1° Aries; Saturn at 28° Pisces is 3° away, in house 12.
        let r = report(&chart_at(1.0, &[(Body::Saturn, 358.0)]));
        let near = find(&r, Body::Saturn, G::Houses, K::NearAngle);
        assert_eq!(near[0].angle, Some(AngleName::Ascendant));
        assert!(has(&r, Body::Saturn, G::Houses, K::HouseUnfortunate));
        let r = report(&chart_at(1.0, &[(Body::Saturn, 357.9)]));
        assert!(!has(&r, Body::Saturn, G::Houses, K::NearAngle));
    }

    #[test]
    fn copresence_is_rated_by_the_sect_of_the_benefic_or_malefic() {
        // The Sun stays at 196°: above the horizon with 0° rising, below it
        // with 176° rising.
        let rating = |ascendant: f64, other: Body| {
            let chart = chart_at(ascendant, &[(Body::Moon, GEMINI + 2.0), (other, GEMINI + 25.0)]);
            let r = report(&chart);
            find(&r, Body::Moon, G::Copresence, K::Copresence)[0].rating
        };
        let (day, night) = (ARIES, 176.0);
        assert_eq!(report(&chart_at(night, &[])).sect, Sect::Night);
        assert_eq!(report(&chart_at(day, &[])).sect, Sect::Day);
        assert_eq!(rating(day, Body::Jupiter), Some(Rating::VerySupportive));
        assert_eq!(rating(day, Body::Venus), Some(Rating::Supportive));
        assert_eq!(rating(day, Body::Saturn), Some(Rating::Challenging));
        assert_eq!(rating(day, Body::Mars), Some(Rating::VeryChallenging));
        assert_eq!(rating(night, Body::Venus), Some(Rating::VerySupportive));
        assert_eq!(rating(night, Body::Jupiter), Some(Rating::Supportive));
        assert_eq!(rating(night, Body::Mars), Some(Rating::Challenging));
        assert_eq!(rating(night, Body::Saturn), Some(Rating::VeryChallenging));
        // Other planets: a fact without a rating. No orb is needed.
        assert_eq!(rating(day, Body::Mercury), None);
    }

    #[test]
    fn copresence_names_the_pair_by_their_sects_to_each_other() {
        // `planet` and `other` together in Gemini; the Sun stays at 196°.
        let same = |ascendant: f64, planet_body: Body, other: Body| {
            let chart = chart_at(ascendant, &[(planet_body, GEMINI + 2.0), (other, GEMINI + 25.0)]);
            let r = report(&chart);
            let found = find(&r, planet_body, G::Copresence, K::Copresence);
            let c = found.iter().find(|c| c.others == vec![other]).unwrap();
            (c.same_sect, c.rating)
        };
        for ascendant in [ARIES, 176.0] {
            // Day and night charts alike: the chart's sect plays no part.
            assert_eq!(same(ascendant, Body::Saturn, Body::Venus).0, Some(false));
            assert_eq!(same(ascendant, Body::Venus, Body::Saturn).0, Some(false));
            assert_eq!(same(ascendant, Body::Venus, Body::Mars).0, Some(true));
            assert_eq!(same(ascendant, Body::Saturn, Body::Jupiter).0, Some(true));
            assert_eq!(same(ascendant, Body::Moon, Body::Jupiter).0, Some(false));
            // The other planet is neither benefic nor malefic: nothing to name.
            assert_eq!(same(ascendant, Body::Venus, Body::Moon), (None, None));
        }
        // The rating still follows the chart's sect.
        assert_eq!(same(ARIES, Body::Venus, Body::Saturn).1, Some(Rating::Challenging));
        assert_eq!(same(176.0, Body::Venus, Body::Saturn).1, Some(Rating::VeryChallenging));
        // Mercury as evening star (after the Sun at 196°) is nocturnal, like Mars.
        let mercury = |longitude: f64| {
            let chart = chart_at(ARIES, &[(Body::Mercury, longitude), (Body::Mars, 215.0)]);
            let r = report(&chart);
            find(&r, Body::Mercury, G::Copresence, K::Copresence)
                .iter()
                .find(|c| c.others == vec![Body::Mars])
                .unwrap()
                .same_sect
        };
        assert_eq!(mercury(212.0), Some(true));
    }

    #[test]
    fn domicile_lord_witness_copresent_and_aversion() {
        // Moon in Gemini; its lord is Mercury.
        let lord = |mercury: f64| {
            let r = report(&chart_at(ARIES, &[(Body::Moon, GEMINI + 10.0), (Body::Mercury, mercury)]));
            planet(&r, Body::Moon)
                .conditions
                .iter()
                .find(|c| c.group == G::DomicileLord)
                .map(|c| (c.kind, c.rating, c.aspect))
                .unwrap()
        };
        let good = Some(Rating::Supportive);
        assert_eq!(lord(GEMINI + 29.0), (K::LordCopresent, good, None));
        assert_eq!(lord(LEO + 1.0), (K::LordWitness, good, Some(AspectKind::Sextile)));
        assert_eq!(lord(PISCES + 1.0), (K::LordWitness, good, Some(AspectKind::Square)));
        assert_eq!(lord(LIBRA + 1.0), (K::LordWitness, good, Some(AspectKind::Trine)));
        assert_eq!(lord(SAGITTARIUS + 1.0), (K::LordWitness, good, Some(AspectKind::Opposition)));
        for averse in [TAURUS, CANCER, SCORPIO, CAPRICORN] {
            assert_eq!(lord(averse + 1.0), (K::LordAversion, Some(Rating::Challenging), None));
        }
        // A planet in its own domicile has no lord condition.
        let r = report(&chart_at(ARIES, &[(Body::Mercury, GEMINI + 3.0)]));
        assert!(planet(&r, Body::Mercury).conditions.iter().all(|c| c.group != G::DomicileLord));
    }

    #[test]
    fn a_lord_in_an_unfortunate_house_gives_no_counteraction() {
        // Moon in Gemini, Mercury in house 12 (Pisces) with Aries rising.
        let r = report(&chart_at(ARIES, &[(Body::Moon, GEMINI + 10.0), (Body::Mercury, PISCES + 5.0)]));
        let moon = planet(&r, Body::Moon);
        assert!(moon
            .conditions
            .iter()
            .filter(|c| c.others == vec![Body::Mercury])
            .all(|c| matches!(c.group, G::DomicileLord | G::Reception | G::Overcoming)));
    }

    #[test]
    fn reception_by_all_five_dignities_and_mutual_domicile_reception() {
        // Mars in Taurus (Venus's domicile), Venus in Aries (Mars's domicile).
        let r = report(&chart_at(ARIES, &[(Body::Mars, TAURUS + 10.0), (Body::Venus, ARIES + 23.0)]));
        let mutual = find(&r, Body::Mars, G::Reception, K::MutualReception);
        let with_venus = mutual.iter().find(|c| c.others == vec![Body::Venus]).unwrap();
        assert_eq!(with_venus.rating, Some(Rating::Supportive));
        assert!(with_venus.dignities.contains(&Dignity::Domicile));
        assert!(with_venus.return_dignities.contains(&Dignity::Domicile));

        // One-sided: Moon at 3° Aries is received by Mars (domicile, decan),
        // the Sun (exaltation, triplicity) and Jupiter (triplicity, bounds).
        let r = report(&chart_at(CANCER, &[(Body::Moon, ARIES + 3.0)]));
        let by = |other: Body| {
            planet(&r, Body::Moon)
                .conditions
                .iter()
                .find(|c| c.group == G::Reception && c.others == vec![other])
                .map(|c| (c.dignities.clone(), c.rating))
        };
        assert_eq!(by(Body::Mars), Some((vec![Dignity::Domicile, Dignity::Decan], None)));
        assert_eq!(by(Body::Sun), Some((vec![Dignity::Exaltation, Dignity::Triplicity], None)));
        assert_eq!(by(Body::Jupiter), Some((vec![Dignity::Triplicity, Dignity::Bounds], None)));
        assert_eq!(by(Body::Venus), None);
    }

    #[test]
    fn overcoming_is_the_right_hand_sextile_square_or_trine_by_sign() {
        // Jupiter in Leo; the other planet 2, 3 and 4 signs later.
        for (sign, aspect) in [
            (LIBRA, AspectKind::Sextile),
            (SCORPIO, AspectKind::Square),
            (SAGITTARIUS, AspectKind::Trine),
        ] {
            // The degrees are far from any degree-based aspect on purpose.
            let r = report(&chart_at(ARIES, &[(Body::Jupiter, LEO + 1.0), (Body::Moon, sign + 28.0)]));
            let overcomes = find(&r, Body::Jupiter, G::Overcoming, K::Overcomes);
            let moon = overcomes.iter().find(|c| c.others == vec![Body::Moon]).unwrap();
            assert_eq!(moon.aspect, Some(aspect));
            let by = find(&r, Body::Moon, G::Overcoming, K::OvercomeBy);
            assert!(by.iter().any(|c| c.others == vec![Body::Jupiter] && c.aspect == Some(aspect)));
            // The Moon does not overcome Jupiter.
            assert!(!find(&r, Body::Moon, G::Overcoming, K::Overcomes)
                .iter()
                .any(|c| c.others == vec![Body::Jupiter]));
        }
        // An opposition is not overcoming.
        let r = report(&chart_at(ARIES, &[(Body::Jupiter, LEO + 1.0), (Body::Moon, AQUARIUS + 28.0)]));
        assert!(!find(&r, Body::Moon, G::Overcoming, K::OvercomeBy)
            .iter()
            .any(|c| c.others == vec![Body::Jupiter]));
    }

    #[test]
    fn the_supplements_example_jupiter_leo_mars_scorpio() {
        let chart = chart_at(ARIES, &[(Body::Jupiter, LEO + 18.0), (Body::Mars, SCORPIO + 17.0)]);
        let r = report(&chart);
        // Jupiter overcomes Mars by the right-hand square (Upon the Tenth).
        let overcomes = find(&r, Body::Jupiter, G::Overcoming, K::Overcomes);
        assert!(overcomes
            .iter()
            .any(|c| c.others == vec![Body::Mars] && c.aspect == Some(AspectKind::Square)));
        // Mars, in the inferior position, strikes Jupiter with a ray 1° from exact.
        let strike = find(&r, Body::Jupiter, G::Maltreatment, K::StrikingRay);
        assert_eq!(strike.len(), 1);
        assert_eq!(strike[0].others, vec![Body::Mars]);
        assert!((strike[0].orb.unwrap() - 1.0).abs() < 1e-9);
        assert_eq!(strike[0].rating, Some(Rating::VeryChallenging));
        // Mars is bonified by being overcome by Jupiter's square.
        let bonified = find(&r, Body::Mars, G::Bonification, K::ByOvercoming);
        assert_eq!(bonified[0].rating, Some(Rating::VerySupportive));
        // The two relations are distinct: Jupiter is not maltreated by overcoming.
        assert!(!has(&r, Body::Jupiter, G::Maltreatment, K::ByOvercoming));
    }

    #[test]
    fn striking_with_a_ray_needs_the_inferior_position_and_three_degrees() {
        let strikes = |saturn: f64| {
            let r = report(&chart_at(ARIES, &[(Body::Moon, GEMINI + 10.0), (Body::Saturn, saturn)]));
            has(&r, Body::Moon, G::Maltreatment, K::StrikingRay)
        };
        // Saturn 90° later in the zodiac: inferior position.
        assert!(strikes(VIRGO + 10.0));
        assert!(strikes(VIRGO + 13.0));
        assert!(strikes(VIRGO + 7.0));
        assert!(!strikes(VIRGO + 13.1));
        // Saturn 90° earlier: superior position, no striking.
        assert!(!strikes(PISCES + 10.0));
    }

    /// Jupiter's ray to the Moon at 10° Gemini; Venus is kept out of the way.
    fn jupiter_ray(jupiter: f64) -> Option<(AspectKind, Option<Rating>, Option<bool>)> {
        let chart = chart_at(
            ARIES,
            &[(Body::Moon, GEMINI + 10.0), (Body::Jupiter, jupiter), (Body::Venus, AQUARIUS)],
        );
        let r = report(&chart);
        find(&r, Body::Moon, G::Bonification, K::StrikingRay)
            .first()
            .map(|c| (c.aspect.unwrap(), c.rating, c.applying))
    }

    #[test]
    fn a_benefic_strikes_with_a_backward_ray_by_four_aspects() {
        let very = Some(Rating::VerySupportive);
        // Jupiter later in the zodiac: its ray goes backwards to the Moon.
        // The Moon moves towards the exact aspect, so each is applying.
        assert_eq!(jupiter_ray(LEO + 11.0), Some((AspectKind::Sextile, Some(Rating::Supportive), Some(true))));
        assert_eq!(jupiter_ray(VIRGO + 11.0), Some((AspectKind::Square, very, Some(true))));
        assert_eq!(jupiter_ray(LIBRA + 11.0), Some((AspectKind::Trine, very, Some(true))));
        assert_eq!(jupiter_ray(SAGITTARIUS + 11.0), Some((AspectKind::Opposition, very, Some(true))));
        // Jupiter earlier in the zodiac: a forward ray, not recorded.
        assert_eq!(jupiter_ray(ARIES + 10.0), None);
        assert_eq!(jupiter_ray(PISCES + 10.0), None);
        assert_eq!(jupiter_ray(AQUARIUS + 10.0), None);
    }

    #[test]
    fn a_benefic_ray_counts_to_three_degrees_applying_or_separating() {
        assert!(jupiter_ray(VIRGO + 13.0).is_some());
        assert!(jupiter_ray(VIRGO + 7.0).is_some());
        assert!(jupiter_ray(VIRGO + 13.1).is_none());
        assert!(jupiter_ray(VIRGO + 6.9).is_none());
        // The Moon has passed the exact square: separating, still recorded.
        assert_eq!(
            jupiter_ray(VIRGO + 9.0),
            Some((AspectKind::Square, Some(Rating::VerySupportive), Some(false)))
        );
        // An opposition counts from either side of exact.
        assert_eq!(jupiter_ray(SAGITTARIUS + 8.0).map(|r| r.2), Some(Some(false)));
    }

    #[test]
    fn a_benefic_ray_and_engagement_are_recorded_separately_once_each() {
        let chart = chart_at(
            ARIES,
            &[(Body::Sun, GEMINI + 10.0), (Body::Jupiter, VIRGO + 11.0), (Body::Venus, AQUARIUS)],
        );
        let r = report(&chart);
        assert_eq!(find(&r, Body::Sun, G::Bonification, K::StrikingRay).len(), 1);
        assert_eq!(find(&r, Body::Sun, G::Bonification, K::Engagement).len(), 1);
    }

    #[test]
    fn speed_is_retro_slow_or_fast_against_the_reference() {
        assert_eq!(speed_status(Body::Sun, 59.16 / 60.0), Some(SpeedStatus::Fast));
        assert_eq!(speed_status(Body::Sun, 59.15 / 60.0), Some(SpeedStatus::Slow));
        assert_eq!(speed_status(Body::Moon, 13.2), Some(SpeedStatus::Fast));
        assert_eq!(speed_status(Body::Moon, 13.1), Some(SpeedStatus::Slow));
        assert_eq!(speed_status(Body::Mars, 0.6), Some(SpeedStatus::Fast));
        assert_eq!(speed_status(Body::Jupiter, 0.05), Some(SpeedStatus::Slow));
        assert_eq!(speed_status(Body::Saturn, 0.034), Some(SpeedStatus::Fast));
        // Retrograde: Retro whatever the numeric speed.
        assert_eq!(speed_status(Body::Mercury, -1.2), Some(SpeedStatus::Retro));
        assert_eq!(speed_status(Body::Venus, -0.01), Some(SpeedStatus::Retro));
        // The outer planets are not classified.
        assert_eq!(speed_status(Body::Uranus, 0.05), None);
        let r = report(&chart_with(ARIES, &[(Body::Mercury, 224.0, -0.5)]));
        assert_eq!(planet(&r, Body::Mercury).speed_status, Some(SpeedStatus::Retro));
        assert_eq!(planet(&r, Body::Mars).speed_status, Some(SpeedStatus::Slow));
    }

    #[test]
    fn mercury_rejoices_as_morning_star_by_day_and_evening_star_by_night() {
        // Sun at 196°, above the horizon with Aries rising: a day chart.
        let morning = chart_at(ARIES, &[(Body::Mercury, 180.0)]);
        let evening = chart_at(ARIES, &[(Body::Mercury, 215.0)]);
        let joy = |chart: &Chart, sect: Option<Sect>| {
            let r = condition_report(chart, sect, &ConditionOptions::default());
            has(&r, Body::Mercury, G::Joys, K::JoySolarPhase)
        };
        assert!(joy(&morning, None));
        assert!(!joy(&evening, None));
        assert!(!joy(&morning, Some(Sect::Night)));
        assert!(joy(&evening, Some(Sect::Night)));
        // Exactly conjunct the Sun: undetermined, no joy either way.
        let conjunct = chart_at(ARIES, &[(Body::Mercury, 196.0)]);
        assert!(!joy(&conjunct, None));
        assert!(!joy(&conjunct, Some(Sect::Night)));
    }

    #[test]
    fn the_four_joys_are_supportive() {
        let chart = chart_at(ARIES, &[(Body::Jupiter, AQUARIUS + 5.0)]);
        let r = report(&chart);
        // Jupiter in house 11, above the horizon by day, in a masculine sign.
        for kind in [K::JoyHouse, K::JoyHemisphere, K::JoySignPolarity] {
            assert_eq!(find(&r, Body::Jupiter, G::Joys, kind)[0].rating, Some(Rating::Supportive));
        }
    }

    #[test]
    fn a_malefic_superior_square_is_maltreatment_in_any_house() {
        // Saturn in Gemini overcomes the Moon in Virgo by square. With
        // Aries rising Saturn is in house 3, with Scorpio rising in house 8.
        for ascendant in [ARIES, SCORPIO] {
            let r = report(&chart_at(ascendant, &[(Body::Saturn, GEMINI + 2.0), (Body::Moon, VIRGO + 25.0)]));
            let found = find(&r, Body::Moon, G::Maltreatment, K::ByOvercoming);
            assert_eq!(found[0].others, vec![Body::Saturn]);
            assert_eq!(found[0].rating, Some(Rating::VeryChallenging));
        }
    }

    #[test]
    fn a_malefic_superior_sextile_or_trine_is_overcoming_only() {
        for sign in [LEO, LIBRA] {
            let r = report(&chart_at(ARIES, &[(Body::Saturn, GEMINI + 2.0), (Body::Moon, sign + 25.0)]));
            assert!(has(&r, Body::Moon, G::Overcoming, K::OvercomeBy));
            assert!(!has(&r, Body::Moon, G::Maltreatment, K::ByOvercoming));
        }
    }

    #[test]
    fn benefic_superior_aspects() {
        let r = report(&chart_at(ARIES, &[(Body::Jupiter, GEMINI + 2.0), (Body::Moon, LEO + 25.0)]));
        let sextile = find(&r, Body::Moon, G::Bonification, K::SuperiorSextile);
        assert_eq!(sextile[0].rating, Some(Rating::Supportive));
        assert!(!has(&r, Body::Moon, G::Bonification, K::ByOvercoming));
        for sign in [VIRGO, LIBRA] {
            let r = report(&chart_at(ARIES, &[(Body::Jupiter, GEMINI + 2.0), (Body::Moon, sign + 25.0)]));
            assert_eq!(
                find(&r, Body::Moon, G::Bonification, K::ByOvercoming)[0].rating,
                Some(Rating::VerySupportive)
            );
        }
    }

    #[test]
    fn sign_trines_from_benefics_count_from_both_sides_and_oppositions_from_malefics() {
        for sign in [LIBRA, AQUARIUS] {
            let r = report(&chart_at(ARIES, &[(Body::Venus, GEMINI + 2.0), (Body::Moon, sign + 25.0)]));
            assert_eq!(
                find(&r, Body::Moon, G::Bonification, K::SignTrine)[0].rating,
                Some(Rating::VerySupportive)
            );
        }
        let r = report(&chart_at(ARIES, &[(Body::Mars, GEMINI + 2.0), (Body::Moon, SAGITTARIUS + 25.0)]));
        assert_eq!(
            find(&r, Body::Moon, G::Maltreatment, K::SignOpposition)[0].rating,
            Some(Rating::VeryChallenging)
        );
        // A trine from a malefic and an opposition from a benefic are neither.
        let r = report(&chart_at(ARIES, &[(Body::Mars, GEMINI + 2.0), (Body::Moon, LIBRA + 25.0)]));
        assert!(!has(&r, Body::Moon, G::Maltreatment, K::SignTrine));
        let r = report(&chart_at(ARIES, &[(Body::Venus, GEMINI + 2.0), (Body::Moon, SAGITTARIUS + 25.0)]));
        assert!(!has(&r, Body::Moon, G::Bonification, K::SignOpposition));
    }

    /// The Sun applying to Saturn by the given aspect angle and orb.
    fn sun_saturn(angle: f64, orb: f64) -> ConditionReport {
        // Saturn ahead; the faster Sun closes the gap.
        report(&chart_at(ARIES, &[(Body::Sun, 150.0), (Body::Saturn, 150.0 + angle + orb)]))
    }

    #[test]
    fn engagement_and_adherence_include_exactly_three_degrees() {
        let engaged = |orb: f64| has(&sun_saturn(90.0, orb), Body::Sun, G::Maltreatment, K::Engagement);
        assert!(engaged(3.0));
        assert!(engaged(0.0));
        assert!(!engaged(3.01));
        let adheres = |orb: f64| has(&sun_saturn(0.0, orb), Body::Sun, G::Maltreatment, K::Adherence);
        assert!(adheres(3.0));
        assert!(adheres(0.0));
        assert!(!adheres(3.01));
    }

    #[test]
    fn the_moon_has_thirteen_degrees() {
        let engaged = |orb: f64| {
            let chart = chart_at(ARIES, &[(Body::Moon, 100.0), (Body::Saturn, 190.0 + orb)]);
            has(&report(&chart), Body::Moon, G::Maltreatment, K::Engagement)
        };
        assert!(engaged(13.0));
        assert!(!engaged(13.01));
        // The limit also holds seen from the other planet.
        let chart = chart_at(ARIES, &[(Body::Moon, 100.0), (Body::Venus, 110.0)]);
        let r = report(&chart);
        assert!(has(&r, Body::Moon, G::Bonification, K::Adherence));
    }

    #[test]
    fn a_separating_aspect_is_not_engagement() {
        // Saturn behind the Sun: the Sun moves away.
        let r = report(&chart_at(ARIES, &[(Body::Sun, 150.0), (Body::Saturn, 150.0 + 90.0 - 1.0)]));
        assert!(!has(&r, Body::Sun, G::Maltreatment, K::Engagement));
        let r = report(&chart_at(ARIES, &[(Body::Sun, 150.0), (Body::Saturn, 149.0)]));
        assert!(!has(&r, Body::Sun, G::Maltreatment, K::Adherence));
    }

    #[test]
    fn retrograde_motion_decides_applying() {
        // Saturn 1° past Mercury's square point: retrograde Mercury moves
        // away from it.
        let chart = chart_with(
            ARIES,
            &[(Body::Mercury, 100.0, -1.0), (Body::Saturn, 191.0, 0.03)],
        );
        assert!(!has(&report(&chart), Body::Mercury, G::Maltreatment, K::Engagement));
        // Saturn 1° short of the square point: retrograde Mercury applies.
        let chart = chart_with(
            ARIES,
            &[(Body::Mercury, 100.0, -1.0), (Body::Saturn, 189.0, 0.03)],
        );
        assert!(has(&report(&chart), Body::Mercury, G::Maltreatment, K::Engagement));
    }

    #[test]
    fn equal_speeds_are_reported_as_undetermined_without_a_rating() {
        let chart = chart_with(
            ARIES,
            &[(Body::Mercury, 100.0, 0.5), (Body::Saturn, 191.0, 0.5)],
        );
        let r = report(&chart);
        let found = find(&r, Body::Mercury, G::Maltreatment, K::Engagement);
        assert_eq!(found[0].applying, None);
        assert_eq!(found[0].rating, None);
    }

    #[test]
    fn engagement_ratings_by_aspect() {
        let malefic = |angle: f64| {
            let r = sun_saturn(angle, 1.0);
            find(&r, Body::Sun, G::Maltreatment, K::Engagement)[0].rating
        };
        assert_eq!(malefic(90.0), Some(Rating::VeryChallenging));
        assert_eq!(malefic(180.0), Some(Rating::VeryChallenging));
        // Recorded as a relation, not as maltreatment.
        assert_eq!(malefic(60.0), None);
        assert_eq!(malefic(120.0), None);

        let benefic = |angle: f64| {
            let chart = chart_at(ARIES, &[(Body::Sun, 150.0), (Body::Jupiter, 151.0 + angle)]);
            let r = report(&chart);
            find(&r, Body::Sun, G::Bonification, K::Engagement)[0].rating
        };
        assert_eq!(benefic(60.0), Some(Rating::Supportive));
        assert_eq!(benefic(90.0), Some(Rating::VerySupportive));
        assert_eq!(benefic(120.0), Some(Rating::VerySupportive));
        assert_eq!(benefic(180.0), Some(Rating::VerySupportive));
    }

    #[test]
    fn adherence_ratings_and_no_double_record_as_engagement() {
        let r = sun_saturn(0.0, 2.0);
        let found = find(&r, Body::Sun, G::Maltreatment, K::Adherence);
        assert_eq!(found[0].rating, Some(Rating::VeryChallenging));
        assert!(!has(&r, Body::Sun, G::Maltreatment, K::Engagement));
        // Venus is faster than the Sun, so it must be behind to apply.
        let chart = chart_at(ARIES, &[(Body::Sun, 150.0), (Body::Venus, 152.0)]);
        assert!(!has(&report(&chart), Body::Sun, G::Bonification, K::Adherence));
        let chart = chart_at(ARIES, &[(Body::Sun, 150.0), (Body::Venus, 148.0)]);
        assert_eq!(
            find(&report(&chart), Body::Sun, G::Bonification, K::Adherence)[0].rating,
            Some(Rating::VerySupportive)
        );
    }

    #[test]
    fn the_same_condition_is_recorded_once_and_different_ones_side_by_side() {
        // Saturn 1° past the Moon's square point, in the inferior position:
        // engagement and striking with a ray, each once.
        let chart = chart_at(ARIES, &[(Body::Moon, GEMINI + 10.0), (Body::Saturn, VIRGO + 11.0)]);
        let r = report(&chart);
        assert_eq!(find(&r, Body::Moon, G::Maltreatment, K::Engagement).len(), 1);
        assert_eq!(find(&r, Body::Moon, G::Maltreatment, K::StrikingRay).len(), 1);
    }

    #[test]
    fn sect_alone_does_not_change_bonification_or_maltreatment() {
        let chart = chart_at(
            ARIES,
            &[
                (Body::Jupiter, LEO + 18.0),
                (Body::Mars, SCORPIO + 17.0),
                (Body::Moon, GEMINI + 10.0),
                (Body::Saturn, VIRGO + 11.0),
            ],
        );
        let ratings = |sect: Sect| {
            let r = condition_report(&chart, Some(sect), &ConditionOptions::default());
            r.planets
                .iter()
                .flat_map(|p| {
                    p.conditions
                        .iter()
                        .filter(|c| matches!(c.group, G::Bonification | G::Maltreatment))
                        .map(|c| (p.body, c.kind, c.others.clone(), c.rating))
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>()
        };
        assert!(!ratings(Sect::Day).is_empty());
        assert_eq!(ratings(Sect::Day), ratings(Sect::Night));
    }

    #[test]
    fn a_manual_sect_is_used_and_marked() {
        let chart = chart_at(ARIES, &[]);
        assert_eq!(chart.sect, Sect::Day);
        let r = report(&chart);
        assert_eq!((r.sect, r.overridden, r.sect_light), (Sect::Day, false, Body::Sun));
        assert!(has(&r, Body::Sun, G::Sect, K::SectLight));
        assert!(has(&r, Body::Jupiter, G::Sect, K::SectFavored));
        assert!(has(&r, Body::Venus, G::Sect, K::SectContrary));
        let r = condition_report(&chart, Some(Sect::Night), &ConditionOptions::default());
        assert_eq!((r.sect, r.overridden, r.sect_light), (Sect::Night, true, Body::Moon));
        assert!(has(&r, Body::Moon, G::Sect, K::SectLight));
        assert!(has(&r, Body::Venus, G::Sect, K::SectFavored));
        assert_eq!(find(&r, Body::Mars, G::Sect, K::SectFavored)[0].sect_role, Some(SectRole::Malefic));
        assert!(has(&r, Body::Jupiter, G::Sect, K::SectContrary));
    }

    /// Every planet placed, so nothing interferes by accident.
    fn enclosure_chart(target: f64, mars: f64, saturn: f64, moon: f64) -> Chart {
        chart_at(
            ARIES,
            &[
                (Body::Venus, target),
                (Body::Mars, mars),
                (Body::Saturn, saturn),
                (Body::Moon, moon),
                // Kept where neither body nor ray comes near 100°.
                (Body::Sun, 115.0),
                (Body::Mercury, 118.0),
                (Body::Jupiter, 55.0),
            ],
        )
    }

    #[test]
    fn bodily_enclosure_between_the_malefics() {
        let r = report(&enclosure_chart(100.0, 96.0, 105.0, 50.0));
        let found = find(&r, Body::Venus, G::Maltreatment, K::Enclosure);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].bodily, Some(true));
        assert_eq!(found[0].rating, Some(Rating::VeryChallenging));
        assert_eq!(found[0].others, vec![Body::Mars, Body::Saturn]);
    }

    #[test]
    fn enclosure_includes_exactly_seven_degrees_and_needs_both_sides() {
        let enclosed = |mars: f64, saturn: f64| {
            has(&report(&enclosure_chart(100.0, mars, saturn, 50.0)), Body::Venus, G::Maltreatment, K::Enclosure)
        };
        assert!(enclosed(93.0, 107.0));
        assert!(!enclosed(92.9, 107.0));
        assert!(!enclosed(93.0, 107.1));
        // Both malefics on the same side.
        assert!(!enclosed(101.0, 105.0));
    }

    #[test]
    fn enclosure_works_across_the_aries_point() {
        let chart = chart_at(
            LIBRA,
            &[
                (Body::Venus, 1.0),
                (Body::Mars, 357.0),
                (Body::Saturn, 4.0),
                (Body::Moon, 50.0),
                (Body::Sun, 15.0),
                (Body::Mercury, 18.0),
                (Body::Jupiter, 315.0),
            ],
        );
        assert!(has(&report(&chart), Body::Venus, G::Maltreatment, K::Enclosure));
    }

    #[test]
    fn a_body_between_breaks_the_enclosure_and_is_named() {
        // The Moon stands between Venus and Saturn.
        let r = report(&enclosure_chart(100.0, 96.0, 105.0, 103.0));
        assert!(!has(&r, Body::Venus, G::Maltreatment, K::Enclosure));
        let broken = find(&r, Body::Venus, G::Maltreatment, K::EnclosureBroken);
        assert_eq!(broken[0].rating, None);
        assert_eq!(
            broken[0].breakers,
            vec![Breaker {
                body: Body::Moon,
                aspect: None
            }]
        );
    }

    #[test]
    fn a_ray_between_breaks_the_enclosure() {
        // The Moon at 8°: its square ray falls on 98°, between Mars and Venus.
        let r = report(&enclosure_chart(100.0, 96.0, 105.0, 8.0));
        let broken = find(&r, Body::Venus, G::Maltreatment, K::EnclosureBroken);
        assert_eq!(
            broken[0].breakers,
            vec![Breaker {
                body: Body::Moon,
                aspect: Some(AspectKind::Square)
            }]
        );
    }

    #[test]
    fn a_ray_within_seven_degrees_but_outside_the_interval_does_not_break_it() {
        // The Moon's square ray falls on 94°: beyond Mars at 96°.
        let r = report(&enclosure_chart(100.0, 96.0, 105.0, 4.0));
        assert!(has(&r, Body::Venus, G::Maltreatment, K::Enclosure));
        assert!(!has(&r, Body::Venus, G::Maltreatment, K::EnclosureBroken));
    }

    #[test]
    fn a_ray_on_the_enclosing_longitude_counts_as_intervention() {
        // The Moon's square ray falls exactly on Mars at 96°.
        let r = report(&enclosure_chart(100.0, 96.0, 105.0, 6.0));
        assert!(has(&r, Body::Venus, G::Maltreatment, K::EnclosureBroken));
    }

    #[test]
    fn enclosure_by_rays() {
        // Mars at 6° squares 96°; Saturn at 345° trines 105°.
        let r = report(&enclosure_chart(100.0, 6.0, 345.0, 50.0));
        let found = find(&r, Body::Venus, G::Maltreatment, K::Enclosure);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].bodily, Some(false));
    }

    #[test]
    fn enclosure_between_the_benefics_is_bonification() {
        let chart = chart_at(
            ARIES,
            &[
                (Body::Moon, 100.0),
                (Body::Venus, 97.0),
                (Body::Jupiter, 104.0),
                (Body::Sun, 115.0),
                (Body::Mercury, 118.0),
                (Body::Mars, 55.0),
                (Body::Saturn, 52.0),
            ],
        );
        let r = report(&chart);
        let found = find(&r, Body::Moon, G::Bonification, K::Enclosure);
        assert_eq!(found[0].rating, Some(Rating::VerySupportive));
        // The enclosing planets are not themselves enclosed.
        assert!(!has(&r, Body::Venus, G::Bonification, K::Enclosure));
    }

    #[test]
    fn sign_containment_without_degrees_is_not_enclosure() {
        // Mars and Saturn in the neighbouring signs, far away by degree.
        let r = report(&enclosure_chart(GEMINI + 15.0, TAURUS + 2.0, CANCER + 28.0, 250.0));
        assert!(!has(&r, Body::Venus, G::Maltreatment, K::Enclosure));
    }

    #[test]
    fn mercury_is_a_morning_star_west_of_the_sun_also_across_the_aries_point() {
        assert_eq!(solar_phase(350.0, 5.0), SolarPhase::Morning);
        assert_eq!(solar_phase(10.0, 355.0), SolarPhase::Evening);
        assert_eq!(solar_phase(90.0, 100.0), SolarPhase::Morning);
        assert_eq!(solar_phase(100.0, 100.0), SolarPhase::Undetermined);

        let sect = |mercury: f64| {
            let r = report(&chart_at(ARIES, &[(Body::Sun, 5.0), (Body::Mercury, mercury)]));
            let p = planet(&r, Body::Mercury);
            (p.phase, p.sect)
        };
        assert_eq!(sect(350.0), (Some(SolarPhase::Morning), Some(PlanetSect::Diurnal)));
        assert_eq!(sect(20.0), (Some(SolarPhase::Evening), Some(PlanetSect::Nocturnal)));
        // Being under the beams does not cancel the classification.
        assert_eq!(sect(2.0), (Some(SolarPhase::Morning), Some(PlanetSect::Diurnal)));
        // Exact conjunction: undetermined, and so is the sect.
        assert_eq!(sect(5.0), (Some(SolarPhase::Undetermined), None));
        let r = report(&chart_at(ARIES, &[(Body::Sun, 5.0), (Body::Mercury, 5.0)]));
        assert!(planet(&r, Body::Mercury).conditions.iter().all(|c| c.group != G::Sect));
        assert!(has(&r, Body::Mercury, G::Sun, K::Cazimi));
    }

    #[test]
    fn joy_by_hemisphere_follows_the_horizon_and_the_chart_sect() {
        // Ascendant 0° Aries: 0°–180° is below the horizon. The Sun at
        // 250° is above, so this is a day chart.
        let chart = chart_at(
            ARIES,
            &[(Body::Sun, 250.0), (Body::Jupiter, 300.0), (Body::Saturn, 100.0), (Body::Venus, 40.0), (Body::Mars, 310.0)],
        );
        let r = report(&chart);
        assert_eq!(r.sect, Sect::Day);
        assert!(has(&r, Body::Sun, G::Joys, K::JoyHemisphere));
        assert!(has(&r, Body::Jupiter, G::Joys, K::JoyHemisphere));
        assert!(!has(&r, Body::Saturn, G::Joys, K::JoyHemisphere));
        assert!(has(&r, Body::Venus, G::Joys, K::JoyHemisphere));
        assert!(!has(&r, Body::Mars, G::Joys, K::JoyHemisphere));
        // At night the same placements are reversed.
        let r = condition_report(&chart, Some(Sect::Night), &ConditionOptions::default());
        assert!(!has(&r, Body::Jupiter, G::Joys, K::JoyHemisphere));
        assert!(has(&r, Body::Saturn, G::Joys, K::JoyHemisphere));
        assert!(has(&r, Body::Mars, G::Joys, K::JoyHemisphere));
    }

    #[test]
    fn joy_by_sign_polarity_ignores_the_chart_sect() {
        let chart = chart_at(ARIES, &[(Body::Jupiter, GEMINI + 5.0), (Body::Venus, GEMINI + 20.0), (Body::Mars, TAURUS + 5.0)]);
        for sect in [Sect::Day, Sect::Night] {
            let r = condition_report(&chart, Some(sect), &ConditionOptions::default());
            assert!(has(&r, Body::Jupiter, G::Joys, K::JoySignPolarity));
            assert!(!has(&r, Body::Venus, G::Joys, K::JoySignPolarity));
            assert!(has(&r, Body::Mars, G::Joys, K::JoySignPolarity));
        }
    }

    #[test]
    fn joy_by_solar_phase() {
        // Sun at 196°. Jupiter and Venus west of it (morning), Saturn and Mars east.
        let chart = chart_at(
            ARIES,
            &[(Body::Jupiter, 150.0), (Body::Venus, 170.0), (Body::Saturn, 260.0), (Body::Mars, 240.0)],
        );
        let r = report(&chart);
        assert!(has(&r, Body::Jupiter, G::Joys, K::JoySolarPhase));
        assert!(!has(&r, Body::Venus, G::Joys, K::JoySolarPhase));
        assert!(!has(&r, Body::Saturn, G::Joys, K::JoySolarPhase));
        assert!(has(&r, Body::Mars, G::Joys, K::JoySolarPhase));
        assert_eq!(
            find(&r, Body::Mars, G::Joys, K::JoySolarPhase)[0].rating,
            Some(Rating::Supportive)
        );
        // Never for the Sun or the Moon; Mercury here is an evening star
        // in a day chart.
        for body in [Body::Sun, Body::Moon, Body::Mercury] {
            assert!(!has(&r, body, G::Joys, K::JoySolarPhase));
        }
        assert_eq!(planet(&r, Body::Moon).phase, None);
    }

    #[test]
    fn planetary_joys_by_house() {
        let cases = [
            (Body::Mercury, ARIES),
            (Body::Moon, GEMINI),
            (Body::Venus, LEO),
            (Body::Mars, VIRGO),
            (Body::Sun, SAGITTARIUS),
            (Body::Jupiter, AQUARIUS),
            (Body::Saturn, PISCES),
        ];
        for (body, sign) in cases {
            let r = report(&chart_at(ARIES, &[(body, sign + 15.0)]));
            assert!(has(&r, body, G::Joys, K::JoyHouse), "{body:?}");
        }
        let r = report(&chart_at(ARIES, &[(Body::Saturn, AQUARIUS + 15.0)]));
        assert!(!has(&r, Body::Saturn, G::Joys, K::JoyHouse));
    }

    #[test]
    fn house_types() {
        let r = report(&chart_at(ARIES, &[(Body::Sun, ARIES + 5.0), (Body::Moon, TAURUS + 5.0), (Body::Venus, GEMINI + 5.0)]));
        assert_eq!(planet(&r, Body::Sun).house_type, HouseType::Angular);
        assert_eq!(planet(&r, Body::Moon).house_type, HouseType::Succedent);
        assert_eq!(planet(&r, Body::Venus).house_type, HouseType::Cadent);
    }
}
