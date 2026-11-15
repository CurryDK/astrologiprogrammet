//! The information rings drawn around the wheel: Chaldean decans, modern
//! decans and Egyptian bounds (visual wheel specification of 15 November
//! 2026, section 2). Pure tables; nothing here depends on a chart.

use serde::Serialize;

use crate::condition::{bound_lord, decan_lord};
use crate::zodiac::{Body, Sign};

/// One segment of a ring: `[start, end)` in ecliptic degrees, and its lord.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RingSegment {
    pub start: f64,
    pub end: f64,
    pub lord: Body,
}

/// Every ring the wheel can show.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WheelRings {
    /// Chaldean decans: the planets in descending order from Mars at 0° Aries.
    pub chaldean_decans: Vec<RingSegment>,
    /// Modern (triplicity) decans with the modern rulers of Scorpio,
    /// Aquarius and Pisces: Pluto, Uranus and Neptune.
    pub modern_decans: Vec<RingSegment>,
    /// Modern (triplicity) decans with the traditional rulers only.
    pub modern_decans_traditional: Vec<RingSegment>,
    /// Egyptian bounds, five unequal segments per sign.
    pub bounds: Vec<RingSegment>,
}

/// Ruler of a sign in modern astrology.
fn modern_ruler(sign: Sign) -> Body {
    match sign.index() {
        7 => Body::Pluto,
        10 => Body::Uranus,
        11 => Body::Neptune,
        _ => sign.ruler(),
    }
}

/// Lord of the modern decan at a longitude: the first ten degrees belong to
/// the sign's own ruler, the next ten to the ruler of the following sign of
/// the same element, the last ten to the ruler of the third.
pub fn modern_decan_lord(longitude: f64, modern_rulers: bool) -> Body {
    let decan = ((crate::normalize_degrees(longitude) / 10.0) as usize).min(35);
    let sign = Sign::from_longitude(((decan / 3 + 4 * (decan % 3)) % 12) as f64 * 30.0);
    if modern_rulers { modern_ruler(sign) } else { sign.ruler() }
}

fn decans(lord: impl Fn(f64) -> Body) -> Vec<RingSegment> {
    (0..36)
        .map(|decan| {
            let start = decan as f64 * 10.0;
            RingSegment { start, end: start + 10.0, lord: lord(start) }
        })
        .collect()
}

/// The bounds as segments. Every bound starts on a whole degree, so the
/// table is read off degree by degree; a segment never crosses a sign.
fn bounds() -> Vec<RingSegment> {
    let mut segments: Vec<RingSegment> = Vec::with_capacity(60);
    for degree in 0..360 {
        let lord = bound_lord(degree as f64);
        match segments.last_mut() {
            Some(last) if last.lord == lord && degree % 30 != 0 => last.end = (degree + 1) as f64,
            _ => segments.push(RingSegment {
                start: degree as f64,
                end: (degree + 1) as f64,
                lord,
            }),
        }
    }
    segments
}

pub fn wheel_rings() -> WheelRings {
    WheelRings {
        chaldean_decans: decans(decan_lord),
        modern_decans: decans(|longitude| modern_decan_lord(longitude, true)),
        modern_decans_traditional: decans(|longitude| modern_decan_lord(longitude, false)),
        bounds: bounds(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chaldean_decans_follow_the_descending_order() {
        let rings = wheel_rings();
        assert_eq!(rings.chaldean_decans.len(), 36);
        let lords: Vec<Body> = rings.chaldean_decans.iter().take(4).map(|s| s.lord).collect();
        assert_eq!(lords, [Body::Mars, Body::Sun, Body::Venus, Body::Mercury]);
        // The last decan of Pisces is Mars again, as is the first of Aries.
        assert_eq!(rings.chaldean_decans[35].lord, Body::Mars);
        assert_eq!(rings.chaldean_decans[35].end, 360.0);
    }

    #[test]
    fn modern_decans_run_through_the_element() {
        // Aries: Aries, Leo, Sagittarius.
        assert_eq!(modern_decan_lord(5.0, true), Body::Mars);
        assert_eq!(modern_decan_lord(15.0, true), Body::Sun);
        assert_eq!(modern_decan_lord(25.0, true), Body::Jupiter);
        // Cancer: Cancer, Scorpio, Pisces.
        assert_eq!(modern_decan_lord(95.0, true), Body::Moon);
        assert_eq!(modern_decan_lord(105.0, true), Body::Pluto);
        assert_eq!(modern_decan_lord(115.0, true), Body::Neptune);
        assert_eq!(modern_decan_lord(105.0, false), Body::Mars);
        assert_eq!(modern_decan_lord(115.0, false), Body::Jupiter);
        // Gemini's last decan is Aquarius.
        assert_eq!(modern_decan_lord(85.0, true), Body::Uranus);
        assert_eq!(modern_decan_lord(85.0, false), Body::Saturn);
    }

    #[test]
    fn bounds_are_five_unequal_segments_per_sign() {
        let bounds = wheel_rings().bounds;
        assert_eq!(bounds.len(), 60);
        // Aries: Jupiter 0–6, Venus 6–12, Mercury 12–20, Mars 20–25, Saturn 25–30.
        let aries: Vec<(f64, f64, Body)> =
            bounds.iter().take(5).map(|s| (s.start, s.end, s.lord)).collect();
        assert_eq!(
            aries,
            [
                (0.0, 6.0, Body::Jupiter),
                (6.0, 12.0, Body::Venus),
                (12.0, 20.0, Body::Mercury),
                (20.0, 25.0, Body::Mars),
                (25.0, 30.0, Body::Saturn),
            ]
        );
        // Libra ends and Scorpio begins with Mars: two segments, not one.
        let mars: Vec<&RingSegment> =
            bounds.iter().filter(|s| s.end == 210.0 || s.start == 210.0).collect();
        assert_eq!(mars.len(), 2);
        assert!(mars.iter().all(|s| s.lord == Body::Mars));
        // The segments tile the circle.
        for pair in bounds.windows(2) {
            assert_eq!(pair[0].end, pair[1].start);
        }
        assert_eq!(bounds[59].end, 360.0);
    }
}
