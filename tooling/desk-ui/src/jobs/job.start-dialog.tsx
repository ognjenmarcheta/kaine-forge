import {
  COMPONENT_LAYERS,
  JOB_DEFAULT_MODEL,
  JOB_LIMITS,
  LAB_SCREEN_ID,
  UI_COMPONENT_NAME,
  MAX_REFERENCE_BYTES,
  REFERENCE_TYPES,
  type JobKind,
  type JobStartRequest
} from "@repo/desk/contracts";
import { Input, Label, Modal, Textarea } from "@repo/ui";
import { useId, useState } from "react";

import { toApiError } from "../api/api.client";
import { failureMessageKey } from "../api/api.errors";
import { useT } from "../i18n/i18n.t";
import { Segmented } from "../shell/shell.layout";
import { useRouter } from "../shell/shell.router";
import { useDesk } from "../state/desk.provider";

type ReferenceType = keyof typeof REFERENCE_TYPES;

const isReferenceType = (value: string): value is ReferenceType => value in REFERENCE_TYPES;

/** A file as base64, in chunks so a large image does not overflow the argument list. */
const base64Of = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
};

const SCREEN_MODES = ["light", "dark"] as const;

/**
 * Start a desk job: what to keep in mind, the model, and the limits. The limits start at the
 * kind's defaults; a run that reaches one stops and waits for the owner.
 */
