import { useCallback, useState } from "react";

export function useSidebar(initialCollapsed = false) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const toggle = useCallback(() => {
    setIsCollapsed((current) => !current);
  }, []);

  return {
    isCollapsed,
    setIsCollapsed,
    toggle
  };
}
