import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import rateLimit from "@fastify/rate-limit";
import { timelineRoutes } from "./routes/timeline.js";
import { tweetUrlRoutes } from "./routes/tweet-urls.js";
import { tweetRoutes } from "./routes/tweet.js";
import { userRoutes } from "./routes/user.js";
import { healthRoutes } from "./routes/health.js";
import { searchRoutes } from "./routes/search.js";
import { trendsRoutes } from "./routes/trends.js";

const PORT = parseInt(process.env.PORT ?? "4000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
// When set, every /api call must send this value in the `x-api-key` header. Leave it unset to run open (on your own machine).
const API_KEY = process.env.API_KEY ?? "";

function keyMatches(sent: unknown): boolean {
  if (typeof sent !== "string") return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(API_KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function main() {
  const app = Fastify({
    // Behind a hosting front end (Azure App Service) the client address comes in X-Forwarded-For; without this every caller would share one rate-limit bucket.
    trustProxy: true,
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    },
  });

  // API documentation: Swagger UI at /docs, the OpenAPI document at /docs/json
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Pravaha API",
        version: "2.0.0",
        description:
          "Read the public tweets of any X/Twitter account without logging in. No database and no cache: every call reads X live, " +
          "so it is always current and fails when X blocks the request. Uses X's unofficial guest API, which X can change or block at any time.",
      },
      tags: [
        { name: "Tweets", description: "Tweet URLs and timelines" },
      ],
      // With an API key set, Swagger shows an "Authorize" button for it.
      ...(API_KEY
        ? { components: { securitySchemes: { apiKey: { type: "apiKey" as const, name: "x-api-key", in: "header" as const } } }, security: [{ apiKey: [] }] }
        : {}),
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs", uiConfig: { docExpansion: "list", deepLinking: true } });

  // API key (optional): the docs page stays open, every /api call needs the key
  if (API_KEY) {
    app.addHook("onRequest", async (request, reply) => {
      if (!request.url.startsWith("/api/")) return;
      if (!keyMatches(request.headers["x-api-key"])) {
        return reply.code(401).send({ ok: false, error: "Missing or wrong x-api-key header" });
      }
    });
  }

  // Rate limiting
  await app.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX ?? "60", 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000", 10),
  });

  // Register routes
  await app.register(healthRoutes);
  await app.register(timelineRoutes);
  await app.register(tweetUrlRoutes);
  await app.register(tweetRoutes);
  await app.register(userRoutes);
  await app.register(searchRoutes);
  await app.register(trendsRoutes);

  // The root goes to the documentation
  app.get("/", { schema: { hide: true } }, async (_request, reply) => reply.redirect("/docs"));

  // Start
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`\n  Pravaha API running at http://${HOST}:${PORT}\n  Swagger UI:         http://localhost:${PORT}/docs\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
