import { Spinner } from "@repo/ui";
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
    <section className="desk-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** Engine text, shown as text. React escapes it, so markup in a ticket or a log stays inert. */
export function Pre({ children, label }: { readonly children: string; readonly label?: string }) {
  return (
    <pre
      className="desk-pre"
      tabIndex={0}
      {...(label === undefined ? {} : { "aria-label": label })}
    >
      {children}
    </pre>
  );
}

export function Muted({ children }: { readonly children: ReactNode }) {
  return <p className="desk-muted">{children}</p>;
}

export function Loading() {
  const t = useT();
  return (
    <p className="desk-loading" role="status">
      <Spinner size="sm" label={t("desk.common.loading")} aria-hidden="true" />
      <span>{t("desk.common.loading")}</span>
    </p>
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
    <div className="desk-failure" role="alert">
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
    <ul className="desk-list">
      {items.map((item, index) => (
        <li key={index}>{render(item)}</li>
      ))}
    </ul>
  );
}
