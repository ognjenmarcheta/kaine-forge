import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentPropsWithRef,
  type MouseEvent,
  type ReactNode
} from "react";

import { parseRoute, routeHref, type Route } from "./shell.route";

interface RouterValue {
  readonly route: Route;
  readonly navigate: (route: Route) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

/** Routes live in the query string (`?issue=457`), so any static server can serve the page. */
export function RouterProvider({ children }: { readonly children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.search));

  useEffect(() => {
    const onPop = (): void => setRoute(parseRoute(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((next: Route): void => {
    window.history.pushState(null, "", routeHref(next));
    setRoute(next);
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo(() => ({ route, navigate }), [route, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (value === null) throw new Error("RouterProvider is missing");
  return value;
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
