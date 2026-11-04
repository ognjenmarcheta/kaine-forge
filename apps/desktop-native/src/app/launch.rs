//! Command-line options for manual checks: `--theme <name>` and `--locale <code>`.

use anyhow::{Result, bail};

#[derive(Debug, Default, PartialEq, Eq)]
pub struct LaunchOptions {
    /// A registered theme name (`byte-forge`, `moss`); the default theme when absent.
    pub theme: Option<String>,
    /// A supported locale (`en`, `de`, `sr`); the system locale when absent.
    pub locale: Option<String>,
}

impl LaunchOptions {
    pub fn from_args(args: impl IntoIterator<Item = String>) -> Result<Self> {
        let mut options = Self::default();
        let mut args = args.into_iter();
        while let Some(arg) = args.next() {
            let (flag, inline) = match arg.split_once('=') {
                Some((flag, value)) => (flag.to_owned(), Some(value.to_owned())),
                None => (arg, None),
            };
            let mut value = || -> Result<String> {
                match inline.clone().or_else(|| args.next()) {
                    Some(value) if !value.is_empty() => Ok(value),
                    _ => bail!("{flag} needs a value"),
                }
            };
            match flag.as_str() {
                "--theme" => options.theme = Some(value()?),
                "--locale" => options.locale = Some(value()?),
                _ => bail!("unknown argument {flag}; use --theme <name> and --locale <code>"),
            }
        }
        Ok(options)
    }
}

#[cfg(test)]
mod tests {
    use super::LaunchOptions;

    fn parse(args: &[&str]) -> anyhow::Result<LaunchOptions> {
        LaunchOptions::from_args(args.iter().map(ToString::to_string))
    }

    #[test]
    fn reads_theme_and_locale_in_both_spellings() {
        let options = parse(&["--theme", "moss", "--locale=de"]).unwrap();
        assert_eq!(options.theme.as_deref(), Some("moss"));
        assert_eq!(options.locale.as_deref(), Some("de"));
        assert_eq!(parse(&[]).unwrap(), LaunchOptions::default());
    }

    #[test]
    fn rejects_unknown_flags_and_missing_values() {
        assert!(parse(&["--colour", "red"]).is_err());
        assert!(parse(&["--theme"]).is_err());
        assert!(parse(&["--locale="]).is_err());
    }
}
