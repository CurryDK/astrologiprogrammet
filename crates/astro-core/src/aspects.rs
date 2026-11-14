//! Degree-based aspects between chart points (specification §5).

use serde::{Deserialize, Serialize};

use crate::chart::Chart;
use crate::normalize_degrees;
use crate::zodiac::{Body, Sign};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AspectKind {
    Conjunction,
    Sextile,
    Square,
    Trine,
    Opposition,
}

impl AspectKind {
    pub const ALL: [AspectKind; 5] = [
        AspectKind::Conjunction,
        AspectKind::Sextile,
        AspectKind::Square,
        AspectKind::Trine,
        AspectKind::Opposition,
    ];

    /// The exact angle of the aspect in degrees.
    pub fn angle(self) -> f64 {
        match self {
            AspectKind::Conjunction => 0.0,
            AspectKind::Sextile => 60.0,
            AspectKind::Square => 90.0,
            AspectKind::Trine => 120.0,
            AspectKind::Opposition => 180.0,
        }
    }

    /// How many signs apart two points are when the aspect is "in sign".
    fn sign_distance(self) -> usize {
        (self.angle() / 30.0) as usize
    }
}

/// Maximum orb in degrees for each aspect type.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Orbs {
    pub conjunction: f64,
    pub sextile: f64,
    pub square: f64,
    pub trine: f64,
    pub opposition: f64,
}

impl Orbs {
    pub fn uniform(orb: f64) -> Orbs {
        Orbs {
            conjunction: orb,
            sextile: orb,
            square: orb,
            trine: orb,
            opposition: orb,
        }
    }

    pub fn for_kind(&self, kind: AspectKind) -> f64 {
        match kind {
            AspectKind::Conjunction => self.conjunction,
            AspectKind::Sextile => self.sextile,
            AspectKind::Square => self.square,
            AspectKind::Trine => self.trine,
            AspectKind::Opposition => self.opposition,
        }
    }
}

