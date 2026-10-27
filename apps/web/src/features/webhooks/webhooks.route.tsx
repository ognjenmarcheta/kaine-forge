import {
  Button,
  Checkbox,
  ConfirmModal,
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input
} from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Navigate } from "react-router-dom";

import {
  useWebhookDeliveries,
  useWebhookEndpoints,
  useWebhooksAccess,
  webhookEndpointsQueryKey
} from "./webhooks.hook";
import { LoadingRows } from "../../components/loading-rows";
import { OneTimeSecret } from "../../components/one-time-secret";
import {
  useCreateWebhookEndpointMutation,
  useDeleteWebhookEndpointMutation,
  useRotateWebhookSecretMutation,
  useUpdateWebhookEndpointMutation,
  useWebhookEventTypesQuery,
  type WebhookEndpointFieldsFragment
} from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";
import { useOrganizationPermissions } from "../organizations/organizations.hook";

interface EndpointFormValue {
  url: string;
  eventTypes: string[];
}

interface EndpointFormProps {
  eventTypes: readonly string[];
  initial: EndpointFormValue;
  isPending: boolean;
  hasError: boolean;
  submitLabel: string;
  onSubmit: (value: EndpointFormValue) => void;
}

function EndpointForm({
  eventTypes,
  initial,
  isPending,
  hasError,
  submitLabel,
  onSubmit
}: EndpointFormProps) {
  const { t } = useTranslation();
  const urlId = useId();
  const idPrefix = useId();
  const [url, setUrl] = useState(initial.url);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(initial.eventTypes));

  return (
    <form
      className="grid gap-[var(--ds-space-150)]"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ url: url.trim(), eventTypes: [...selected] });
      }}
    >
      <Field>
        <FieldLabel htmlFor={urlId}>{t("organizations.webhooks.url")}</FieldLabel>
        <Input
          id={urlId}
          autoComplete="off"
          inputMode="url"
          required
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </Field>
      <FieldSet>
        <FieldLegend variant="label">{t("organizations.webhooks.events")}</FieldLegend>
        <div className="grid gap-[var(--ds-space-050)] sm:grid-cols-2">
          {eventTypes.map((eventType) => {
            const id = `${idPrefix}-${eventType}`;
            return (
              <label
                key={eventType}
                className="flex items-center gap-[var(--ds-space-100)] text-body-sm text-[color:var(--ds-text)]"
                htmlFor={id}
              >
                <Checkbox
                  checked={selected.has(eventType)}
                  id={id}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected);
                    if (checked === true) next.add(eventType);
                    else next.delete(eventType);
                    setSelected(next);
                  }}
                />
                <span className="font-mono">{eventType}</span>
              </label>
            );
          })}
        </div>
      </FieldSet>
      {hasError ? <FieldError>{t("organizations.webhooks.saveError")}</FieldError> : null}
      <div>
        <Button disabled={isPending || selected.size === 0} type="submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function DeliveryLog({ endpointId }: { endpointId: string }) {
  const { language, t } = useTranslation();
  const { activeOrganizationId } = useOrganization();
  const deliveriesQuery = useWebhookDeliveries(activeOrganizationId, endpointId);
  const deliveries =
    deliveriesQuery.data?.pages.flatMap((page) => page.webhookDeliveries.items) ?? [];
  const formatDuration = new Intl.NumberFormat(language, {
    style: "unit",
    unit: "millisecond",
    unitDisplay: "short"
  });

  if (deliveriesQuery.status === "pending") {
    return <LoadingRows label={t("organizations.webhooks.deliveriesLoading")} />;
  }

  if (deliveriesQuery.status === "error") {
    return (
      <p role="alert" className="text-body-sm text-[color:var(--ds-text-danger)]">
        {t("organizations.webhooks.deliveriesError")}
      </p>
    );
  }

  if (deliveries.length === 0) {
    return (
      <p className="text-body-sm text-[color:var(--ds-text-subtle)]">
        {t("organizations.webhooks.deliveriesEmpty")}
      </p>
    );
  }

  return (
    <div className="grid gap-[var(--ds-space-100)]">
      <ul
        aria-label={t("organizations.webhooks.deliveries")}
        className="grid gap-[var(--ds-space-050)]"
      >
        {deliveries.map((delivery) => (
          <li
            key={delivery.id}
            className="flex flex-wrap gap-x-[var(--ds-space-150)] text-body-sm text-[color:var(--ds-text-subtle)]"
          >
            <span className="font-mono text-[color:var(--ds-text)]">{delivery.eventType}</span>
            <span>
              {delivery.error === null
                ? t("organizations.webhooks.delivered")
                : t(`organizations.webhooks.deliveryError.${delivery.error}`)}
              {delivery.statusCode === null ? "" : ` (${delivery.statusCode})`}
            </span>
            <span>
              {t("organizations.webhooks.attempt")} {delivery.attempt}
            </span>
            <span>{formatDuration.format(delivery.durationMs)}</span>
            <time dateTime={String(delivery.createdAt)}>
              {new Date(String(delivery.createdAt)).toLocaleString(language)}
            </time>
          </li>
        ))}
      </ul>
      {deliveriesQuery.hasNextPage ? (
        <Button
          appearance="subtle"
          className="justify-self-start"
          disabled={deliveriesQuery.isFetchingNextPage}
          onClick={() => void deliveriesQuery.fetchNextPage()}
        >
          {t("organizations.webhooks.loadMore")}
        </Button>
      ) : null}
    </div>
  );
}

