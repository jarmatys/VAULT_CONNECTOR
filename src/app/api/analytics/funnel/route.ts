// GET (pixel) and POST (beacon) /api/analytics/funnel: the cookieless funnel endpoint of @softure-ai/analytics. It
// counts only requests sent from the app's own pages and only the pixel and beacon steps.
import { createFunnelRoute } from "@softure-ai/analytics/next";

export const { GET, POST } = createFunnelRoute();
