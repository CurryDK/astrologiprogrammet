//! Hand-written declarations for the few Swiss Ephemeris functions we use.
//! Signatures follow `vendor/swisseph/swephexp.h`.

use std::os::raw::{c_char, c_double, c_int};

pub const SE_ECL_NUT: i32 = -1;
pub const SE_SUN: i32 = 0;
pub const SE_MOON: i32 = 1;
pub const SE_MERCURY: i32 = 2;
pub const SE_VENUS: i32 = 3;
pub const SE_MARS: i32 = 4;
pub const SE_JUPITER: i32 = 5;
pub const SE_SATURN: i32 = 6;
pub const SE_URANUS: i32 = 7;
pub const SE_NEPTUNE: i32 = 8;
pub const SE_PLUTO: i32 = 9;
pub const SE_TRUE_NODE: i32 = 11;

pub const SEFLG_SWIEPH: i32 = 2;
pub const SEFLG_SPEED: i32 = 256;

pub const SE_GREG_CAL: c_int = 1;

/// Index of the Ascendant / Midheaven in the `ascmc` array of `swe_houses`.
pub const SE_ASC: usize = 0;
pub const SE_MC: usize = 1;

/// Size of the error string buffer the library writes into (AS_MAXCH).
pub const SERR_LEN: usize = 256;

unsafe extern "C" {
    pub fn swe_set_ephe_path(path: *const c_char);
    pub fn swe_calc_ut(
        tjd_ut: c_double,
        ipl: i32,
        iflag: i32,
        xx: *mut c_double,
        serr: *mut c_char,
    ) -> i32;
    pub fn swe_houses(
        tjd_ut: c_double,
        geolat: c_double,
        geolon: c_double,
        hsys: c_int,
        cusps: *mut c_double,
        ascmc: *mut c_double,
    ) -> c_int;
    pub fn swe_julday(
        year: c_int,
        month: c_int,
        day: c_int,
        hour: c_double,
        gregflag: c_int,
    ) -> c_double;
    pub fn swe_sidtime(tjd_ut: c_double) -> c_double;
}