interface EndpointItemProps {
  endpoint: WebhookEndpointFieldsFragment;
  eventTypes: readonly string[];
  canUpdate: boolean;
  canDelete: boolean;
  onChanged: () => Promise<void>;
  onDelete: () => void;
}

function EndpointItem({
  endpoint,
  eventTypes,
  canUpdate,
  canDelete,
  onChanged,
  onDelete
}: EndpointItemProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const update = useUpdateWebhookEndpointMutation({
    onSuccess: async () => {
      setEditing(false);
      await onChanged();
    }
  });
  const rotate = useRotateWebhookSecretMutation({
    onSuccess: () => setConfirmingRotate(false)
  });

  return (
    <li className="ui-work-row grid gap-[var(--ds-space-100)]">
      <div className="flex flex-wrap items-center justify-between gap-[var(--ds-space-100)]">
        <p className="min-w-0 break-all font-mono text-body font-semibold text-[color:var(--ds-text)]">
          {endpoint.url}
        </p>
        <div className="flex gap-[var(--ds-space-050)]">
          <Button appearance="subtle" onClick={() => setShowDeliveries(!showDeliveries)}>
            {showDeliveries
              ? t("organizations.webhooks.hideDeliveries")
              : t("organizations.webhooks.showDeliveries")}
          </Button>
          {canUpdate ? (
            <Button appearance="subtle" onClick={() => setEditing(!editing)}>
              {t("organizations.webhooks.edit")}
            </Button>
          ) : null}
          {canUpdate ? (
            <Button appearance="subtle" onClick={() => setConfirmingRotate(true)}>
              {t("organizations.webhooks.rotateSecret")}
            </Button>
          ) : null}
          {canDelete ? (
            <Button appearance="subtle" onClick={onDelete}>
              {t("organizations.webhooks.delete")}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="font-mono text-body-sm text-[color:var(--ds-text-subtle)]">
        {endpoint.eventTypes.join(", ")}
      </p>
      {editing ? (
        <EndpointForm
          eventTypes={eventTypes}
          initial={{ url: endpoint.url, eventTypes: endpoint.eventTypes }}
          isPending={update.isPending}
          hasError={update.isError}
          submitLabel={t("organizations.webhooks.save")}
          onSubmit={(input) => update.mutate({ id: endpoint.id, input })}
        />
      ) : null}
      {rotate.data ? (
        <OneTimeSecret
          label={t("organizations.webhooks.secret")}
          value={rotate.data.rotateWebhookSecret}
        />
      ) : null}
      {rotate.isError ? (
        <p role="alert" className="text-body-sm text-[color:var(--ds-text-danger)]">
          {t("organizations.webhooks.rotateError")}
        </p>
      ) : null}
      {showDeliveries ? <DeliveryLog endpointId={endpoint.id} /> : null}
      <ConfirmModal
        cancelLabel={t("button.cancel")}
        confirmLabel={t("organizations.webhooks.rotateSecret")}
        description={t("organizations.webhooks.rotateDescription")}
        isConfirming={rotate.isPending}
        open={confirmingRotate}
        title={endpoint.url}
        onConfirm={() => rotate.mutate({ id: endpoint.id })}
        onOpenChange={setConfirmingRotate}
      />
    </li>
  );
}

export function WebhooksRoute() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useOrganization();
  const permissions = useOrganizationPermissions(activeOrganizationId);
  const canRead = useWebhooksAccess(activeOrganizationId);
  const endpointsQuery = useWebhookEndpoints(activeOrganizationId, canRead === true);
  const eventTypesQuery = useWebhookEventTypesQuery(undefined, { enabled: canRead === true });
  const eventTypes = eventTypesQuery.data?.webhookEventTypes ?? [];
  const [deleting, setDeleting] = useState<WebhookEndpointFieldsFragment | null>(null);
  const [formKey, setFormKey] = useState(0);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: webhookEndpointsQueryKey(activeOrganizationId) });
  const create = useCreateWebhookEndpointMutation({
    onSuccess: async () => {
      setFormKey((key) => key + 1);
      await refresh();
    }
  });
  const remove = useDeleteWebhookEndpointMutation({
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
    }
  });

  if (canRead === false) {
    return <Navigate replace to="/dashboard" />;
  }

  const endpoints = endpointsQuery.data?.pages.flatMap((page) => page.webhookEndpoints.items) ?? [];

  return (
    <section className="grid gap-[var(--ds-space-300)]">
      <header>
        <h1 className="text-heading-lg font-semibold text-[color:var(--ds-text)]">
          {t("organizations.webhooks.title")}
        </h1>
        <p className="mt-[var(--ds-space-050)] text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.webhooks.description")}
        </p>
      </header>

      {permissions?.has("webhook:create") && eventTypes.length > 0 ? (
        <div className="grid gap-[var(--ds-space-150)]">
          <EndpointForm
            key={formKey}
            eventTypes={eventTypes}
            initial={{ url: "", eventTypes: [] }}
            isPending={create.isPending}
            hasError={create.isError}
            submitLabel={t("organizations.webhooks.create")}
            onSubmit={(input) => create.mutate({ input })}
          />
          {create.data ? (
            <OneTimeSecret
              label={t("organizations.webhooks.secret")}
              value={create.data.createWebhookEndpoint.secret}
            />
          ) : null}
        </div>
      ) : null}

      {canRead === null || endpointsQuery.status === "pending" ? (
        <LoadingRows label={t("organizations.webhooks.loading")} />
      ) : null}

      {endpointsQuery.status === "error" ? (
        <p role="alert" className="text-body text-[color:var(--ds-text-danger)]">
          {t("organizations.webhooks.error")}{" "}
          <Button appearance="subtle" onClick={() => void endpointsQuery.refetch()}>
            {t("common.retry")}
          </Button>
        </p>
      ) : null}

      {endpointsQuery.status === "success" && endpoints.length === 0 ? (
        <p className="text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.webhooks.empty")}
        </p>
      ) : null}

      {endpoints.length > 0 ? (
        <ul aria-label={t("organizations.webhooks.title")} className="ui-work-list">
          {endpoints.map((endpoint) => (
            <EndpointItem
              key={endpoint.id}
              endpoint={endpoint}
              eventTypes={eventTypes}
              canUpdate={permissions?.has("webhook:update") === true}
              canDelete={permissions?.has("webhook:delete") === true}
              onChanged={refresh}
              onDelete={() => setDeleting(endpoint)}
            />
          ))}
        </ul>
      ) : null}

      {endpointsQuery.hasNextPage ? (
        <Button
          appearance="subtle"
          className="justify-self-start"
          disabled={endpointsQuery.isFetchingNextPage}
          onClick={() => void endpointsQuery.fetchNextPage()}
        >
          {t("organizations.webhooks.loadMore")}
        </Button>
      ) : null}

      <ConfirmModal
        cancelLabel={t("button.cancel")}
        confirmLabel={t("organizations.webhooks.delete")}
        description={t("organizations.webhooks.deleteDescription")}
        isConfirming={remove.isPending}
        open={deleting !== null}
        title={deleting?.url ?? ""}
        onConfirm={() => {
          if (deleting) remove.mutate({ id: deleting.id });
        }}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      />
    </section>
  );
}
