import "dotenv/config";
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

async function main() {
  const app = Fastify({
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
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs", uiConfig: { docExpansion: "list", deepLinking: true } });

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
