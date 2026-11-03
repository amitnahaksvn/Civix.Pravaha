import type { FastifyInstance } from "fastify";
import { getHealth } from "../services/source-router.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/api/health", { schema: { hide: true, tags: ["System"], summary: "Health of the data sources", description: "Which of the sources (X guest API, FxTwitter, Twitter embeds) are currently usable. A source that keeps failing is skipped for a while." } }, async () => {
    const sources = getHealth();
    const allHealthy = sources.every((s) => s.healthy);
    const anyHealthy = sources.some((s) => s.healthy);

    return {
      ok: true,
      status: allHealthy ? "healthy" : anyHealthy ? "degraded" : "unhealthy",
      sources,
      timestamp: new Date().toISOString(),
    };
  });
}
