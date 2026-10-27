import {
  Button,
  ConfirmModal,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Navigate } from "react-router-dom";

import { API_KEYS_CONFIG } from "./api-keys.config";
import { apiKeysQueryKey, useApiKeys, useApiKeysAccess } from "./api-keys.hook";
import { LoadingRows } from "../../components/loading-rows";
import { OneTimeSecret } from "../../components/one-time-secret";
import {
  useCreateApiKeyMutation,
  useRevokeApiKeyMutation
} from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";
import { useOrganizationPermissions } from "../organizations/organizations.hook";

const NEVER = "never";

function CreateApiKeyForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const { t } = useTranslation();
  const nameId = useId();
  const expiryId = useId();
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<string>(NEVER);
  const create = useCreateApiKeyMutation({
    onSuccess: async () => {
      setName("");
      await onCreated();
    }
  });

  return (
    <form
      className="grid gap-[var(--ds-space-150)]"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate({
          input: { name: name.trim(), expiresInDays: expiry === NEVER ? null : Number(expiry) }
        });
      }}
    >
      <Field>
        <FieldLabel htmlFor={nameId}>{t("organizations.apiKeys.name")}</FieldLabel>
        <Input
          id={nameId}
          autoComplete="off"
          maxLength={64}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={expiryId}>{t("organizations.apiKeys.expiry")}</FieldLabel>
        <Select value={expiry} onValueChange={setExpiry}>
          <SelectTrigger id={expiryId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {API_KEYS_CONFIG.expiryOptions.map((days) => (
              <SelectItem key={days ?? NEVER} value={days === null ? NEVER : String(days)}>
                {days === null
                  ? t("organizations.apiKeys.expiryNever")
                  : t(`organizations.apiKeys.expiryDays.${days}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {create.error ? <FieldError>{t("organizations.apiKeys.createError")}</FieldError> : null}
      {create.data ? (
        <OneTimeSecret
          label={t("organizations.apiKeys.newKey")}
          value={create.data.createApiKey.key}
        />
      ) : null}
      <div>
        <Button disabled={create.isPending || name.trim().length === 0} type="submit">
          {t("organizations.apiKeys.create")}
        </Button>
      </div>
    </form>
  );
}

export function ApiKeysRoute() {
  const { language, t } = useTranslation();
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useOrganization();
  const permissions = useOrganizationPermissions(activeOrganizationId);
  const canRead = useApiKeysAccess(activeOrganizationId);
  const keysQuery = useApiKeys(activeOrganizationId, canRead === true);
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(activeOrganizationId) });
  const revoke = useRevokeApiKeyMutation({
    onSuccess: async () => {
      setRevoking(null);
      await refresh();
    }
  });

  if (canRead === false) {
    return <Navigate replace to="/dashboard" />;
  }

  const keys = keysQuery.data?.pages.flatMap((page) => page.apiKeys.items) ?? [];
  const formatDate = (value: unknown) => new Date(String(value)).toLocaleString(language);

  return (
    <section className="grid gap-[var(--ds-space-300)]">
      <header>
        <h1 className="text-heading-lg font-semibold text-[color:var(--ds-text)]">
          {t("organizations.apiKeys.title")}
        </h1>
        <p className="mt-[var(--ds-space-050)] text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.apiKeys.description")}
        </p>
      </header>

      {permissions?.has("apiKey:create") ? <CreateApiKeyForm onCreated={refresh} /> : null}

      {canRead === null || keysQuery.status === "pending" ? (
        <LoadingRows label={t("organizations.apiKeys.loading")} />
      ) : null}

      {keysQuery.status === "error" ? (
        <p role="alert" className="text-body text-[color:var(--ds-text-danger)]">
          {t("organizations.apiKeys.error")}{" "}
          <Button appearance="subtle" onClick={() => void keysQuery.refetch()}>
            {t("common.retry")}
          </Button>
        </p>
      ) : null}

      {keysQuery.status === "success" && keys.length === 0 ? (
        <p className="text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.apiKeys.empty")}
        </p>
      ) : null}

      {keys.length > 0 ? (
        <ul aria-label={t("organizations.apiKeys.title")} className="ui-work-list">
          {keys.map((apiKey) => (
            <li key={apiKey.id} className="ui-work-row grid gap-[var(--ds-space-050)]">
              <div className="flex flex-wrap items-center justify-between gap-[var(--ds-space-100)]">
                <p className="text-body font-semibold text-[color:var(--ds-text)]">
                  {apiKey.name}{" "}
                  <span className="font-mono text-body-sm text-[color:var(--ds-text-subtle)]">
                    {apiKey.prefix}
                  </span>
                </p>
                {permissions?.has("apiKey:delete") ? (
                  <Button
                    appearance="subtle"
                    onClick={() => setRevoking({ id: apiKey.id, name: apiKey.name })}
                  >
                    {t("organizations.apiKeys.revoke")}
                  </Button>
                ) : null}
              </div>
              <dl className="grid gap-x-[var(--ds-space-150)] gap-y-[var(--ds-space-025)] text-body-sm text-[color:var(--ds-text-subtle)] md:grid-cols-[auto_1fr]">
                <dt>{t("organizations.apiKeys.createdBy")}</dt>
                <dd className="min-w-0 break-words">
                  {apiKey.createdBy?.name ?? t("organizations.audit.unknownActor")}
                </dd>
                <dt>{t("organizations.apiKeys.createdAt")}</dt>
                <dd>{formatDate(apiKey.createdAt)}</dd>
                <dt>{t("organizations.apiKeys.lastUsedAt")}</dt>
                <dd>
                  {apiKey.lastUsedAt
                    ? formatDate(apiKey.lastUsedAt)
                    : t("organizations.apiKeys.neverUsed")}
                </dd>
                <dt>{t("organizations.apiKeys.expiresAt")}</dt>
                <dd>
                  {apiKey.expiresAt
                    ? formatDate(apiKey.expiresAt)
                    : t("organizations.apiKeys.expiryNever")}
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      ) : null}

      {keysQuery.hasNextPage ? (
        <Button
          appearance="subtle"
          className="justify-self-start"
          disabled={keysQuery.isFetchingNextPage}
          onClick={() => void keysQuery.fetchNextPage()}
        >
          {t("organizations.apiKeys.loadMore")}
        </Button>
      ) : null}

      <ConfirmModal
        cancelLabel={t("button.cancel")}
        confirmLabel={t("organizations.apiKeys.revoke")}
        description={t("organizations.apiKeys.revokeDescription")}
        isConfirming={revoke.isPending}
        open={revoking !== null}
        title={revoking?.name ?? ""}
        onConfirm={() => {
          if (revoking) revoke.mutate({ id: revoking.id });
        }}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
      />
    </section>
  );
}
