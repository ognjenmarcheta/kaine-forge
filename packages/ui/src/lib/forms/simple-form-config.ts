export type SimpleFieldType = "text" | "textarea" | "checkbox";

export type SimpleFormValue = boolean | string;
export type SimpleFormValues = Record<string, SimpleFormValue>;

export interface SimpleFieldConfig {
  description?: string;
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  type: SimpleFieldType;
  validate?: (value: SimpleFormValue, values: SimpleFormValues) => string | undefined;
}

export function buildSimpleFormDefaults(
  fields: SimpleFieldConfig[],
  defaults: Partial<SimpleFormValues> = {}
): SimpleFormValues {
  return fields.reduce<SimpleFormValues>((state, field) => {
    const fallback = field.type === "checkbox" ? false : "";
    const seededValue = defaults[field.name];

    return {
      ...state,
      [field.name]: seededValue ?? fallback
    };
  }, {});
}

export function validateSimpleField(
  field: SimpleFieldConfig,
  value: SimpleFormValue,
  values: SimpleFormValues
): string | undefined {
  if (field.required) {
    if (field.type === "checkbox") {
      if (value !== true) {
        return `${field.label} is required`;
      }
    } else if (typeof value !== "string" || value.trim().length === 0) {
      return `${field.label} is required`;
    }
  }

  return field.validate?.(value, values);
}
