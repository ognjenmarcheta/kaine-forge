import { Button, Skeleton, Spinner } from "@repo/ui";
import type { ReactNode } from "react";

import type { FailureCode } from "../api/api.client";
import { failureMessageKey } from "../api/api.errors";
import { useT } from "../i18n/i18n.t";

/** A titled block inside a panel or a drawer. */
export function Section({
  title,
  children
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="dk-sec">
      <h3 className="dk-h-sec">{title}</h3>
      {children}
    </section>
  );
}

/** Engine text, shown as text. React escapes it, so markup in a ticket or a log stays inert. */
export function Pre({ children, label }: { readonly children: string; readonly label?: string }) {
  return (
    <pre className="dk-out" tabIndex={0} {...(label === undefined ? {} : { "aria-label": label })}>
      {children}
    </pre>
  );
}

export function Muted({ children }: { readonly children: ReactNode }) {
  return <p className="dk-t-sub">{children}</p>;
}

export function Loading() {
  const t = useT();
  return (
    <p className="dk-row dk-t-sub" role="status">
      <Spinner size="sm" label={t("desk.common.loading")} aria-hidden="true" />
      <span>{t("desk.common.loading")}</span>
    </p>
  );
}

/**
 * Placeholder lines while a report loads again, with what runs now in words. The lines keep the
 * room of the content, so the page does not jump when it arrives.
 */
export function LoadingLines({ label, lines }: { readonly label: string; readonly lines: number }) {
  return (
    <div className="dk-stack" role="status" aria-label={label}>
      <p className="dk-row dk-t-sub">
        <Spinner size="sm" label={label} aria-hidden="true" />
        <span>{label}</span>
      </p>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className="dk-skel" aria-hidden="true" />
      ))}
    </div>
  );
}

/** A failure: the translated reason, then the engine's own text when it sent one. */
export function FailureText({
  code,
  detail
}: {
  readonly code: FailureCode;
  readonly detail: string | null;
}) {
  const t = useT();
  return (
    <div className="dk-stack" role="alert">
      <p>{t(failureMessageKey(code))}</p>
      {detail !== null && detail !== "" && <Pre>{detail}</Pre>}
    </div>
  );
}

export function List({
  items,
  empty
}: {
  readonly items: readonly string[];
  readonly empty: string;
}) {
  return <ItemList items={items} empty={empty} render={(item) => item} />;
}

/** A bulleted list. `render` builds each row, so the list owns the keys. */
export function ItemList<T>({
  items,
  empty,
  render
}: {
  readonly items: readonly T[];
  readonly empty: string;
  readonly render: (item: T) => ReactNode;
}) {
  if (items.length === 0) return <Muted>{empty}</Muted>;
  return (
    <ul className="dk-list">
      {items.map((item, index) => (
        <li key={index}>{render(item)}</li>
      ))}
    </ul>
  );
}

/** Pressed buttons in a pill: one choice of a few, all visible. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  name,
  onChange
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly T[];
  readonly name: (option: T) => string;
  readonly onChange: (option: T) => void;
}) {
  return (
    <div className="dk-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <Button
          type="button"
          key={option}
          appearance="ghost"
          className="dk-bare"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {name(option)}
        </Button>
      ))}
    </div>
  );
}
