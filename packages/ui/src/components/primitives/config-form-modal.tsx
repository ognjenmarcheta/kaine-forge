import { useForm } from "@tanstack/react-form";
import { useEffect, useMemo } from "react";

import { Checkbox } from "./checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "./field";
import { FormModal } from "./form-modal";
import { Input } from "./input";
import type { ModalProps } from "./modal";
import { Textarea } from "./textarea";
import {
  buildSimpleFormDefaults,
  validateSimpleField,
  type SimpleFieldConfig,
  type SimpleFormValue,
  type SimpleFormValues
} from "../../lib/forms/simple-form-config";

export interface ConfigFormModalProps extends Pick<
  ModalProps,
  | "closeButtonLabel"
  | "closeOnEscape"
  | "closeOnOverlayClick"
  | "description"
  | "onOpenChange"
  | "open"
  | "showCloseButton"
  | "size"
  | "title"
> {
  cancelLabel: string;
  defaultValues?: Partial<SimpleFormValues>;
  fields: SimpleFieldConfig[];
  formError?: string | null;
  isSubmitting?: boolean;
  onSubmit: (values: SimpleFormValues) => void | Promise<void>;
  submitLabel: string;
}

function toFirstError(errors: unknown[]): string | null {
  const [first] = errors;

  if (typeof first === "string") {
    return first;
  }

  return null;
}

export function ConfigFormModal({
  cancelLabel,
  closeButtonLabel,
  closeOnEscape,
  closeOnOverlayClick,
  defaultValues,
  description,
  fields,
  formError,
  isSubmitting = false,
  onOpenChange,
  onSubmit,
  open,
  showCloseButton,
  size,
  submitLabel,
  title
}: ConfigFormModalProps) {
  const mergedDefaults = useMemo(
    () => buildSimpleFormDefaults(fields, defaultValues),
    [defaultValues, fields]
  );

  const form = useForm({
    defaultValues: mergedDefaults,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    }
  });

  useEffect(() => {
    if (open) {
      form.reset(mergedDefaults);
    }
  }, [form, mergedDefaults, open]);

  return (
    <FormModal
      cancelLabel={cancelLabel}
      closeButtonLabel={closeButtonLabel}
      closeOnEscape={closeOnEscape}
      closeOnOverlayClick={closeOnOverlayClick}
      description={description}
      isSubmitting={isSubmitting || form.state.isSubmitting}
      onOpenChange={onOpenChange}
      onSubmit={() => form.handleSubmit()}
      open={open}
      showCloseButton={showCloseButton}
      size={size}
      submitLabel={submitLabel}
      title={title}
    >
      {fields.map((field) => (
        <form.Field
          key={field.name}
          name={field.name}
          validators={{
            onChange: ({ value }) =>
              validateSimpleField(field, value as SimpleFormValue, form.state.values)
          }}
        >
          {(fieldApi) => {
            const error =
              fieldApi.state.meta.isTouched && fieldApi.state.meta.errors.length > 0
                ? toFirstError(fieldApi.state.meta.errors as unknown[])
                : null;

            if (field.type === "checkbox") {
              return (
                <Field data-invalid={error ? true : undefined} orientation="horizontal">
                  <Checkbox
                    checked={fieldApi.state.value === true}
                    id={field.name}
                    onBlur={fieldApi.handleBlur}
                    onCheckedChange={(checked) => fieldApi.handleChange(checked === true)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
                    {error ? <FieldError>{error}</FieldError> : null}
                  </FieldContent>
                </Field>
              );
            }

            return (
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
                {field.type === "textarea" ? (
                  <Textarea
                    aria-invalid={error ? true : undefined}
                    id={field.name}
                    placeholder={field.placeholder}
                    required={field.required}
                    value={typeof fieldApi.state.value === "string" ? fieldApi.state.value : ""}
                    onBlur={fieldApi.handleBlur}
                    onChange={(event) => fieldApi.handleChange(event.target.value)}
                  />
                ) : (
                  <Input
                    aria-invalid={error ? true : undefined}
                    id={field.name}
                    placeholder={field.placeholder}
                    required={field.required}
                    value={typeof fieldApi.state.value === "string" ? fieldApi.state.value : ""}
                    onBlur={fieldApi.handleBlur}
                    onChange={(event) => fieldApi.handleChange(event.target.value)}
                  />
                )}
                {field.description ? (
                  <FieldDescription>{field.description}</FieldDescription>
                ) : null}
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
            );
          }}
        </form.Field>
      ))}
      {formError ? <p className="ui-form__error">{formError}</p> : null}
    </FormModal>
  );
}
