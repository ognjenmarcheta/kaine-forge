// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { BillingSection } from "./billing-section";

const api = vi.hoisted(() => ({
  billing: {} as Record<string, unknown>,
  checkouts: [] as unknown[],
  reads: 0
}));

const FREE = {
  provider: "stripe",
  clientConfig: null,
  plan: "free",
  subscriptionStatus: null,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  features: [],
  limits: [{ key: "todos", max: 50, used: 12 }]
};

vi.mock("../../../lib/graphql-codegen-fetcher", () => ({
  useGraphqlFetcher: (document: { toString(): string }) => {
    const source = document.toString();

    if (source.includes("mutation StartCheckout")) {
      return (variables: unknown) => {
        api.checkouts.push(variables);
        return Promise.resolve({
          startCheckout: {
            mode: "redirect",
            url: "https://checkout.example/cs_1",
            transactionId: null
          }
        });
      };
    }

    if (source.includes("mutation OpenBillingPortal")) {
      return () => Promise.resolve({ openBillingPortal: "https://portal.example/session" });
    }

    return () => {
      api.reads += 1;
      return Promise.resolve({ billing: api.billing });
    };
  }
}));
vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ language: "en", t: (key: string) => key })
}));

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  api.checkouts = [];
  api.reads = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function render(
  billing: Record<string, unknown>,
  canManage: boolean,
  organizationId: string | null = "org-1"
) {
  api.billing = billing;
  await act(async () =>
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <BillingSection canManage={canManage} organizationId={organizationId} />
        </QueryClientProvider>
      </MemoryRouter>
    )
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function buttons(): string[] {
  return Array.from(container.querySelectorAll("button:not([role='radio'])")).map(
    (button) => button.textContent ?? ""
  );
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label
  );
  if (!found) throw new Error(`no button ${label}`);
  return found;
}

it("lets the owner check out a larger plan and sends the browser to the provider", async () => {
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
  await render(FREE, true);

  expect(container.textContent).toContain("12 billing.of 50");
  await act(async () => button("billing.choose.pro").click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(api.checkouts).toEqual([{ plan: "pro", interval: "month" }]);
  expect(assign).toHaveBeenCalledWith("https://checkout.example/cs_1");
});

it("shows a member the plans without any checkout", async () => {
  await render(FREE, false);

  expect(buttons()).toEqual([]);
  expect(container.textContent).toContain("billing.ownerOnly");
});

it("warns about a failed payment and opens the portal for a paid plan", async () => {
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
  await render(
    {
      ...FREE,
      plan: "pro",
      subscriptionStatus: "past_due",
      currentPeriodEnd: "2026-11-28T12:00:00.000Z",
      limits: [{ key: "todos", max: null, used: 120 }]
    },
    true
  );

  expect(container.querySelector('[role="status"]')?.textContent).toBe("billing.pastDue");
  expect(container.textContent).toContain("120, billing.noLimit");
  expect(buttons()).toEqual(["billing.manage"]);
  await act(async () => button("billing.manage").click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(assign).toHaveBeenCalledWith("https://portal.example/session");
});

it("says billing is off when the deployment has no provider", async () => {
  await render({ ...FREE, provider: "none", plan: "unlimited" }, true);

  expect(container.textContent).toBe("billing.titlebilling.descriptionbilling.off");
});

it("waits for an Active Organization before it asks the API for the Plan", async () => {
  await render(FREE, true, null);

  expect(api.reads).toBe(0);
  expect(container.textContent).not.toContain("billing.error.load");
});