impl Default for Orbs {
    /// 7° for every aspect type (specification §5).
    fn default() -> Self {
        Orbs::uniform(7.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AngleId {
    Ascendant,
    Midheaven,
}

/// A body or an angle; serialized as a plain name such as `"sun"` or `"ascendant"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(untagged)]
pub enum ChartPoint {
    Body(Body),
    Angle(AngleId),
}

impl ChartPoint {
    fn is_node(self) -> bool {
        matches!(self, ChartPoint::Body(Body::NorthNode | Body::SouthNode))
    }

    fn is_angle(self) -> bool {
        matches!(self, ChartPoint::Angle(_))
    }
}

/// A point taking part in aspect calculation.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AspectPoint {
    pub id: ChartPoint,
    pub longitude: f64,
    /// Degrees per day. Angles are given speed 0, so whether an aspect to
    /// an angle is applying is decided by the planet's motion alone.
    pub speed: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Aspect {
    /// The point that comes first in display order.
    pub a: ChartPoint,
    pub b: ChartPoint,
    pub kind: AspectKind,
    /// Absolute distance from exactness in degrees.
    pub orb: f64,
    /// True when the orb is shrinking ("a"), false when growing ("s").
    pub applying: bool,
    /// True when the signs involved do not themselves form this aspect ("oos").
    pub out_of_sign: bool,
}

impl Chart {
    /// All bodies in display order, followed by the Ascendant and Midheaven.
    pub fn aspect_points(&self) -> Vec<AspectPoint> {
        let mut points: Vec<AspectPoint> = self
            .positions
            .iter()
            .map(|p| AspectPoint {
                id: ChartPoint::Body(p.body),
                longitude: p.point.longitude,
                speed: p.speed,
            })
            .collect();
        points.push(AspectPoint {
            id: ChartPoint::Angle(AngleId::Ascendant),
            longitude: self.angles.ascendant.point.longitude,
            speed: 0.0,
        });
        points.push(AspectPoint {
            id: ChartPoint::Angle(AngleId::Midheaven),
            longitude: self.angles.midheaven.point.longitude,
            speed: 0.0,
        });
        points
    }
}

/// Every aspect within orb between the given points, each pair once, in the
/// order of the points: all aspects of the first point, then the remaining
/// aspects of the second, and so on.
///
/// The two lunar nodes are not compared with each other (always opposite),
/// nor are two angles.
pub fn find_aspects(points: &[AspectPoint], orbs: &Orbs) -> Vec<Aspect> {
    let mut aspects = Vec::new();
    for (i, a) in points.iter().enumerate() {
        for b in &points[i + 1..] {
            if (a.id.is_node() && b.id.is_node()) || (a.id.is_angle() && b.id.is_angle()) {
                continue;
            }
            if let Some(aspect) = aspect_between(a, b, orbs) {
                aspects.push(aspect);
            }
        }
    }
    aspects
}

fn aspect_between(a: &AspectPoint, b: &AspectPoint, orbs: &Orbs) -> Option<Aspect> {
    // Signed shortest arc from a to b, in (-180, 180].
    let mut arc = normalize_degrees(b.longitude - a.longitude);
    if arc > 180.0 {
        arc -= 360.0;
    }
    let separation = arc.abs();

    // With wide orbs two aspect types can both be in range; keep the closest.
    let (kind, deviation) = AspectKind::ALL
        .into_iter()
        .map(|kind| (kind, separation - kind.angle()))
        .filter(|(kind, deviation)| deviation.abs() <= orbs.for_kind(*kind))
        .min_by(|x, y| x.1.abs().total_cmp(&y.1.abs()))?;

    // Rate of change of the separation, then of the orb.
    let separation_rate = if arc >= 0.0 { b.speed - a.speed } else { a.speed - b.speed };
    let orb_rate = if deviation >= 0.0 { separation_rate } else { -separation_rate };

    let sign_a = Sign::from_longitude(a.longitude).index();
    let sign_b = Sign::from_longitude(b.longitude).index();
    let signs_apart = {
        let d = sign_a.abs_diff(sign_b);
        d.min(12 - d)
    };

    Some(Aspect {
        a: a.id,
        b: b.id,
        kind,
        orb: deviation.abs(),
        applying: orb_rate < 0.0,
        out_of_sign: signs_apart != kind.sign_distance(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn point(body: Body, longitude: f64, speed: f64) -> AspectPoint {
        AspectPoint {
            id: ChartPoint::Body(body),
            longitude,
            speed,
        }
    }

    fn only(points: &[AspectPoint], orbs: &Orbs) -> Aspect {
        let found = find_aspects(points, orbs);
        assert_eq!(found.len(), 1, "expected one aspect, got {found:?}");
        found[0]
    }

    #[test]
    fn recognises_each_aspect_type() {
        let cases = [
            (10.0, AspectKind::Conjunction),
            (70.0, AspectKind::Sextile),
            (100.0, AspectKind::Square),
            (130.0, AspectKind::Trine),
            (190.0, AspectKind::Opposition),
        ];
        for (moon, kind) in cases {
            let aspect = only(
                &[point(Body::Sun, 10.0, 1.0), point(Body::Moon, moon, 13.0)],
                &Orbs::default(),
            );
            assert_eq!(aspect.kind, kind);
            assert!(aspect.orb.abs() < 1e-9);
            assert!(!aspect.out_of_sign);
        }
    }

    #[test]
    fn orb_limit_is_inclusive_and_per_type() {
        let points = [point(Body::Sun, 0.0, 1.0), point(Body::Mars, 97.0, 0.5)];
        assert_eq!(only(&points, &Orbs::default()).orb, 7.0);

        let mut tight_squares = Orbs::default();
        tight_squares.square = 6.9;
        assert!(find_aspects(&points, &tight_squares).is_empty());
    }

    #[test]
    fn works_across_the_aries_point() {
        // 355° and 3° are 8° apart: no conjunction at 7°, one at 8°.
        let points = [point(Body::Sun, 355.0, 1.0), point(Body::Mars, 3.0, 0.5)];
        assert!(find_aspects(&points, &Orbs::default()).is_empty());
        let aspect = only(&points, &Orbs::uniform(8.0));
        assert_eq!(aspect.kind, AspectKind::Conjunction);
        assert!((aspect.orb - 8.0).abs() < 1e-9);
        // Different signs (Pisces, Aries) for a conjunction: out of sign.
        assert!(aspect.out_of_sign);
    }

    #[test]
    fn out_of_sign_sextile() {
        // 29° Aries to 1° Cancer is 62°: a sextile by degree, a square by sign.
        let aspect = only(
            &[point(Body::Venus, 29.0, 1.0), point(Body::Jupiter, 91.0, 0.1)],
            &Orbs::default(),
        );
        assert_eq!(aspect.kind, AspectKind::Sextile);
        assert!(aspect.out_of_sign);
    }

    #[test]
    fn faster_planet_closing_in_is_applying() {
        // Sun at 10° moving toward a sextile (70° - 60°) with a slow planet at 75°.
        let aspect = only(
            &[point(Body::Sun, 10.0, 1.0), point(Body::Saturn, 75.0, 0.05)],
            &Orbs::default(),
        );
        assert_eq!(aspect.kind, AspectKind::Sextile);
        assert!(aspect.applying);
    }

    #[test]
    fn faster_planet_past_exact_is_separating() {
        let aspect = only(
            &[point(Body::Sun, 20.0, 1.0), point(Body::Saturn, 75.0, 0.05)],
            &Orbs::default(),
        );
        assert_eq!(aspect.kind, AspectKind::Sextile);
        assert!(!aspect.applying);
    }

    #[test]
    fn retrograde_planet_can_apply_backwards() {
        // Mercury retrograde at 15°, moving back toward a conjunction with Saturn at 12°.
        let aspect = only(
            &[point(Body::Mercury, 15.0, -1.0), point(Body::Saturn, 12.0, 0.05)],
            &Orbs::default(),
        );
        assert!(aspect.applying);
    }

    #[test]
    fn applying_does_not_depend_on_point_order() {
        let sun = point(Body::Sun, 10.0, 1.0);
        let saturn = point(Body::Saturn, 75.0, 0.05);
        assert_eq!(
            only(&[sun, saturn], &Orbs::default()).applying,
            only(&[saturn, sun], &Orbs::default()).applying
        );
    }

    #[test]
    fn each_pair_appears_once_in_point_order() {
        let points = [
            point(Body::Sun, 0.0, 1.0),
            point(Body::Moon, 90.0, 13.0),
            point(Body::Mercury, 180.0, 1.2),
        ];
        let found = find_aspects(&points, &Orbs::default());
        let pairs: Vec<_> = found.iter().map(|x| (x.a, x.b, x.kind)).collect();
        assert_eq!(
            pairs,
            [
                (ChartPoint::Body(Body::Sun), ChartPoint::Body(Body::Moon), AspectKind::Square),
                (
                    ChartPoint::Body(Body::Sun),
                    ChartPoint::Body(Body::Mercury),
                    AspectKind::Opposition
                ),
                (
                    ChartPoint::Body(Body::Moon),
                    ChartPoint::Body(Body::Mercury),
                    AspectKind::Square
                ),
            ]
        );
    }

    #[test]
    fn nodes_and_angles_are_not_compared_with_each_other() {
        let points = [
            point(Body::NorthNode, 10.0, -0.05),
            point(Body::SouthNode, 190.0, -0.05),
            AspectPoint {
                id: ChartPoint::Angle(AngleId::Ascendant),
                longitude: 100.0,
                speed: 0.0,
            },
            AspectPoint {
                id: ChartPoint::Angle(AngleId::Midheaven),
                longitude: 10.0,
                speed: 0.0,
            },
        ];
        let found = find_aspects(&points, &Orbs::default());
        // Node–node and ASC–MC are skipped; node–angle aspects remain.
        assert!(found.iter().all(|x| !(x.a.is_node() && x.b.is_node())));
        assert!(found.iter().all(|x| !(x.a.is_angle() && x.b.is_angle())));
        assert_eq!(found.len(), 4);
    }

    #[test]
    fn points_serialize_as_plain_names() {
        let json = serde_json::to_string(&[
            ChartPoint::Body(Body::NorthNode),
            ChartPoint::Angle(AngleId::Midheaven),
        ])
        .unwrap();
        assert_eq!(json, r#"["northNode","midheaven"]"#);
    }
}
