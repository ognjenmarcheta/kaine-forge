interface LanguageOption {
  label: string;
  value: string;
}

interface LanguageSwitcherProps {
  label: string;
  options: LanguageOption[];
  value: string;
  onChange: (value: string) => void;
}

export function LanguageSwitcher({ label, options, value, onChange }: LanguageSwitcherProps) {
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