export function JobStartDialog({
  kind,
  open,
  onOpenChange
}: {
  readonly kind: JobKind;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const id = useId();
  const { api } = useDesk();
  const { navigate } = useRouter();
  const limits = JOB_LIMITS[kind];
  const [note, setNote] = useState("");
  const [model, setModel] = useState(JOB_DEFAULT_MODEL);
  const [budget, setBudget] = useState(String(limits.costUsd));
  const [minutes, setMinutes] = useState(String(limits.minutes));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [screenId, setScreenId] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<(typeof SCREEN_MODES)[number]>("light");
  const [width, setWidth] = useState("1440");
  const [height, setHeight] = useState("900");
  const [file, setFile] = useState<File | null>(null);
  const [componentName, setComponentName] = useState("");
  const [layer, setLayer] = useState<(typeof COMPONENT_LAYERS)[number]>("composed");
  const [auditScreen, setAuditScreen] = useState("");
  const isScreen = kind === "screen";
  const isComponent = kind === "component";
  const isAudit = kind === "audit";
  const fileProblem =
    file === null
      ? null
      : !isReferenceType(file.type)
        ? t("desk.job.start.screen.fileType")
        : file.size > MAX_REFERENCE_BYTES
          ? t("desk.job.start.screen.fileSize")
          : null;
  const size = (value: string): number | null => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 320 && parsed <= 3840 ? parsed : null;
  };
  const screenValid =
    !isScreen ||
    (LAB_SCREEN_ID.test(screenId) &&
      title.trim() !== "" &&
      size(width) !== null &&
      size(height) !== null &&
      file !== null &&
      fileProblem === null);

  const budgetValue = Number(budget);
  const minutesValue = Number(minutes);
  const kindValid =
    screenValid &&
    // The planner works from the note: for a component it says what the component is for.
    (!isComponent || (UI_COMPONENT_NAME.test(componentName) && note.trim() !== "")) &&
    (!isAudit || LAB_SCREEN_ID.test(auditScreen));
  const valid =
    Number.isFinite(budgetValue) &&
    budgetValue > 0 &&
    budgetValue <= 200 &&
    Number.isInteger(minutesValue) &&
    minutesValue > 0 &&
    minutesValue <= 240 &&
    model.trim() !== "" &&
    kindValid;

  const start = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const request: JobStartRequest = {
        kind,
        note: note.trim(),
        model: model.trim(),
        budgetUsd: budgetValue,
        minutes: minutesValue
      };
      if (isComponent) request.component = { name: componentName, layer };
      if (isAudit) request.audit = { screenId: auditScreen };
      if (isScreen && file !== null && isReferenceType(file.type)) {
        request.screen = {
          id: screenId,
          title: title.trim(),
          mode,
          width: size(width) ?? 1440,
          height: size(height) ?? 900,
          reference: { mediaType: file.type, dataBase64: await base64Of(file) }
        };
      }
      const job = await api.startJob(request);
      onOpenChange(false);
      navigate({ view: "job", jobId: job.id });
    } catch (failure) {
      const converted = toApiError(failure);
      setError(converted.detail ?? t(failureMessageKey(converted.code)));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t(`desk.job.start.title.${kind}`)}
      description={t(`desk.job.start.description.${kind}`)}
      closeButtonLabel={t("desk.common.close")}
      size="md"
      actions={[
        {
          appearance: "subtle",
          label: t("desk.common.cancel"),
          onClick: () => onOpenChange(false)
        },
        {
          appearance: "default",
          label: t("desk.job.start.confirm"),
          loadingLabel: t("desk.job.start.starting"),
          loading: pending,
          disabled: !valid || pending,
          onClick: () => void start()
        }
      ]}
    >
      {isScreen && (
        <>
          <div className="desk-job-limits">
            <div className="desk-field">
              <Label htmlFor={`${id}-screen`}>{t("desk.job.start.screen.id")}</Label>
              <Input
                id={`${id}-screen`}
                value={screenId}
                aria-describedby={`${id}-screen-help`}
                onChange={(event) => setScreenId(event.target.value.trim())}
              />
              <p id={`${id}-screen-help`} className="desk-muted">
                {t("desk.job.start.screen.idHelp")}
              </p>
            </div>
            <div className="desk-field">
              <Label htmlFor={`${id}-title`}>{t("desk.job.start.screen.title")}</Label>
              <Input
                id={`${id}-title`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
          </div>
          <div className="desk-field">
            <Label htmlFor={`${id}-file`}>{t("desk.job.start.screen.reference")}</Label>
            <Input
              id={`${id}-file`}
              type="file"
              accept={Object.keys(REFERENCE_TYPES).join(",")}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {fileProblem !== null && <p className="desk-field__error">{fileProblem}</p>}
          </div>
          <div className="desk-job-limits">
            <div className="desk-field">
              <Label htmlFor={`${id}-width`}>{t("desk.job.start.screen.width")}</Label>
              <Input
                id={`${id}-width`}
                inputMode="numeric"
                value={width}
                onChange={(event) => setWidth(event.target.value)}
              />
            </div>
            <div className="desk-field">
              <Label htmlFor={`${id}-height`}>{t("desk.job.start.screen.height")}</Label>
              <Input
                id={`${id}-height`}
                inputMode="numeric"
                value={height}
                onChange={(event) => setHeight(event.target.value)}
              />
            </div>
            <div className="desk-field">
              <span className="desk-muted">{t("desk.job.start.screen.mode")}</span>
              <Segmented
                label={t("desk.job.start.screen.mode")}
                value={mode}
                options={SCREEN_MODES}
                name={(entry) => t(`desk.prefs.appearance.${entry}`)}
                onChange={setMode}
              />
            </div>
          </div>
        </>
      )}
      {isComponent && (
        <div className="desk-job-limits">
          <div className="desk-field">
            <Label htmlFor={`${id}-component`}>{t("desk.job.start.component.name")}</Label>
            <Input
              id={`${id}-component`}
              value={componentName}
              aria-describedby={`${id}-component-help`}
              onChange={(event) => setComponentName(event.target.value.trim())}
            />
            <p id={`${id}-component-help`} className="desk-muted">
              {t("desk.job.start.component.nameHelp")}
            </p>
          </div>
          <div className="desk-field">
            <span className="desk-muted">{t("desk.job.start.component.layer")}</span>
            <Segmented
              label={t("desk.job.start.component.layer")}
              value={layer}
              options={COMPONENT_LAYERS}
              name={(entry) => t(`desk.job.start.component.layer.${entry}`)}
              onChange={setLayer}
            />
          </div>
        </div>
      )}
      {isAudit && (
        <div className="desk-field">
          <Label htmlFor={`${id}-audit`}>{t("desk.job.start.audit.screen")}</Label>
          <Input
            id={`${id}-audit`}
            value={auditScreen}
            aria-describedby={`${id}-audit-help`}
            onChange={(event) => setAuditScreen(event.target.value.trim())}
          />
          <p id={`${id}-audit-help`} className="desk-muted">
            {t("desk.job.start.audit.screenHelp")}
          </p>
        </div>
      )}
      <div className="desk-field">
        <Label htmlFor={`${id}-note`}>
          {t(isComponent ? "desk.job.start.component.purpose" : "desk.job.start.note")}
        </Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          maxLength={2000}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className="desk-job-limits">
        <div className="desk-field">
          <Label htmlFor={`${id}-model`}>{t("desk.job.start.model")}</Label>
          <Input
            id={`${id}-model`}
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
        </div>
        <div className="desk-field">
          <Label htmlFor={`${id}-budget`}>{t("desk.job.start.budget")}</Label>
          <Input
            id={`${id}-budget`}
            inputMode="decimal"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
          />
        </div>
        <div className="desk-field">
          <Label htmlFor={`${id}-minutes`}>{t("desk.job.start.minutes")}</Label>
          <Input
            id={`${id}-minutes`}
            inputMode="numeric"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </div>
      </div>
      <p className="desk-muted">{t("desk.job.start.limitsHelp")}</p>
      {error !== null && (
        <p className="desk-field__error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
