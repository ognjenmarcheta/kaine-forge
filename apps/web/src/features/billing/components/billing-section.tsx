import {
  Badge,
  Banner,
  Button,
  FieldError,
  Label,
  QueryError,
  RadioGroup,
  RadioGroupItem,
  SettingsSection
} from "@repo/ui";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { LoadingRows } from "../../../components/loading-rows";
import type { BillingInterval, BillingPlan } from "../../../graphql/generated/react-query";
import { useTranslation } from "../../../hooks/use-translation";
import { useBilling, type BillingStatus } from "../billing.hook";

const PURCHASABLE_PLANS = ["pro", "business"] as const satisfies readonly BillingPlan[];
const INTERVALS = ["month", "year"] as const satisfies readonly BillingInterval[];

interface BillingSectionProps {
  /** The Active Organization, for the cache key. */
  organizationId: string | null;
  /** Whether the session holds billing:manage, which only the owner role grants. */
  canManage: boolean;
}

function statusAppearance(status: NonNullable<BillingStatus["subscriptionStatus"]>) {
  if (status === "active" || status === "trialing") return "success";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "warning";
  return "default";
}

/**
 * The Active Organization's Plan, its usage against each limit, and, for
 * the owner, checkout of a larger Plan or the provider's billing portal.
 */
export function BillingSection({ organizationId, canManage }: BillingSectionProps) {
  const { language, t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [interval, setInterval] = useState<BillingInterval>("month");
  const { billing, checkout, portal } = useBilling(organizationId);
  const date = new Intl.DateTimeFormat(language, { dateStyle: "medium" });
  const count = new Intl.NumberFormat(language);
  const returned = searchParams.get("checkout");

  if (billing.status === "pending") {
    return (
      <SettingsSection description={t("billing.description")} title={t("billing.title")}>
        <LoadingRows label={t("billing.loading")} />
      </SettingsSection>
    );
  }

  if (billing.status === "error") {
    return (
      <SettingsSection description={t("billing.description")} title={t("billing.title")}>
        <QueryError
          message={t("billing.error.load")}
          retryLabel={t("common.retry")}
          onRetry={() => void billing.refetch()}
        />
      </SettingsSection>
    );
  }

  const status = billing.data;

  if (status.provider === "none") {
    return (
      <SettingsSection description={t("billing.description")} title={t("billing.title")}>
        <p className="text-body text-ds-text-subtle">{t("billing.off")}</p>
      </SettingsSection>
    );
  }

  const paid = status.plan !== "free";
  const periodEnd = status.currentPeriodEnd ? date.format(new Date(status.currentPeriodEnd)) : null;

  return (
    <>
      <SettingsSection
        description={t("billing.description")}
        title={t("billing.title")}
        actions={
          canManage && paid ? (
            <Button
              appearance="subtle"
              disabled={portal.isPending}
              onClick={() => portal.mutate({})}
            >
              {t("billing.manage")}
            </Button>
          ) : undefined
        }
      >
        {status.subscriptionStatus === "past_due" ? (
          <Banner appearance="warning">{t("billing.pastDue")}</Banner>
        ) : null}
        {returned === "success" || returned === "canceled" ? (
          <p role="status" className="text-body text-ds-text-subtle">
            {t(`billing.checkout.${returned}`)}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-ds-100">
          <span className="text-body text-ds-text-subtle">{t("billing.current")}</span>
          <span className="text-heading-sm text-ds-text">{t(`billing.plan.${status.plan}`)}</span>
          {status.subscriptionStatus ? (
            <Badge appearance={statusAppearance(status.subscriptionStatus)}>
              {t(`billing.status.${status.subscriptionStatus}`)}
            </Badge>
          ) : null}
          {paid && periodEnd ? (
            <span className="text-body-sm text-ds-text-subtle">
              {t(status.cancelAtPeriodEnd ? "billing.endsOn" : "billing.renewsOn")} {periodEnd}
            </span>
          ) : null}
        </div>
        <dl aria-label={t("billing.usage")} className="ui-work-list">
          {status.limits.map((limit) => (
            <div
              key={limit.key}
              className="ui-work-row flex items-center justify-between gap-ds-150"
            >
              <dt className="text-body text-ds-text">{t(`billing.limit.${limit.key}`)}</dt>
              <dd className="text-body text-ds-text-subtle">
                {limit.max === null || limit.max === undefined
                  ? `${count.format(limit.used)}, ${t("billing.noLimit")}`
                  : `${count.format(limit.used)} ${t("billing.of")} ${count.format(limit.max)}`}
              </dd>
            </div>
          ))}
        </dl>
        {portal.error ? <FieldError>{t("billing.error.portal")}</FieldError> : null}
      </SettingsSection>
      {paid ? null : (
        <SettingsSection description={t("billing.plansDescription")} title={t("billing.plans")}>
          <div className="grid gap-ds-075">
            <span id="billing-interval" className="text-body text-ds-text-subtle">
              {t("billing.interval")}
            </span>
            <RadioGroup
              aria-labelledby="billing-interval"
              className="flex flex-wrap gap-ds-200"
              value={interval}
              onValueChange={(value) => {
                const next = INTERVALS.find((option) => option === value);
                if (next) setInterval(next);
              }}
            >
              {INTERVALS.map((option) => (
                <span key={option} className="flex items-center gap-ds-075">
                  <RadioGroupItem id={`billing-interval-${option}`} value={option} />
                  <Label htmlFor={`billing-interval-${option}`}>
                    {t(`billing.interval.${option}`)}
                  </Label>
                </span>
              ))}
            </RadioGroup>
          </div>
          <ul aria-label={t("billing.plans")} className="ui-work-list">
            {PURCHASABLE_PLANS.map((plan) => (
              <li
                key={plan}
                className="ui-work-row flex flex-wrap items-center justify-between gap-ds-150"
              >
                <span className="grid gap-ds-050">
                  <span className="text-body text-ds-text">{t(`billing.plan.${plan}`)}</span>
                  <span className="text-body-sm text-ds-text-subtle">
                    {t(`billing.planDescription.${plan}`)}
                  </span>
                </span>
                {canManage ? (
                  <Button
                    disabled={checkout.isPending}
                    onClick={() => checkout.mutate({ plan, interval })}
                  >
                    {t(`billing.choose.${plan}`)}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {canManage ? null : (
            <p className="text-body-sm text-ds-text-subtle">{t("billing.ownerOnly")}</p>
          )}
          {checkout.error ? <FieldError>{t("billing.error.checkout")}</FieldError> : null}
        </SettingsSection>
      )}
    </>
  );
}
