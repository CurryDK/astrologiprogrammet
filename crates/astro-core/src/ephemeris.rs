//! Safe wrapper around Swiss Ephemeris.
//!
//! The C library is not thread-safe, so every call goes through one
//! process-wide lock. It also keeps its state, the folder of the data files
//! included, per thread; each thread that calculates is therefore pointed
//! at the folder once, the first time it asks for something.

use std::cell::Cell;
use std::ffi::{CStr, CString};
use std::fmt;
use std::os::raw::c_char;
use std::path::Path;
use std::sync::Mutex;

use chrono::{DateTime, Datelike, Timelike, Utc};

use crate::ffi;

/// The data files cover 1800-01-01 to 2399-12-31.
pub const MIN_YEAR: i32 = 1800;
pub const MAX_YEAR: i32 = 2399;

const REQUIRED_FILES: [&str; 2] = ["sepl_18.se1", "semo_18.se1"];

/// The folder of the data files once `init` has run.
static STATE: Mutex<Option<CString>> = Mutex::new(None);

thread_local! {
    /// Whether this thread's copy of the library knows the folder.
    static PATH_SET: Cell<bool> = const { Cell::new(false) };
}

#[derive(Debug, Clone, PartialEq)]
pub enum EphemerisError {
    /// `init` has not been called.
    NotInitialized,
    /// A required data file is missing from the ephemeris folder.
    MissingDataFile(String),
    /// The folder path cannot be passed to the C library.
    UnusablePath(String),
    /// The date is outside the range of the bundled data files.
    DateOutOfRange(i32),
    /// The library fell back to its low-precision built-in model.
    PrecisionFallback(String),
    /// Any other error reported by the library.
    Library(String),
}

impl fmt::Display for EphemerisError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotInitialized => write!(f, "ephemeris is not initialized"),
            Self::MissingDataFile(name) => write!(f, "ephemeris data file missing: {name}"),
            Self::UnusablePath(path) => write!(f, "ephemeris path cannot be used: {path}"),
            Self::DateOutOfRange(year) => {
                write!(f, "year {year} is outside {MIN_YEAR}-{MAX_YEAR}")
            }
            Self::PrecisionFallback(msg) => {
                write!(f, "ephemeris data files were not used: {msg}")
            }
            Self::Library(msg) => write!(f, "ephemeris error: {msg}"),
        }
    }
}

impl std::error::Error for EphemerisError {}

/// Point the library at the folder holding the `.se1` data files.
/// Must be called once before any calculation.
pub fn init(ephemeris_dir: &Path) -> Result<(), EphemerisError> {
    for name in REQUIRED_FILES {
        if !ephemeris_dir.join(name).is_file() {
            return Err(EphemerisError::MissingDataFile(name.to_string()));
        }
    }
    let c_path = path_for_c(ephemeris_dir)?;
    let mut state = STATE.lock().unwrap_or_else(|e| e.into_inner());
    unsafe { ffi::swe_set_ephe_path(c_path.as_ptr()) };
    *state = Some(c_path);
    PATH_SET.with(|set| set.set(true));
    Ok(())
}

