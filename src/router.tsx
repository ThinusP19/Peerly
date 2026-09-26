import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { NotFoundPage } from "./components/shared/NotFoundPage";
import { shouldRetryQuery } from "./lib/api";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // A refused request (bad or unknown id) fails at once instead of being
  // retried for seconds behind a skeleton. See shouldRetryQuery.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: shouldRetryQuery } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // An unknown address inside a portal gets the same page as one outside it,
    // not the router's bare "Not Found".
    defaultNotFoundComponent: NotFoundPage,
  });

  return router;
};
