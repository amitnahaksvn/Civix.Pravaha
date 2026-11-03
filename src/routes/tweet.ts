import type { FastifyInstance } from "fastify";
import { getTweet } from "../services/source-router.js";

export async function tweetRoutes(app: FastifyInstance) {
  app.get<{
    Params: { id: string };
  }>("/api/tweet/:id", {
    schema: {
      hide: true,   // not shown in Swagger for now; the route still works
      tags: ["Tweets"],
      summary: "One tweet by id",
      description: "A single tweet, with the thread around it when X returns it.",
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", pattern: "^[0-9]+$" },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      const result = await getTweet(id);

      reply.header("X-Data-Source", result.source);
      reply.header("X-Cached", String(result.cached));

      return {
        ok: true,
        tweet: result.tweet,
        thread: result.thread ?? [],
        meta: {
          source: result.source,
          cached: result.cached,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      reply.status(502);
      return { ok: false, error: message };
    }
  });
}
