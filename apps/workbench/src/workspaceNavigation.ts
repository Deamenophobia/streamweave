export type WorkspaceRoute = { page: "canvas" | "data" | "results"; id?: string };

export function parseRoute(hash: string): WorkspaceRoute {
  const [page, encodedId] = hash.replace(/^#\/?/, "").split("/");
  if (page !== "data" && page !== "results") return { page: "canvas" };
  try {
    return { page, id: encodedId ? decodeURIComponent(encodedId) : undefined };
  } catch {
    return { page };
  }
}

export function routeHash(route: WorkspaceRoute) {
  const id = route.id && route.page !== "canvas" ? `/${encodeURIComponent(route.id)}` : "";
  return `#/${route.page}${id}`;
}
