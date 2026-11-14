//! A computed chart: body positions, angles, whole-sign houses and sect
//! for one instant and place (specification §2).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::ephemeris::{self, EphemerisError};
use crate::ffi;
use crate::normalize_degrees;
use crate::zodiac::{Body, Sign, ZodiacPoint, whole_sign_house};

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BodyPosition {
    pub body: Body,
    #[serde(flatten)]
    pub point: ZodiacPoint,
    /// Ecliptic latitude in degrees.
    pub latitude: f64,
    /// Longitude speed in degrees per day; negative when retrograde.
    pub speed: f64,
    pub retrograde: bool,
    /// Whole-sign house, 1–12.
    pub house: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Angle {
    #[serde(flatten)]
    pub point: ZodiacPoint,
    /// Whole-sign house the angle falls in, 1–12.
    pub house: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Angles {
    pub ascendant: Angle,
    pub descendant: Angle,
    pub midheaven: Angle,
    pub imum_coeli: Angle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Sect {
    Day,
    Night,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct House {
    /// 1–12.
    pub number: u8,
    pub sign: Sign,
    /// Traditional ruler of the sign.
    pub ruler: Body,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Chart {
    pub utc: DateTime<Utc>,
    pub julian_day: f64,
    pub latitude: f64,
    pub longitude: f64,
    /// In the order of [`Body::ALL`].
    pub positions: Vec<BodyPosition>,
    pub angles: Angles,
    pub houses: [House; 12],
    /// Derived from the Sun's position relative to the horizon.
    pub sect: Sect,
}

impl Chart {
    pub fn position(&self, body: Body) -> &BodyPosition {
        self.positions
            .iter()
            .find(|p| p.body == body)
            .expect("a chart holds every body")
    }
}

/// Compute a chart for a UTC instant at a place.
/// `latitude` is positive north, `longitude` positive east, both in degrees.
pub fn compute_chart(
    utc: DateTime<Utc>,
    latitude: f64,
    longitude: f64,
) -> Result<Chart, EphemerisError> {
    let jd = ephemeris::julian_day(utc)?;
    let raw_angles = ephemeris::angles(jd, latitude, longitude)?;
    let rising_sign = Sign::from_longitude(raw_angles.ascendant);

    let mut positions = Vec::with_capacity(Body::ALL.len());
    for body in Body::ALL {
        let (longitude, latitude, speed) = match body {
            Body::SouthNode => {
                let node = ephemeris::body_position(jd, ffi::SE_TRUE_NODE)?;
                (node.longitude + 180.0, -node.latitude, node.speed)
            }
            _ => {
                let raw = ephemeris::body_position(jd, library_number(body))?;
                (raw.longitude, raw.latitude, raw.speed)
            }
        };
        let point = ZodiacPoint::new(longitude);
        positions.push(BodyPosition {
            body,
            point,
            latitude,
            speed,
            retrograde: speed < 0.0,
            house: whole_sign_house(point.sign, rising_sign),
        });
    }

    let angle = |longitude: f64| {
        let point = ZodiacPoint::new(longitude);
        Angle {
            point,
            house: whole_sign_house(point.sign, rising_sign),
        }
    };
    let angles = Angles {
        ascendant: angle(raw_angles.ascendant),
        descendant: angle(raw_angles.ascendant + 180.0),
        midheaven: angle(raw_angles.midheaven),
        imum_coeli: angle(raw_angles.midheaven + 180.0),
    };

    let houses = std::array::from_fn(|i| {
        let sign = Sign::ALL[(rising_sign.index() + i) % 12];
        House {
            number: i as u8 + 1,
            sign,
            ruler: sign.ruler(),
        }
    });

    let sun = positions[0].point.longitude;
    let sect = sect_from_sun(sun, raw_angles.ascendant);

    Ok(Chart {
        utc,
        julian_day: jd,
        latitude,
        longitude,
        positions,
        angles,
        houses,
        sect,
    })
}

/// Day when the Sun is above the Ascendant–Descendant axis.
///
/// This is the geometric definition on the ecliptic: no refraction and no
/// solar disc size. The zodiac half from the Ascendant forward to the
/// Descendant is below the horizon. A Sun exactly on either end of the axis
/// counts as day; the specification leaves that case open and the user can
/// override sect manually.
pub fn sect_from_sun(sun_longitude: f64, ascendant: f64) -> Sect {
    let ahead_of_ascendant = normalize_degrees(sun_longitude - ascendant);
    if ahead_of_ascendant > 0.0 && ahead_of_ascendant < 180.0 {
        Sect::Night
    } else {
        Sect::Day
    }
}

fn library_number(body: Body) -> i32 {
    match body {
        Body::Sun => ffi::SE_SUN,
        Body::Moon => ffi::SE_MOON,
        Body::Mercury => ffi::SE_MERCURY,
        Body::Venus => ffi::SE_VENUS,
        Body::Mars => ffi::SE_MARS,
        Body::Jupiter => ffi::SE_JUPITER,
        Body::Saturn => ffi::SE_SATURN,
        Body::Uranus => ffi::SE_URANUS,
        Body::Neptune => ffi::SE_NEPTUNE,
        Body::Pluto => ffi::SE_PLUTO,
        Body::NorthNode | Body::SouthNode => ffi::SE_TRUE_NODE,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sun_below_the_horizon_is_a_night_chart() {
        // Ascendant 0° Aries: 0°–180° is below the horizon.
        assert_eq!(sect_from_sun(90.0, 0.0), Sect::Night);
        assert_eq!(sect_from_sun(270.0, 0.0), Sect::Day);
    }

    #[test]
    fn sect_works_across_the_aries_point() {
        // Ascendant 350°: 350°→170° is below the horizon.
        assert_eq!(sect_from_sun(10.0, 350.0), Sect::Night);
        assert_eq!(sect_from_sun(340.0, 350.0), Sect::Day);
        assert_eq!(sect_from_sun(171.0, 350.0), Sect::Day);
    }

    #[test]
    fn sun_exactly_on_the_horizon_counts_as_day() {
        assert_eq!(sect_from_sun(100.0, 100.0), Sect::Day);
        assert_eq!(sect_from_sun(280.0, 100.0), Sect::Day);
    }
}
