import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "../primitives/select";

export interface LabeledSelectOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface LabeledSelectActionItem {
  label: string;
  onSelect: () => void;
}

export interface LabeledSelectProps {
  actionItem?: LabeledSelectActionItem;
  ariaLabel?: string;
  disabled?: boolean;
  label: string;
  onValueChange: (value: string) => void;
  options: LabeledSelectOption[];
  placeholder?: string;
  value?: string;
}

export const ACTION_ITEM_VALUE = "__ui_select_action_item__";

interface ApplyLabeledSelectChangeInput {
  actionItem?: LabeledSelectActionItem;
  nextValue: string;
  onValueChange: (value: string) => void;
}

export function resolveSelectDisplayValue(value: string | undefined): string | undefined {
  return value ? value : undefined;
}

export function applyLabeledSelectChange({
  actionItem,
  nextValue,
  onValueChange
}: ApplyLabeledSelectChangeInput): void {
  if (actionItem && nextValue === ACTION_ITEM_VALUE) {
    actionItem.onSelect();
    return;
  }

  onValueChange(nextValue);
}

export function LabeledSelect({
  actionItem,
  ariaLabel,
  disabled = false,
  label,
  onValueChange,
  options,
  placeholder,
  value
}: LabeledSelectProps) {
  const displayValue = resolveSelectDisplayValue(value);

  return (
    <label className="ui-switcher">
      <span className="ui-switcher__label">{label}</span>
      <Select
        disabled={disabled}
        {...(displayValue ? { value: displayValue } : {})}
        onValueChange={(nextValue) => {
          applyLabeledSelectChange({
            nextValue,
            onValueChange,
            ...(actionItem ? { actionItem } : {})
          });
        }}
      >
        <SelectTrigger aria-label={ariaLabel ?? label} className="ui-switcher__trigger">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              {...(option.disabled !== undefined ? { disabled: option.disabled } : {})}
            >
              {option.label}
            </SelectItem>
          ))}
          {actionItem ? (
            <>
              <SelectSeparator className="ui-select__separator" />
              <SelectItem className="ui-select__item--action" value={ACTION_ITEM_VALUE}>
                {actionItem.label}
              </SelectItem>
            </>
          ) : null}
        </SelectContent>
      </Select>
    </label>
  );
}
