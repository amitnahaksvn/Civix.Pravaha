import type { FastifyInstance } from "fastify";
import { fetchTrends, LOCATIONS } from "../adapters/trends.js";

export async function trendsRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { location?: string };
  }>("/api/trends", {
    schema: {
      hide: true,   // not shown in Swagger for now; the route still works
      tags: ["Discover"],
      summary: "Trending topics",
      description: "Trending topics for a location.",
      querystring: {
        type: "object",
        properties: {
          location: { type: "string", enum: Object.keys(LOCATIONS) },
        },
      },
    },
  }, async (_request, reply) => {
    const location = _request.query.location ?? "worldwide";
    const woeid = LOCATIONS[location] ?? 1;
    try {
      const result = await fetchTrends(woeid);
      return {
        ok: true,
        ...result,
        meta: { cached: false, timestamp: new Date().toISOString() },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      reply.status(502);
      return { ok: false, error: message };
    }
  });

  // Available locations
  app.get("/api/trends/locations", { schema: { hide: true, tags: ["Discover"], summary: "Locations available for trends" } }, async () => ({
    ok: true,
    locations: Object.entries(LOCATIONS).map(([name, woeid]) => ({ name, woeid })),
  }));
}
