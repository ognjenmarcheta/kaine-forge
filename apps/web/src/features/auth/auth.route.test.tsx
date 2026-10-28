// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AuthRoute } from "./auth.route";

vi.mock("../../hooks/use-auth", () => ({
  useAuth: () => ({ isLoading: false, session: null })
}));
vi.mock("../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock("../../components/theme-select", () => ({ ThemeSelect: () => null }));
// The forms own their own tests; here each stands in for the mode the route chose.
const FORMS = vi.hoisted(() => ({ login: "login-form", signup: "signup-form" }));
vi.mock("./components/login-form", () => ({ LoginForm: () => <p>{FORMS.login}</p> }));
vi.mock("./components/signup-form", () => ({ SignupForm: () => <p>{FORMS.signup}</p> }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function LocationSearch() {
  return <output>{useLocation().search}</output>;
}

async function renderAt(entry: string) {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/auth"
            element={
              <>
                <AuthRoute />
                <LocationSearch />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    )
  );
}

it.each([
  ["/auth?mode=signup", "signup-form", "login-form"],
  ["/auth", "login-form", "signup-form"]
])("renders the mode named by the URL at %s", async (entry, shown, hidden) => {
  await renderAt(entry);

  expect(container.textContent).toContain(shown);
  expect(container.textContent).not.toContain(hidden);
});

it("switches to signup through the URL and keeps the return path", async () => {
  await renderAt("/auth?redirect=%2Fnotes");

  const signupLink = Array.from(container.querySelectorAll("a")).find(
    (link) => link.textContent === "auth.signup.title"
  );
  await act(async () => signupLink?.click());

  expect(container.textContent).toContain("signup-form");
  expect(container.querySelector("output")?.textContent).toBe("?redirect=%2Fnotes&mode=signup");
  expect(signupLink?.getAttribute("aria-current")).toBe("page");
});
