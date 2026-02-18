interface ThemeOption {
  label: string;
  value: string;
}

interface ThemeSwitcherProps {
  label: string;
  options: ThemeOption[];
  value: string;
  onChange: (value: string) => void;
}

export function ThemeSwitcher({ label, options, value, onChange }: ThemeSwitcherProps) {
  return (
    <label className="ui-switcher">
      <span className="ui-switcher__label">{label}</span>
      <select
        className="ui-switcher__select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
