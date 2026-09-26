import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
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
  });

  return router;
};
