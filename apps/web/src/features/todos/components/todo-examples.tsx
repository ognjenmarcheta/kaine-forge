import {
  Checkbox,
  ConfigFormModal,
  Field,
  FieldError,
  FieldLabel,
  FormModal,
  Input,
  Textarea,
  useUiForm,
  type SimpleFieldConfig,
  type SimpleFormValues
} from "@repo/ui";
import { useEffect, useMemo, useRef, useState } from "react";

import { useTranslation } from "../../../hooks/use-translation";
import type { TodoDraft } from "../todos.type";
interface TodoExampleDraft {
  title: string;
  description: string;
  markCompleted: boolean;
  planningNotes: string;
}
export function TodoExamples({
  mode,
  onClose,
  onCreate,
  pending,
  onDirty
}: {
  mode: "simple" | "advanced" | null;
  onClose: () => void;
  onCreate: (draft: TodoDraft, completed: boolean) => Promise<void>;
  pending: boolean;
  onDirty: () => void;
}) {
  const { t } = useTranslation();
  const isSimpleExampleOpen = mode === "simple";
  const isAdvancedExampleOpen = mode === "advanced";
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSimpleExampleSubmitting, setIsSimpleExampleSubmitting] = useState(false);
  const simpleExampleFields = useMemo<SimpleFieldConfig[]>(
    () => [
      {
        label: t("todos.examples.simple.title"),
        name: "title",
        required: true,
        validate: (value) =>
          typeof value === "string" && value.trim().length <= 255
            ? undefined
            : t("todos.titleValidation"),
        type: "text"
      },
      {
        label: t("todos.examples.simple.description"),
        name: "description",
        type: "textarea"
      },
      {
        label: t("todos.examples.simple.markCompleted"),
        name: "markCompleted",
        type: "checkbox"
      }
    ],
    [t]
  );

  const advancedDefaultValues: TodoExampleDraft = {
    description: "",
    markCompleted: false,
    planningNotes: "",
    title: ""
  };

  const advancedExampleForm = useUiForm({
    defaultValues: advancedDefaultValues,
    onSubmit: async ({ value }) => {
      try {
        setActionError(null);
        await onCreate(
          {
            description: value.description,
            title: value.title
          },
          value.markCompleted
        );
      } catch {
        setActionError(t("todos.createUncertain"));
      }
    }
  });

  const wasAdvancedOpen = useRef(false);
  useEffect(() => {
    if (isAdvancedExampleOpen && !wasAdvancedOpen.current) {
      advancedExampleForm.reset();
    }
    wasAdvancedOpen.current = isAdvancedExampleOpen;
  }, [advancedExampleForm, isAdvancedExampleOpen]);

  return (
    <div onChangeCapture={onDirty}>
      <ConfigFormModal
        cancelLabel={t("button.cancel")}
        defaultValues={{
          description: "",
          markCompleted: false,
          title: ""
        }}
        description={t("todos.examples.simple.descriptionText")}
        fields={simpleExampleFields}
        formError={actionError}
        isSubmitting={isSimpleExampleSubmitting}
        open={isSimpleExampleOpen}
        submitLabel={t("todos.examples.simple.submit")}
        title={t("todos.examples.simple.modalTitle")}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        onSubmit={async (values: SimpleFormValues) => {
          const title = typeof values.title === "string" ? values.title : "";
          const description = typeof values.description === "string" ? values.description : "";
          const markCompleted = values.markCompleted === true;

          try {
            setIsSimpleExampleSubmitting(true);
            await onCreate(
              {
                description,
                title
              },
              markCompleted
            );
          } catch {
            setActionError(t("todos.createUncertain"));
          } finally {
            setIsSimpleExampleSubmitting(false);
          }
        }}
      />
      <FormModal
        cancelLabel={t("button.cancel")}
        description={t("todos.examples.advanced.descriptionText")}
        isSubmitting={pending}
        open={isAdvancedExampleOpen}
        submitLabel={t("todos.examples.advanced.submit")}
        title={t("todos.examples.advanced.modalTitle")}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        onSubmit={() => advancedExampleForm.handleSubmit()}
      >
        {actionError ? <FieldError>{actionError}</FieldError> : null}
        <advancedExampleForm.Field
          name="title"
          validators={{
            onChange: ({ value }) =>
              value.trim().length > 0 && value.trim().length <= 255
                ? undefined
                : t("todos.titleValidation")
          }}
        >
          {(fieldApi) => (
            <Field>
              <FieldLabel htmlFor="advanced-example-title">
                {t("todos.examples.advanced.title")}
              </FieldLabel>
              <Input
                id="advanced-example-title"
                value={fieldApi.state.value}
                onBlur={fieldApi.handleBlur}
                onChange={(event) => fieldApi.handleChange(event.target.value)}
              />
              {fieldApi.state.meta.isTouched && fieldApi.state.meta.errors[0] ? (
                <FieldError>{String(fieldApi.state.meta.errors[0])}</FieldError>
              ) : null}
            </Field>
          )}
        </advancedExampleForm.Field>
        <div className="grid grid-cols-1 gap-[var(--ds-space-150)] md:grid-cols-2">
          <advancedExampleForm.Field name="description">
            {(fieldApi) => (
              <Field>
                <FieldLabel htmlFor="advanced-example-description">
                  {t("todos.examples.advanced.description")}
                </FieldLabel>
                <Textarea
                  id="advanced-example-description"
                  value={fieldApi.state.value}
                  onBlur={fieldApi.handleBlur}
                  onChange={(event) => fieldApi.handleChange(event.target.value)}
                />
              </Field>
            )}
          </advancedExampleForm.Field>
          <advancedExampleForm.Field name="planningNotes">
            {(fieldApi) => (
              <Field>
                <FieldLabel htmlFor="advanced-example-notes">
                  {t("todos.examples.advanced.notes")}
                </FieldLabel>
                <Textarea
                  id="advanced-example-notes"
                  value={fieldApi.state.value}
                  onBlur={fieldApi.handleBlur}
                  onChange={(event) => fieldApi.handleChange(event.target.value)}
                />
              </Field>
            )}
          </advancedExampleForm.Field>
        </div>
        <advancedExampleForm.Field name="markCompleted">
          {(fieldApi) => (
            <label
              className="flex items-center gap-[var(--ds-space-100)]"
              htmlFor="advanced-example-complete"
            >
              <Checkbox
                checked={fieldApi.state.value}
                id="advanced-example-complete"
                onBlur={fieldApi.handleBlur}
                onCheckedChange={(checked) => fieldApi.handleChange(checked === true)}
              />
              <span>{t("todos.examples.advanced.markCompleted")}</span>
            </label>
          )}
        </advancedExampleForm.Field>
      </FormModal>
    </div>
  );
}
