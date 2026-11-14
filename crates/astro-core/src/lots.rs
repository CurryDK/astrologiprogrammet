//! The seven Hermetic lots (specification §10 and the lots supplement).
//!
//! Formulas follow the supplement's day/night table exactly:
//! `lot = (Ascendant + end point − start point) mod 360°`, on full-circle
//! longitudes. Fortune and Spirit come first because the other five use them.

use serde::Serialize;

use crate::aspects::{AngleId, AspectKind, Orbs, aspect_geometry};
use crate::chart::{Chart, Sect};
use crate::normalize_degrees;
use crate::zodiac::{Body, Sign, ZodiacPoint, whole_sign_house};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Lot {
    Fortune,
    Spirit,
    Eros,
    Necessity,
    Courage,
    Victory,
    Nemesis,
}

impl Lot {
    pub const ALL: [Lot; 7] = [
        Lot::Fortune,
        Lot::Spirit,
        Lot::Eros,
        Lot::Necessity,
        Lot::Courage,
        Lot::Victory,
        Lot::Nemesis,
    ];

    /// The planet each lot belongs to in Paulus Alexandrinus, Introduction
    /// ch. 23, as rendered in the supplement's source (Brennan).
    pub fn planet(self) -> Body {
        match self {
            Lot::Fortune => Body::Moon,
            Lot::Spirit => Body::Sun,
            Lot::Eros => Body::Venus,
            Lot::Necessity => Body::Mercury,
            Lot::Courage => Body::Mars,
            Lot::Victory => Body::Jupiter,
            Lot::Nemesis => Body::Saturn,
        }
    }
}

/// The longitudes the formulas use, in degrees.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LotInputs {
    pub ascendant: f64,
    pub sun: f64,
    pub moon: f64,
    pub mercury: f64,
    pub venus: f64,
    pub mars: f64,
    pub jupiter: f64,
    pub saturn: f64,
}

impl LotInputs {
    pub fn from_chart(chart: &Chart) -> LotInputs {
        let of = |body| chart.position(body).point.longitude;
        LotInputs {
            ascendant: chart.angles.ascendant.point.longitude,
            sun: of(Body::Sun),
            moon: of(Body::Moon),
            mercury: of(Body::Mercury),
            venus: of(Body::Venus),
            mars: of(Body::Mars),
            jupiter: of(Body::Jupiter),
            saturn: of(Body::Saturn),
        }
    }
}

/// Longitudes of the seven lots in the order of [`Lot::ALL`], each in [0, 360).
pub fn lot_longitudes(inputs: &LotInputs, sect: Sect) -> [f64; 7] {
    let a = inputs.ascendant;
    // Ascendant + end − start for a day chart; the two are swapped at night.
    let lot = |day_end: f64, day_start: f64| match sect {
        Sect::Day => normalize_degrees(a + day_end - day_start),
        Sect::Night => normalize_degrees(a + day_start - day_end),
    };

    let fortune = lot(inputs.moon, inputs.sun);
    let spirit = lot(inputs.sun, inputs.moon);
    [
        fortune,
        spirit,
        lot(inputs.venus, spirit),     // Eros
        lot(fortune, inputs.mercury),  // Necessity
        lot(fortune, inputs.mars),     // Courage
        lot(inputs.jupiter, spirit),   // Victory
        lot(fortune, inputs.saturn),   // Nemesis
    ]
}

/// One lot with the facts shown in the lots overview. No interpretation.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LotPosition {
    pub lot: Lot,
    #[serde(flatten)]
    pub point: ZodiacPoint,
    /// Whole-sign house of the lot, 1–12.
    pub house: u8,
    /// The lot's traditional planet.
    pub planet: Body,
    /// Traditional ruler of the lot's sign.
    pub ruler: Body,
    pub ruler_sign: Sign,
    /// Whole-sign house of the ruler, 1–12.
    pub ruler_house: u8,
}

