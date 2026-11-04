//! Theme wiring. Two generated files from `pnpm theme:build` (`@repo/theme`):
//! a GPUI Kit `ThemeSet`, so the kit's components follow the theme, and the
//! full token set in [`Tokens`] for the app's own drawing. Nothing here names a
//! colour or a length.

use std::collections::BTreeMap;

use anyhow::{Context as _, Result, bail};
use gpui_kit::component::{Theme, ThemeRegistry};
use gpui_kit::{App, Global, Rgba, SharedString};
use serde::Deserialize;

const TOKENS_JSON: &str = include_str!("../../assets/theme/tokens.json");
const THEME_SET_JSON: &str = include_str!("../../assets/theme/gpui-kit.json");

/// Registers the generated themes, selects one, follows the system appearance,
/// and installs the [`ActiveTokens`] global.
pub fn init(requested: Option<&str>, cx: &mut App) -> Result<()> {
    let tokens = Tokens::parse(TOKENS_JSON)?;
    let name = requested.unwrap_or(&tokens.default).to_owned();
    if !tokens.themes.contains_key(&name) {
        let known = tokens.themes.keys().cloned().collect::<Vec<_>>().join(", ");
        bail!("unknown theme {name}; the registered themes are {known}");
    }

    ThemeRegistry::global_mut(cx)
        .load_themes_from_str(THEME_SET_JSON)
        .context("the generated GPUI Kit theme set does not parse")?;
    let config = |cx: &App, mode: &str| {
        let key = SharedString::from(format!("{name} {mode}"));
        ThemeRegistry::global(cx)
            .themes()
            .get(&key)
            .cloned()
            .with_context(|| format!("the theme set has no {key}"))
    };
    let (light, dark) = (config(cx, "light")?, config(cx, "dark")?);
    Theme::update(cx, |theme| {
        theme.light_theme = light;
        theme.dark_theme = dark;
    });
    // Picks light or dark from the OS and applies that config to the kit theme.
    Theme::sync_system_appearance(None, cx);
    cx.set_global(ActiveTokens { tokens, name });
    Ok(())
}

/// The selected theme's tokens, readable from any context.
pub struct ActiveTokens {
    tokens: Tokens,
    name: String,
}

impl Global for ActiveTokens {}

impl ActiveTokens {
    pub fn global(cx: &App) -> &Self {
        cx.global::<Self>()
    }

    /// The registered name of the selected theme.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// The selected theme's tokens.
    pub fn theme(&self) -> &ThemeTokens {
        &self.tokens.themes[&self.name]
    }

    /// The colours and shadows of the mode the kit theme is in.
    pub fn mode(&self, cx: &App) -> &ModeTokens {
        if Theme::global(cx).is_dark() {
            &self.theme().modes.dark
        } else {
            &self.theme().modes.light
        }
    }
}

/// Every registered theme's tokens: `apps/desktop-native/assets/theme/tokens.json`.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Tokens {
    /// The theme a launch without `--theme` uses.
    pub default: String,
    pub themes: BTreeMap<String, ThemeTokens>,
}

impl Tokens {
    pub fn parse(json: &str) -> Result<Self> {
        let tokens: Self =
            serde_json::from_str(json).context("the generated tokens do not parse")?;
        if !tokens.themes.contains_key(&tokens.default) {
            bail!(
                "the default theme {} is not in the token file",
                tokens.default
            );
        }
        Ok(tokens)
    }
}

