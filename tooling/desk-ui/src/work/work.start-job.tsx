import {
  COMPONENT_LAYERS,
  JOB_DEFAULT_MODEL,
  JOB_LIMITS,
  LAB_SCREEN_ID,
  UI_COMPONENT_NAME,
  MAX_REFERENCE_BYTES,
  REFERENCE_TYPES,
  REPO_PATH,
  SPECIALIST_TARGET_KINDS,
  specialistProblem,
  type JobKind,
  type JobStartRequest,
  type SpecialistTargetKind
} from "@repo/desk/contracts";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from "@repo/ui";
import { useId, useState } from "react";

import { useAgentList } from "../agents/agents.use";
import { toApiError } from "../api/api.client";
import { failureMessageKey } from "../api/api.errors";
import { useT } from "../i18n/i18n.t";
import { useRouter } from "../shell/shell.router";
import { FailureText, Segmented } from "../shell/shell.ui";
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

/** A positive whole issue number, or `null`. */
const issueNumberOf = (value: string): number | null => {
  const parsed = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * A specialist job's agent and target. Only the report agents that edit nothing are listed: the
 * desk refuses any other agent.
 */
function SpecialistFields({
  agentId,
  onAgent,
  targetKind,
  onTargetKind,
  target,
  onTarget
}: {
  readonly agentId: string;
  readonly onAgent: (id: string) => void;
  readonly targetKind: SpecialistTargetKind;
  readonly onTargetKind: (kind: SpecialistTargetKind) => void;
  readonly target: string;
  readonly onTarget: (value: string) => void;
}) {
  const t = useT();
  const id = useId();
  const { state } = useAgentList();
  const agents =
    state.status === "ok"
      ? state.list.agents.filter(
          (view) => view.problems.length === 0 && specialistProblem(view.definition) === null
        )
      : [];
  return (
    <>
      <div className="dk-field">
        <Label htmlFor={`${id}-agent`}>{t("desk.job.start.specialist.agent")}</Label>
        {state.status === "error" ? (
          <FailureText code={state.code} detail={state.detail} />
        ) : state.status === "ok" && agents.length === 0 ? (
          <p className="dk-hint">{t("desk.job.start.specialist.noAgents")}</p>
        ) : (
          <Select value={agentId} onValueChange={onAgent}>
            <SelectTrigger id={`${id}-agent`} aria-describedby={`${id}-agent-help`}>
              <SelectValue placeholder={t("desk.job.start.specialist.agentPick")} />
            </SelectTrigger>
            <SelectContent>
              {agents.map(({ definition }) => (
                <SelectItem key={definition.id} value={definition.id}>
                  {definition.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p id={`${id}-agent-help`} className="dk-hint">
          {t("desk.job.start.specialist.agentHelp")}
        </p>
      </div>
      <div className="dk-field">
        <span className="dk-hint">{t("desk.job.start.specialist.target")}</span>
        <Segmented
          label={t("desk.job.start.specialist.target")}
          value={targetKind}
          options={SPECIALIST_TARGET_KINDS}
          name={(entry) => t(`desk.job.start.specialist.targetKind.${entry}`)}
          onChange={onTargetKind}
        />
      </div>
      <div className="dk-field">
        <Label htmlFor={`${id}-target`}>
          {t(`desk.job.start.specialist.targetValue.${targetKind}`)}
        </Label>
        {targetKind === "brief" ? (
          <Textarea
            id={`${id}-target`}
            value={target}
            maxLength={4000}
            aria-describedby={`${id}-target-help`}
            onChange={(event) => onTarget(event.target.value)}
          />
        ) : (
          <Input
            id={`${id}-target`}
            value={target}
            inputMode={targetKind === "issue" ? "numeric" : undefined}
            aria-describedby={`${id}-target-help`}
            onChange={(event) => onTarget(event.target.value.trim())}
          />
        )}
        <p id={`${id}-target-help`} className="dk-hint">
          {t(`desk.job.start.specialist.targetHelp.${targetKind}`)}
        </p>
      </div>
    </>
  );
}

/**
 * Start a desk job: what to keep in mind, the model, and the limits. The limits start at the
 * kind's defaults; a run that reaches one stops and waits for the owner.
 */
export function JobStartForm({
  kind,
  screen = "",
  agentId: initialAgent = "",
  onCancel,
  onStarted
}: {
  readonly kind: JobKind;
  /** The lab screen an audit starts on, when New work opened from that screen. */
  readonly screen?: string;
  /** The agent a specialist job starts with, when New work opened from that agent. */
  readonly agentId?: string;
  readonly onCancel: () => void;
  readonly onStarted: () => void;
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
  const [auditScreen, setAuditScreen] = useState(screen);
  const [agentId, setAgentId] = useState(initialAgent);
  const [targetKind, setTargetKind] = useState<SpecialistTargetKind>("path");
  const [target, setTarget] = useState("");
  const isScreen = kind === "screen";
  const isComponent = kind === "component";
  const isAudit = kind === "audit";
  const isSpecialist = kind === "specialist";
  const specialistTarget = (): NonNullable<JobStartRequest["specialist"]>["target"] | null => {
    if (targetKind === "issue") {
      const number = issueNumberOf(target);
      return number === null ? null : { kind: "issue", value: number };
    }
    if (targetKind === "path") {
      return REPO_PATH.test(target) && target.length <= 300
        ? { kind: "path", value: target }
        : null;
    }
    return target.trim() === "" ? null : { kind: "brief", value: target.trim() };
  };
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
    (!isAudit || LAB_SCREEN_ID.test(auditScreen)) &&
    (!isSpecialist || (agentId !== "" && specialistTarget() !== null));
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
      const chosenTarget = specialistTarget();
      if (isSpecialist && chosenTarget !== null)
        request.specialist = { agentId, target: chosenTarget };
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
      onStarted();
      navigate({ view: "job", jobId: job.id });
    } catch (failure) {
      const converted = toApiError(failure);
      setError(converted.detail ?? t(failureMessageKey(converted.code)));
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="dk-stack dk-gap-200"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !pending) void start();
      }}
    >
      <p className="dk-t-sub dk-t-small">{t(`desk.job.start.description.${kind}`)}</p>
      {isScreen && (
        <>
          <div className="dk-grid3">
            <div className="dk-field">
              <Label htmlFor={`${id}-screen`}>{t("desk.job.start.screen.id")}</Label>
              <Input
                id={`${id}-screen`}
                value={screenId}
                aria-describedby={`${id}-screen-help`}
                onChange={(event) => setScreenId(event.target.value.trim())}
              />
              <p id={`${id}-screen-help`} className="dk-hint">
                {t("desk.job.start.screen.idHelp")}
              </p>
            </div>
            <div className="dk-field">
              <Label htmlFor={`${id}-title`}>{t("desk.job.start.screen.title")}</Label>
              <Input
                id={`${id}-title`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
          </div>
          <div className="dk-field">
            <Label htmlFor={`${id}-file`}>{t("desk.job.start.screen.reference")}</Label>
            <Input
              id={`${id}-file`}
              type="file"
              accept={Object.keys(REFERENCE_TYPES).join(",")}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {fileProblem !== null && <p className="dk-hint dk-t-danger">{fileProblem}</p>}
          </div>
          <div className="dk-grid3">
            <div className="dk-field">
              <Label htmlFor={`${id}-width`}>{t("desk.job.start.screen.width")}</Label>
              <Input
                id={`${id}-width`}
                inputMode="numeric"
                value={width}
                onChange={(event) => setWidth(event.target.value)}
              />
            </div>
            <div className="dk-field">
              <Label htmlFor={`${id}-height`}>{t("desk.job.start.screen.height")}</Label>
              <Input
                id={`${id}-height`}
                inputMode="numeric"
                value={height}
                onChange={(event) => setHeight(event.target.value)}
              />
            </div>
            <div className="dk-field">
              <span className="dk-hint">{t("desk.job.start.screen.mode")}</span>
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
        <div className="dk-grid3">
          <div className="dk-field">
            <Label htmlFor={`${id}-component`}>{t("desk.job.start.component.name")}</Label>
            <Input
              id={`${id}-component`}
              value={componentName}
              aria-describedby={`${id}-component-help`}
              onChange={(event) => setComponentName(event.target.value.trim())}
            />
            <p id={`${id}-component-help`} className="dk-hint">
              {t("desk.job.start.component.nameHelp")}
            </p>
          </div>
          <div className="dk-field">
            <span className="dk-hint">{t("desk.job.start.component.layer")}</span>
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
        <div className="dk-field">
          <Label htmlFor={`${id}-audit`}>{t("desk.job.start.audit.screen")}</Label>
          <Input
            id={`${id}-audit`}
            value={auditScreen}
            aria-describedby={`${id}-audit-help`}
            onChange={(event) => setAuditScreen(event.target.value.trim())}
          />
          <p id={`${id}-audit-help`} className="dk-hint">
            {t("desk.job.start.audit.screenHelp")}
          </p>
        </div>
      )}
      {isSpecialist && (
        <SpecialistFields
          agentId={agentId}
          onAgent={setAgentId}
          targetKind={targetKind}
          onTargetKind={(next) => {
            setTargetKind(next);
            setTarget("");
          }}
          target={target}
          onTarget={setTarget}
        />
      )}
      <div className="dk-field">
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
      <div className="dk-grid3">
        <div className="dk-field">
          <Label htmlFor={`${id}-model`}>{t("desk.job.start.model")}</Label>
          <Input
            id={`${id}-model`}
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
        </div>
        <div className="dk-field">
          <Label htmlFor={`${id}-budget`}>{t("desk.job.start.budget")}</Label>
          <Input
            id={`${id}-budget`}
            inputMode="decimal"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
          />
        </div>
        <div className="dk-field">
          <Label htmlFor={`${id}-minutes`}>{t("desk.job.start.minutes")}</Label>
          <Input
            id={`${id}-minutes`}
            inputMode="numeric"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </div>
      </div>
      <p className="dk-hint">{t("desk.job.start.limitsHelp")}</p>
      {error !== null && (
        <p className="dk-hint dk-t-danger" role="alert">
          {error}
        </p>
      )}
      <div className="dk-dialog-f">
        <Button type="button" appearance="outline" onClick={onCancel}>
          {t("desk.common.cancel")}
        </Button>
        <Button type="submit" disabled={!valid || pending}>
          {pending ? t("desk.job.start.starting") : t("desk.job.start.confirm")}
        </Button>
      </div>
    </form>
  );
}