/// The seven lots of a chart for the given sect, which may differ from the
/// chart's own when the user has overridden it.
pub fn compute_lots(chart: &Chart, sect: Sect) -> Vec<LotPosition> {
    let rising_sign = chart.angles.ascendant.point.sign;
    let longitudes = lot_longitudes(&LotInputs::from_chart(chart), sect);
    Lot::ALL
        .into_iter()
        .zip(longitudes)
        .map(|(lot, longitude)| {
            let point = ZodiacPoint::new(longitude);
            let ruler = point.sign.ruler();
            let ruler_position = chart.position(ruler);
            LotPosition {
                lot,
                point,
                house: whole_sign_house(point.sign, rising_sign),
                planet: lot.planet(),
                ruler,
                ruler_sign: ruler_position.point.sign,
                ruler_house: ruler_position.house,
            }
        })
        .collect()
}

/// What a lot can be in aspect with; serialized as a plain name such as
/// `"sun"`, `"ascendant"` or `"spirit"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(untagged)]
pub enum LotAspectPoint {
    Body(Body),
    Angle(AngleId),
    Lot(Lot),
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LotAspect {
    pub lot: Lot,
    pub other: LotAspectPoint,
    pub kind: AspectKind,
    /// Absolute distance from exactness in degrees.
    pub orb: f64,
    /// True when the orb is below the exactness limit ("e").
    pub exact: bool,
    /// True when the signs involved do not themselves form this aspect ("oos").
    pub out_of_sign: bool,
}

/// Every aspect within `orb` degrees from each lot to the chart's bodies,
/// then to the Ascendant and Midheaven, then to the lots after it (so each
/// pair of lots appears once). Grouped by lot in the order of [`Lot::ALL`].
///
/// An aspect is marked exact when its orb is below `exact_orb` degrees.
/// Lots have no motion of their own, so there is no applying/separating.
pub fn find_lot_aspects(
    chart: &Chart,
    lots: &[LotPosition],
    orb: f64,
    exact_orb: f64,
) -> Vec<LotAspect> {
    let orbs = Orbs::uniform(orb);
    let mut aspects = Vec::new();
    for (index, lot) in lots.iter().enumerate() {
        let bodies = chart
            .positions
            .iter()
            .map(|p| (LotAspectPoint::Body(p.body), p.point.longitude));
        let angles = [
            (
                LotAspectPoint::Angle(AngleId::Ascendant),
                chart.angles.ascendant.point.longitude,
            ),
            (
                LotAspectPoint::Angle(AngleId::Midheaven),
                chart.angles.midheaven.point.longitude,
            ),
        ];
        let later_lots = lots[index + 1..]
            .iter()
            .map(|l| (LotAspectPoint::Lot(l.lot), l.point.longitude));

        for (other, longitude) in bodies.chain(angles).chain(later_lots) {
            if let Some(found) = aspect_geometry(lot.point.longitude, longitude, &orbs) {
                let orb = found.deviation.abs();
                aspects.push(LotAspect {
                    lot: lot.lot,
                    other,
                    kind: found.kind,
                    orb,
                    exact: orb < exact_orb,
                    out_of_sign: found.out_of_sign,
                });
            }
        }
    }
    aspects
}

/// The lots of a chart with their aspects, as the app shows them.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LotReport {
    /// The sect whose column of formulas was used.
    pub sect: Sect,
    /// True when `sect` was set by the user rather than derived from the
    /// Sun. The derived sect is still in `Chart::sect`.
    pub overridden: bool,
    pub positions: Vec<LotPosition>,
    pub aspects: Vec<LotAspect>,
}

