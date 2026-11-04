//! Locale selection. The strings come from the generated `locales/` files
//! (`pnpm translation:build`), registered in `main.rs` with `rust_i18n::i18n!`.

/// The locale every key has a value for.
pub const FALLBACK_LOCALE: &str = "en";

/// Applies the requested locale, else the system language, else the fallback.
pub fn init(requested: Option<&str>) -> String {
    let available = rust_i18n::available_locales!();
    let locale = requested
        .map(str::to_owned)
        .or_else(sys_locale::get_locale)
        .and_then(|candidate| pick(&candidate, &available))
        .unwrap_or_else(|| FALLBACK_LOCALE.to_owned());
    gpui_kit::component::set_locale(&locale);
    locale
}

/// The available locale that matches a BCP 47 or POSIX tag by its language part.
pub fn pick(candidate: &str, available: &[impl AsRef<str>]) -> Option<String> {
    let language = candidate
        .split(['-', '_', '.'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    available
        .iter()
        .map(AsRef::as_ref)
        .find(|locale| locale.eq_ignore_ascii_case(&language))
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::pick;

    const AVAILABLE: &[&str] = &["en", "de", "sr"];

    #[test]
    fn matches_the_language_part_of_system_tags() {
        assert_eq!(pick("de-DE", AVAILABLE).as_deref(), Some("de"));
        assert_eq!(pick("sr_RS.UTF-8", AVAILABLE).as_deref(), Some("sr"));
        assert_eq!(pick("EN", AVAILABLE).as_deref(), Some("en"));
        assert_eq!(pick("fr-FR", AVAILABLE), None);
    }
}
