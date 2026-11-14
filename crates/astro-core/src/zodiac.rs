//! Signs, bodies and positions on the tropical zodiac.

use serde::{Deserialize, Serialize};

use crate::normalize_degrees;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Sign {
    Aries,
    Taurus,
    Gemini,
    Cancer,
    Leo,
    Virgo,
    Libra,
    Scorpio,
    Sagittarius,
    Capricorn,
    Aquarius,
    Pisces,
}

impl Sign {
    pub const ALL: [Sign; 12] = [
        Sign::Aries,
        Sign::Taurus,
        Sign::Gemini,
        Sign::Cancer,
        Sign::Leo,
        Sign::Virgo,
        Sign::Libra,
        Sign::Scorpio,
        Sign::Sagittarius,
        Sign::Capricorn,
        Sign::Aquarius,
        Sign::Pisces,
    ];

    pub fn from_longitude(longitude: f64) -> Sign {
        let index = (normalize_degrees(longitude) / 30.0) as usize;
        Sign::ALL[index.min(11)]
    }

    /// 0 for Aries through 11 for Pisces.
    pub fn index(self) -> usize {
        self as usize
    }

    /// Traditional (domicile) ruler.
    pub fn ruler(self) -> Body {
        match self {
            Sign::Aries | Sign::Scorpio => Body::Mars,
            Sign::Taurus | Sign::Libra => Body::Venus,
            Sign::Gemini | Sign::Virgo => Body::Mercury,
            Sign::Cancer => Body::Moon,
            Sign::Leo => Body::Sun,
            Sign::Sagittarius | Sign::Pisces => Body::Jupiter,
            Sign::Capricorn | Sign::Aquarius => Body::Saturn,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Body {
    Sun,
    Moon,
    Mercury,
    Venus,
    Mars,
    Jupiter,
    Saturn,
    Uranus,
    Neptune,
    Pluto,
    /// True (osculating) lunar north node.
    NorthNode,
    SouthNode,
}

impl Body {
    /// Display and aspect-grouping order from the specification (§5).
    pub const ALL: [Body; 12] = [
        Body::Sun,
        Body::Moon,
        Body::Mercury,
        Body::Venus,
        Body::Mars,
        Body::Jupiter,
        Body::Saturn,
        Body::Uranus,
        Body::Neptune,
        Body::Pluto,
        Body::NorthNode,
        Body::SouthNode,
    ];
}

/// A point on the zodiac, with the sign-relative reading used for display.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZodiacPoint {
    /// Ecliptic longitude in [0, 360).
    pub longitude: f64,
    pub sign: Sign,
    /// Whole degrees within the sign, 0–29.
    pub degree: u8,
    /// Whole arc-minutes, 0–59. Truncated, never rounded up, so a point
    /// is not shown in the next degree or sign before it gets there.
    pub minute: u8,
}

impl ZodiacPoint {
    pub fn new(longitude: f64) -> ZodiacPoint {
        let longitude = normalize_degrees(longitude);
        let sign = Sign::from_longitude(longitude);
        let in_sign = longitude - sign.index() as f64 * 30.0;
        // Work in whole arc-seconds so that 29°59'59.9999" does not
        // become 30° through floating-point noise.
        let total_seconds = ((in_sign * 3600.0) + 1e-6).floor() as u32;
        let total_seconds = total_seconds.min(30 * 3600 - 1);
        ZodiacPoint {
            longitude,
            sign,
            degree: (total_seconds / 3600) as u8,
            minute: (total_seconds % 3600 / 60) as u8,
        }
    }
}

/// Whole-sign house (1–12) of a sign, counted from the rising sign.
pub fn whole_sign_house(sign: Sign, rising_sign: Sign) -> u8 {
    ((sign.index() + 12 - rising_sign.index()) % 12) as u8 + 1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_longitude_into_sign_degree_minute() {
        let p = ZodiacPoint::new(280.3689092);
        assert_eq!((p.sign, p.degree, p.minute), (Sign::Capricorn, 10, 22));
    }

    #[test]
    fn truncates_instead_of_rounding_up() {
        // 29°59'59" Aries must not display as 0° Taurus.
        let p = ZodiacPoint::new(29.0 + 59.0 / 60.0 + 59.0 / 3600.0);
        assert_eq!((p.sign, p.degree, p.minute), (Sign::Aries, 29, 59));
    }

    #[test]
    fn exact_boundaries_belong_to_the_next_sign() {
        let p = ZodiacPoint::new(30.0);
        assert_eq!((p.sign, p.degree, p.minute), (Sign::Taurus, 0, 0));
        let p = ZodiacPoint::new(360.0);
        assert_eq!((p.sign, p.degree, p.minute), (Sign::Aries, 0, 0));
    }

    #[test]
    fn exact_minutes_survive_floating_point() {
        // 15°30' entered as a decimal must read back as 15°30'.
        let p = ZodiacPoint::new(45.5);
        assert_eq!((p.sign, p.degree, p.minute), (Sign::Taurus, 15, 30));
        let p = ZodiacPoint::new(10.0 + 7.0 / 60.0);
        assert_eq!((p.degree, p.minute), (10, 7));
    }

    #[test]
    fn whole_sign_houses_count_from_the_rising_sign() {
        assert_eq!(whole_sign_house(Sign::Leo, Sign::Leo), 1);
        assert_eq!(whole_sign_house(Sign::Virgo, Sign::Leo), 2);
        assert_eq!(whole_sign_house(Sign::Cancer, Sign::Leo), 12);
        assert_eq!(whole_sign_house(Sign::Aries, Sign::Pisces), 2);
    }

    #[test]
    fn traditional_rulers() {
        assert_eq!(Sign::Scorpio.ruler(), Body::Mars);
        assert_eq!(Sign::Aquarius.ruler(), Body::Saturn);
        assert_eq!(Sign::Pisces.ruler(), Body::Jupiter);
    }
}