/// Lots and lot aspects for a chart. `sect_override` replaces the sect the
/// chart derives from the Sun; all seven lots then use the other column.
pub fn lot_report(
    chart: &Chart,
    sect_override: Option<Sect>,
    orb: f64,
    exact_orb: f64,
) -> LotReport {
    let sect = sect_override.unwrap_or(chart.sect);
    let positions = compute_lots(chart, sect);
    let aspects = find_lot_aspects(chart, &positions, orb, exact_orb);
    LotReport {
        sect,
        overridden: sect_override.is_some(),
        positions,
        aspects,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chart::{Angle, Angles, BodyPosition, House};
    use chrono::{TimeZone, Utc};

    const INPUTS: LotInputs = LotInputs {
        ascendant: 100.0,
        sun: 220.0,
        moon: 50.0,
        mercury: 200.0,
        venus: 250.0,
        mars: 10.0,
        jupiter: 300.0,
        saturn: 330.0,
    };

    fn assert_lots(actual: [f64; 7], expected: [f64; 7]) {
        for ((lot, actual), expected) in Lot::ALL.into_iter().zip(actual).zip(expected) {
            assert!(
                (actual - expected).abs() < 1e-9,
                "{lot:?}: expected {expected}, got {actual}"
            );
        }
    }

    #[test]
    fn all_seven_lots_in_a_day_chart() {
        // Worked by hand from the supplement's day column.
        assert_lots(
            lot_longitudes(&INPUTS, Sect::Day),
            [
                290.0, // Fortune   A + M − S   = 100 + 50 − 220  = −70
                270.0, // Spirit    A + S − M   = 100 + 220 − 50
                80.0,  // Eros      A + Ve − Sp = 100 + 250 − 270
                190.0, // Necessity A + F − Me  = 100 + 290 − 200
                20.0,  // Courage   A + F − Ma  = 100 + 290 − 10  = 380
                130.0, // Victory   A + J − Sp  = 100 + 300 − 270
                60.0,  // Nemesis   A + F − Sa  = 100 + 290 − 330
            ],
        );
    }

    #[test]
    fn all_seven_lots_in_a_night_chart() {
        // Worked by hand from the supplement's night column.
        assert_lots(
            lot_longitudes(&INPUTS, Sect::Night),
            [
                270.0, // Fortune   A + S − M   = 100 + 220 − 50
                290.0, // Spirit    A + M − S   = 100 + 50 − 220  = −70
                140.0, // Eros      A + Sp − Ve = 100 + 290 − 250
                30.0,  // Necessity A + Me − F  = 100 + 200 − 270
                200.0, // Courage   A + Ma − F  = 100 + 10 − 270  = −160
                90.0,  // Victory   A + Sp − J  = 100 + 290 − 300
                160.0, // Nemesis   A + Sa − F  = 100 + 330 − 270
            ],
        );
    }

    #[test]
    fn the_supplements_wrap_around_examples() {
        // −15° becomes 345°: Fortune by day = 10 + 5 − 30.
        let below_zero = LotInputs {
            ascendant: 10.0,
            moon: 5.0,
            sun: 30.0,
            ..INPUTS
        };
        assert_eq!(lot_longitudes(&below_zero, Sect::Day)[0], 345.0);

        // 375° becomes 15°: Fortune by day = 350 + 40 − 15.
        let above_circle = LotInputs {
            ascendant: 350.0,
            moon: 40.0,
            sun: 15.0,
            ..INPUTS
        };
        assert_eq!(lot_longitudes(&above_circle, Sect::Day)[0], 15.0);
    }

    #[test]
    fn switching_sect_swaps_fortune_and_spirit() {
        let day = lot_longitudes(&INPUTS, Sect::Day);
        let night = lot_longitudes(&INPUTS, Sect::Night);
        assert_eq!(day[0], night[1]);
        assert_eq!(day[1], night[0]);
    }

    #[test]
    fn formulas_use_the_full_longitude_not_the_degree_within_the_sign() {
        // Moon 10° Taurus and Sun 20° Aries: full longitudes 40 and 20.
        let inputs = LotInputs {
            ascendant: 0.0,
            moon: 40.0,
            sun: 20.0,
            ..INPUTS
        };
        assert_eq!(lot_longitudes(&inputs, Sect::Day)[0], 20.0);
    }

    /// A chart built by hand from longitudes in the order of `Body::ALL`.
    fn chart(ascendant: f64, midheaven: f64, longitudes: [f64; 12]) -> Chart {
        let rising_sign = Sign::from_longitude(ascendant);
        let angle = |longitude: f64| {
            let point = ZodiacPoint::new(longitude);
            Angle {
                point,
                house: whole_sign_house(point.sign, rising_sign),
            }
        };
        Chart {
            utc: Utc.with_ymd_and_hms(2000, 1, 1, 12, 0, 0).unwrap(),
            julian_day: 2451545.0,
            latitude: 0.0,
            longitude: 0.0,
            positions: Body::ALL
                .into_iter()
                .zip(longitudes)
                .map(|(body, longitude)| {
                    let point = ZodiacPoint::new(longitude);
                    BodyPosition {
                        body,
                        point,
                        latitude: 0.0,
                        speed: 1.0,
                        retrograde: false,
                        house: whole_sign_house(point.sign, rising_sign),
                    }
                })
                .collect(),
            angles: Angles {
                ascendant: angle(ascendant),
                descendant: angle(ascendant + 180.0),
                midheaven: angle(midheaven),
                imum_coeli: angle(midheaven + 180.0),
            },
            houses: std::array::from_fn(|i| {
                let sign = Sign::ALL[(rising_sign.index() + i) % 12];
                House {
                    number: i as u8 + 1,
                    sign,
                    ruler: sign.ruler(),
                }
            }),
            sect: Sect::Day,
        }
    }

    /// The chart of `INPUTS`, with the outer planets and nodes kept well
    /// away from every lot.
    fn sample_chart() -> Chart {
        chart(
            100.0,
            5.0,
            [
                220.0, 50.0, 200.0, 250.0, 10.0, 300.0, 330.0, // Sun to Saturn
                113.0, 114.0, 115.0, 116.0, 296.0,
            ],
        )
    }

    #[test]
    fn overview_shows_planet_ruler_and_the_rulers_sign_and_house() {
        let chart = sample_chart();
        let lots = compute_lots(&chart, Sect::Day);
        assert_eq!(lots.len(), 7);

        // Fortune at 290° = 20° Capricorn; Cancer rises, so the 7th house.
        let fortune = lots[0];
        assert_eq!(fortune.lot, Lot::Fortune);
        assert_eq!((fortune.point.sign, fortune.point.degree), (Sign::Capricorn, 20));
        assert_eq!(fortune.house, 7);
        assert_eq!(fortune.planet, Body::Moon);
        // Capricorn is ruled by Saturn, here at 330° = Pisces, the 9th house.
        assert_eq!(fortune.ruler, Body::Saturn);
        assert_eq!(fortune.ruler_sign, Sign::Pisces);
        assert_eq!(fortune.ruler_house, 9);

        let planets: Vec<_> = lots.iter().map(|l| l.planet).collect();
        assert_eq!(
            planets,
            [
                Body::Moon,
                Body::Sun,
                Body::Venus,
                Body::Mercury,
                Body::Mars,
                Body::Jupiter,
                Body::Saturn
            ]
        );
    }

    #[test]
    fn the_sect_passed_in_decides_the_column_not_the_charts_own() {
        let chart = sample_chart();
        assert_eq!(chart.sect, Sect::Day);
        let night = compute_lots(&chart, Sect::Night);
        assert_eq!(night[0].point.longitude, 270.0);
        assert_eq!(night[6].point.longitude, 160.0);
    }

    #[test]
    fn a_manual_sect_recalculates_all_seven_from_the_other_column() {
        let chart = sample_chart();
        let automatic = lot_report(&chart, None, 3.0, 1.0);
        assert_eq!((automatic.sect, automatic.overridden), (Sect::Day, false));

        let manual = lot_report(&chart, Some(Sect::Night), 3.0, 1.0);
        assert_eq!((manual.sect, manual.overridden), (Sect::Night, true));
        let longitudes: Vec<_> = manual.positions.iter().map(|l| l.point.longitude).collect();
        assert_eq!(longitudes, lot_longitudes(&INPUTS, Sect::Night));
        assert!(
            automatic
                .positions
                .iter()
                .zip(&manual.positions)
                .all(|(a, b)| a.point.longitude != b.point.longitude)
        );
    }

    fn aspect(found: &[LotAspect], lot: Lot, other: LotAspectPoint) -> Option<LotAspect> {
        found.iter().copied().find(|a| a.lot == lot && a.other == other)
    }

    #[test]
    fn lot_aspects_respect_the_orb_and_mark_exact_ones() {
        let chart = sample_chart();
        let lots = compute_lots(&chart, Sect::Day);
        let found = find_lot_aspects(&chart, &lots, 3.0, 1.0);

        // Fortune 290° to Mars 10°: 80° apart, no aspect.
        assert!(aspect(&found, Lot::Fortune, LotAspectPoint::Body(Body::Mars)).is_none());

        // Fortune 290° to Moon 50°: exactly 120°.
        let trine = aspect(&found, Lot::Fortune, LotAspectPoint::Body(Body::Moon)).unwrap();
        assert_eq!(trine.kind, AspectKind::Trine);
        assert!(trine.orb < 1e-9);
        assert!(trine.exact);
        assert!(!trine.out_of_sign);

        // Spirit 270° to Saturn 330°: an exact sextile.
        let sextile = aspect(&found, Lot::Spirit, LotAspectPoint::Body(Body::Saturn)).unwrap();
        assert_eq!(sextile.kind, AspectKind::Sextile);

        // Eros 80° to Mercury 200°: an exact trine.
        assert!(aspect(&found, Lot::Eros, LotAspectPoint::Body(Body::Mercury)).is_some());
    }

    #[test]
    fn the_orb_limit_is_inclusive_and_the_exact_limit_is_not() {
        // Day Fortune = A + M − S = 0 + 93 − 0 = 93°; Sun at 0°: a square, 3° wide.
        let mut longitudes = [200.0; 12];
        longitudes[0] = 0.0;
        longitudes[1] = 93.0;
        let chart = chart(0.0, 200.0, longitudes);
        let lots = compute_lots(&chart, Sect::Day);
        let sun = LotAspectPoint::Body(Body::Sun);

        let at_limit = find_lot_aspects(&chart, &lots, 3.0, 1.0);
        let square = aspect(&at_limit, Lot::Fortune, sun).unwrap();
        assert_eq!(square.kind, AspectKind::Square);
        assert!((square.orb - 3.0).abs() < 1e-9);
        assert!(!square.exact);

        assert!(aspect(&find_lot_aspects(&chart, &lots, 2.9, 1.0), Lot::Fortune, sun).is_none());

        // An orb equal to the exact limit is not exact; one below it is.
        assert!(!aspect(&find_lot_aspects(&chart, &lots, 3.0, 3.0), Lot::Fortune, sun).unwrap().exact);
        assert!(aspect(&find_lot_aspects(&chart, &lots, 3.0, 3.1), Lot::Fortune, sun).unwrap().exact);
    }

    #[test]
    fn out_of_sign_lot_aspects_are_marked() {
        // Day Fortune = 0 + 31 − 0 = 31° (1° Taurus); Mars at 29° Aries: a
        // conjunction by degree across a sign boundary.
        let mut longitudes = [200.0; 12];
        longitudes[0] = 0.0;
        longitudes[1] = 31.0;
        longitudes[4] = 29.0;
        let chart = chart(0.0, 200.0, longitudes);
        let lots = compute_lots(&chart, Sect::Day);
        let found = find_lot_aspects(&chart, &lots, 3.0, 1.0);
        let conjunction = aspect(&found, Lot::Fortune, LotAspectPoint::Body(Body::Mars)).unwrap();
        assert_eq!(conjunction.kind, AspectKind::Conjunction);
        assert!(conjunction.out_of_sign);
    }

    #[test]
    fn aspects_to_angles_and_other_lots_are_found_and_each_lot_pair_once() {
        let chart = sample_chart();
        let lots = compute_lots(&chart, Sect::Day);
        let found = find_lot_aspects(&chart, &lots, 3.0, 1.0);

        // Spirit 270° to Midheaven 5°: 95°, outside 3°. Courage 20° to
        // Ascendant 100°: 80°, none. Necessity 190° to Ascendant 100°: square.
        let square = aspect(&found, Lot::Necessity, LotAspectPoint::Angle(AngleId::Ascendant));
        assert_eq!(square.unwrap().kind, AspectKind::Square);

        // Eros 80° and Courage 20°: a sextile, listed under Eros only.
        let sextile = aspect(&found, Lot::Eros, LotAspectPoint::Lot(Lot::Courage)).unwrap();
        assert_eq!(sextile.kind, AspectKind::Sextile);
        assert!(aspect(&found, Lot::Courage, LotAspectPoint::Lot(Lot::Eros)).is_none());

        // Grouped by lot in the standard order.
        let order: Vec<_> = found.iter().map(|a| Lot::ALL.iter().position(|l| *l == a.lot)).collect();
        assert!(order.windows(2).all(|pair| pair[0] <= pair[1]));
    }

    #[test]
    fn points_serialize_as_plain_names() {
        let json = serde_json::to_string(&[
            LotAspectPoint::Body(Body::Sun),
            LotAspectPoint::Angle(AngleId::Ascendant),
            LotAspectPoint::Lot(Lot::Nemesis),
        ])
        .unwrap();
        assert_eq!(json, r#"["sun","ascendant","nemesis"]"#);
    }
}
