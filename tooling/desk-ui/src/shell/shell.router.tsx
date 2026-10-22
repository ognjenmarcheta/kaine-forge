import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type MouseEvent,
  type ReactNode
} from "react";

import { parseRoute, routeHref, type Route } from "./shell.route";

/** Answers whether the page may leave now: `true` leaves, `false` stays. */
type LeaveCheck = () => boolean;

interface RouterValue {
  readonly route: Route;
  readonly navigate: (route: Route) => void;
  /** Ask `check` before every route change while the calling page is mounted. */
  readonly addLeaveCheck: (check: LeaveCheck) => () => void;
}

const RouterContext = createContext<RouterValue | null>(null);

/** Routes live in the query string (`?issue=457`), so any static server can serve the page. */
export function RouterProvider({ children }: { readonly children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.search));
  const checks = useRef(new Set<LeaveCheck>());
  const current = useRef(route);
  useLayoutEffect(() => {
    current.current = route;
  });

  const mayLeave = useCallback((): boolean => [...checks.current].every((check) => check()), []);

  useEffect(() => {
    const onPop = (): void => {
      // Back and forward have already moved the address: a page that stays puts it back.
      if (!mayLeave()) {
        window.history.pushState(null, "", routeHref(current.current));
        return;
      }
      setRoute(parseRoute(window.location.search));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [mayLeave]);

  const navigate = useCallback(
    (next: Route): void => {
      if (!mayLeave()) return;
      window.history.pushState(null, "", routeHref(next));
      setRoute(next);
      window.scrollTo(0, 0);
    },
    [mayLeave]
  );

  const addLeaveCheck = useCallback((check: LeaveCheck) => {
    checks.current.add(check);
    return () => {
      checks.current.delete(check);
    };
  }, []);

  const value = useMemo(
    () => ({ route, navigate, addLeaveCheck }),
    [route, navigate, addLeaveCheck]
  );
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (value === null) throw new Error("RouterProvider is missing");
  return value;
}

/**
 * Unsaved work: while `unsaved()` is true, a route change asks `message` first, and closing or
 * reloading the tab asks with the browser's own words.
 */
export function useLeaveGuard(unsaved: () => boolean, message: string): void {
  const { addLeaveCheck } = useRouter();
  const latest = useRef({ unsaved, message });
  useLayoutEffect(() => {
    latest.current = { unsaved, message };
  });
  useEffect(
    () => addLeaveCheck(() => !latest.current.unsaved() || window.confirm(latest.current.message)),
    [addLeaveCheck]
  );
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (latest.current.unsaved()) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
}

/** A real link (it opens in a new tab with the usual keys) that moves inside the page on a plain click. */
export function RouteLink({
  to,
  onClick,
  ...rest
}: Omit<ComponentPropsWithRef<"a">, "href"> & { readonly to: Route }) {
  const { navigate } = useRouter();
  return (
    <a
      {...rest}
      href={routeHref(to)}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        navigate(to);
      }}
    />
  );
}