/// One theme: lengths in device pixels, weights and ratios as numbers.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ThemeTokens {
    pub label: String,
    pub space: BTreeMap<String, f32>,
    pub radius: BTreeMap<String, f32>,
    pub control: BTreeMap<String, f32>,
    pub border_width: BTreeMap<String, f32>,
    pub font_weight: BTreeMap<String, u16>,
    pub line_height: BTreeMap<String, f32>,
    pub letter_spacing_heading: f32,
    pub font_family: FontFamilies,
    #[serde(rename = "type")]
    pub type_steps: BTreeMap<String, TypeStep>,
    pub motion: Motion,
    pub components: Components,
    pub modes: Modes,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FontFamilies {
    pub sans: String,
    pub heading: String,
    pub mono: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct TypeStep {
    pub size: f32,
    pub line_height: f32,
    pub weight: u16,
    pub family: String,
    pub letter_spacing: f32,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Motion {
    pub control: u32,
    pub overlay: u32,
    pub drawer: u32,
    pub easing: [f32; 4],
    pub dialog_distance: f32,
    pub menu_distance: f32,
    pub press_scale: f32,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Components {
    pub button_radius: f32,
    pub button_font_weight: u16,
    pub field_radius: f32,
    pub card_radius: f32,
    pub card_padding: f32,
    pub overlay_radius: f32,
    pub dialog_radius: f32,
    pub badge_radius: f32,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Modes {
    pub light: ModeTokens,
    pub dark: ModeTokens,
}

/// The colour roles and shadows of one mode, as the theme defines them.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ModeTokens {
    colors: BTreeMap<String, String>,
    pub shadows: BTreeMap<String, String>,
    pub field_border: String,
    pub card_shadow: String,
}

impl ModeTokens {
    /// The colour of a role; every role of [`Role::ALL`] resolves for every theme.
    pub fn color(&self, role: Role) -> Result<Rgba> {
        let hex = self
            .colors
            .get(role.as_str())
            .with_context(|| format!("the theme has no colour role {}", role.as_str()))?;
        parse_hex(hex).with_context(|| format!("{} is not a hex colour: {hex}", role.as_str()))
    }
}

/// The colour roles the app draws with itself (`--ds-<role>` on the web).
/// Kit components take their colours from the kit theme instead.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Text,
    TextSubtle,
    TextInverse,
    TextBrand,
    TextDanger,
    Link,
    Surface,
    SurfaceSunken,
    SurfaceRaised,
    Border,
    BorderFocused,
    BackgroundBrandBold,
    BackgroundSelected,
}

impl Role {
    pub const ALL: [Role; 13] = [
        Role::Text,
        Role::TextSubtle,
        Role::TextInverse,
        Role::TextBrand,
        Role::TextDanger,
        Role::Link,
        Role::Surface,
        Role::SurfaceSunken,
        Role::SurfaceRaised,
        Role::Border,
        Role::BorderFocused,
        Role::BackgroundBrandBold,
        Role::BackgroundSelected,
    ];

    /// The token name as `theme.roles.ts` spells it.
    pub const fn as_str(self) -> &'static str {
        match self {
            Role::Text => "text",
            Role::TextSubtle => "text-subtle",
            Role::TextInverse => "text-inverse",
            Role::TextBrand => "text-brand",
            Role::TextDanger => "text-danger",
            Role::Link => "link",
            Role::Surface => "surface",
            Role::SurfaceSunken => "surface-sunken",
            Role::SurfaceRaised => "surface-raised",
            Role::Border => "border",
            Role::BorderFocused => "border-focused",
            Role::BackgroundBrandBold => "background-brand-bold",
            Role::BackgroundSelected => "background-selected",
        }
    }
}

/// `#rrggbb` or `#rrggbbaa`, as the themes write every colour.
pub fn parse_hex(hex: &str) -> Option<Rgba> {
    let digits = hex.strip_prefix('#')?;
    let value = u32::from_str_radix(digits, 16).ok()?;
    match digits.len() {
        6 => Some(gpui_kit::rgb(value)),
        8 => Some(gpui_kit::rgba(value)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use gpui_kit::component::ThemeSet;

    use super::{Role, THEME_SET_JSON, TOKENS_JSON, Tokens, parse_hex};

    #[test]
    fn every_role_resolves_in_every_theme_and_mode() {
        let tokens = Tokens::parse(TOKENS_JSON).unwrap();
        for (name, theme) in &tokens.themes {
            for (mode, values) in [("light", &theme.modes.light), ("dark", &theme.modes.dark)] {
                for role in Role::ALL {
                    values
                        .color(role)
                        .unwrap_or_else(|error| panic!("{name} {mode}: {error}"));
                }
            }
            assert!(
                theme.type_steps.contains_key("body"),
                "{name} has no body type step"
            );
            assert!(theme.space.contains_key("200"), "{name} has no space-200");
        }
    }

    #[test]
    fn the_kit_theme_set_keeps_every_generated_colour_key() {
        // The kit ignores colour keys it does not know, so a typo in the generator's
        // mapping would silently drop a colour. Round-tripping through the kit's own
        // types shows which keys it kept.
        let generated: serde_json::Value = serde_json::from_str(THEME_SET_JSON).unwrap();
        let parsed: ThemeSet = serde_json::from_str(THEME_SET_JSON).unwrap();
        let kept: serde_json::Value = serde_json::to_value(&parsed).unwrap();
        let themes = generated["themes"].as_array().unwrap();
        assert!(
            themes.len() >= 2,
            "every theme has a light and a dark config"
        );
        for (index, theme) in themes.iter().enumerate() {
            let kept_colors = kept["themes"][index]["colors"].as_object().unwrap();
            for key in theme["colors"].as_object().unwrap().keys() {
                assert!(
                    kept_colors.contains_key(key),
                    "{}: unknown colour key {key}",
                    theme["name"]
                );
            }
        }
    }

    #[test]
    fn parses_six_and_eight_digit_hex() {
        assert_eq!(parse_hex("#ff0000").unwrap(), gpui_kit::rgb(0x00ff_0000));
        assert_eq!(parse_hex("#ff000080").unwrap(), gpui_kit::rgba(0xff00_0080));
        assert!(parse_hex("red").is_none());
        assert!(parse_hex("#fff").is_none());
    }
}
