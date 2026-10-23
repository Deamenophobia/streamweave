import { useCallback, useEffect, useRef, useState } from "react";
import { parseRoute, routeHash, type WorkspaceRoute } from "./workspaceNavigation";

export function useWorkspaceNavigation() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const remembered = useRef<Partial<Record<WorkspaceRoute["page"], string>>>({});
  useEffect(() => {
    if (route.id) remembered.current[route.page] = route.id;
  }, [route]);
  useEffect(() => {
    const change = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);

  const navigate = useCallback((next: WorkspaceRoute) => {
    const resolved = { ...next, id: next.id ?? remembered.current[next.page] };
    const hash = routeHash(resolved);
    if (window.location.hash !== hash) window.location.hash = hash;
    setRoute(resolved);
  }, []);
  const reset = useCallback(() => {
    remembered.current = {};
    navigate({ page: "canvas" });
  }, [navigate]);
  return { route, navigate, reset };
}