/// Ecliptic position of one body as returned by the library.
#[derive(Debug, Clone, Copy)]
pub struct RawPosition {
    pub longitude: f64,
    pub latitude: f64,
    /// Longitude speed in degrees per day; negative when retrograde.
    pub speed: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct RawAngles {
    pub ascendant: f64,
    pub midheaven: f64,
}

/// Julian day (UT) for a UTC instant.
pub fn julian_day(utc: DateTime<Utc>) -> Result<f64, EphemerisError> {
    let year = utc.year();
    if !(MIN_YEAR..=MAX_YEAR).contains(&year) {
        return Err(EphemerisError::DateOutOfRange(year));
    }
    let hour = utc.hour() as f64
        + utc.minute() as f64 / 60.0
        + (utc.second() as f64 + utc.nanosecond() as f64 / 1e9) / 3600.0;
    // No lock needed: swe_julday is a pure function.
    Ok(unsafe {
        ffi::swe_julday(
            year,
            utc.month() as i32,
            utc.day() as i32,
            hour,
            ffi::SE_GREG_CAL,
        )
    })
}

/// Apparent geocentric tropical position of a body (`ffi::SE_*` number).
pub fn body_position(jd_ut: f64, body: i32) -> Result<RawPosition, EphemerisError> {
    let _guard = lock_initialized()?;
    let flags = ffi::SEFLG_SWIEPH | ffi::SEFLG_SPEED;
    let mut xx = [0.0_f64; 6];
    let mut serr = [0 as c_char; ffi::SERR_LEN];
    let ret = unsafe { ffi::swe_calc_ut(jd_ut, body, flags, xx.as_mut_ptr(), serr.as_mut_ptr()) };
    if ret < 0 {
        return Err(EphemerisError::Library(message(&serr)));
    }
    if ret & ffi::SEFLG_SWIEPH == 0 {
        return Err(EphemerisError::PrecisionFallback(message(&serr)));
    }
    Ok(RawPosition {
        longitude: xx[0],
        latitude: xx[1],
        speed: xx[3],
    })
}

/// Ascendant and Midheaven for a place (east longitude and north latitude positive).
pub fn angles(jd_ut: f64, latitude: f64, longitude: f64) -> Result<RawAngles, EphemerisError> {
    let _guard = lock_initialized()?;
    let mut cusps = [0.0_f64; 13];
    let mut ascmc = [0.0_f64; 10];
    // Whole-sign houses: the cusps are not used, only the two angles.
    unsafe {
        ffi::swe_houses(
            jd_ut,
            latitude,
            longitude,
            'W' as i32,
            cusps.as_mut_ptr(),
            ascmc.as_mut_ptr(),
        )
    };
    Ok(RawAngles {
        ascendant: ascmc[ffi::SE_ASC],
        midheaven: ascmc[ffi::SE_MC],
    })
}

/// True obliquity of the ecliptic in degrees.
pub fn true_obliquity(jd_ut: f64) -> Result<f64, EphemerisError> {
    let _guard = lock_initialized()?;
    let mut xx = [0.0_f64; 6];
    let mut serr = [0 as c_char; ffi::SERR_LEN];
    let ret =
        unsafe { ffi::swe_calc_ut(jd_ut, ffi::SE_ECL_NUT, 0, xx.as_mut_ptr(), serr.as_mut_ptr()) };
    if ret < 0 {
        return Err(EphemerisError::Library(message(&serr)));
    }
    Ok(xx[0])
}

/// Greenwich apparent sidereal time in hours.
pub fn sidereal_time(jd_ut: f64) -> Result<f64, EphemerisError> {
    let _guard = lock_initialized()?;
    Ok(unsafe { ffi::swe_sidtime(jd_ut) })
}

fn lock_initialized() -> Result<std::sync::MutexGuard<'static, Option<CString>>, EphemerisError> {
    let guard = STATE.lock().unwrap_or_else(|e| e.into_inner());
    let Some(path) = guard.as_ref() else {
        return Err(EphemerisError::NotInitialized);
    };
    // A thread other than the one that called `init` would otherwise look
    // for the data files in the library's built-in default folder.
    if !PATH_SET.with(|set| set.replace(true)) {
        unsafe { ffi::swe_set_ephe_path(path.as_ptr()) };
    }
    Ok(guard)
}

fn message(serr: &[c_char]) -> String {
    // The library always NUL-terminates within the buffer.
    unsafe { CStr::from_ptr(serr.as_ptr()) }
        .to_string_lossy()
        .trim()
        .to_string()
}

/// The C library opens files with the narrow-character API, which on Windows
/// expects the system ANSI code page rather than UTF-8. A user folder such as
/// `C:\Users\Søren` must therefore be converted before it is handed over.
#[cfg(windows)]
fn path_for_c(path: &Path) -> Result<CString, EphemerisError> {
    use std::os::windows::ffi::OsStrExt;

    const CP_ACP: u32 = 0;
    const WC_NO_BEST_FIT_CHARS: u32 = 0x0400;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn WideCharToMultiByte(
            code_page: u32,
            flags: u32,
            wide: *const u16,
            wide_len: i32,
            out: *mut u8,
            out_len: i32,
            default_char: *const u8,
            used_default_char: *mut i32,
        ) -> i32;
    }

    let unusable = || EphemerisError::UnusablePath(path.display().to_string());
    let wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    if wide.is_empty() {
        return Err(unusable());
    }
    let mut out = vec![0_u8; wide.len() * 4];
    let mut used_default = 0_i32;
    let written = unsafe {
        WideCharToMultiByte(
            CP_ACP,
            WC_NO_BEST_FIT_CHARS,
            wide.as_ptr(),
            wide.len() as i32,
            out.as_mut_ptr(),
            out.len() as i32,
            std::ptr::null(),
            &mut used_default,
        )
    };
    // A substituted character means the path cannot be represented and
    // the library would look in the wrong place.
    if written <= 0 || used_default != 0 {
        return Err(unusable());
    }
    out.truncate(written as usize);
    CString::new(out).map_err(|_| unusable())
}

#[cfg(not(windows))]
fn path_for_c(path: &Path) -> Result<CString, EphemerisError> {
    use std::os::unix::ffi::OsStrExt;
    CString::new(path.as_os_str().as_bytes())
        .map_err(|_| EphemerisError::UnusablePath(path.display().to_string()))
}
