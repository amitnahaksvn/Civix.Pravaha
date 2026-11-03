import type { FastifyInstance } from "fastify";
import { getTimeline } from "../services/source-router.js";
import type { NormalizedTweet } from "../lib/types.js";

/** Pages of the timeline read at most for one call (about 20 tweets a page, retweets and all). */
const MAX_PAGES = 12;
const DEFAULT_LIMIT = 50;

/**
 * GET /api/urls/:handle
 *
 * The URLs of an account's latest tweets, newest first (50 by default). No database, no cache: every call reads X live.
 *
 *   ?limit=1..200       how many tweets to return (default 50). Pages are read until that many are found or X has no more.
 *   ?since=<tweet id>   only tweets newer than this id (tweet ids grow with time). Send the `newestId` of the last answer to get just what is new.
 *   ?retweets=true      include retweets (default false). A retweet's URL is the ORIGINAL tweet's.
 *   ?replies=false      leave out the account's replies (default true: replies are the account's own tweets).
 *   ?media=image|video|gif|any|none   only tweets that have that kind of media ("any": at least one; "none": text only). Default: all tweets.
 *
 * Every tweet is marked with hasImage / hasVideo / hasGif, the list of media kinds and how many media items it has.
 */
export async function tweetUrlRoutes(app: FastifyInstance) {
  app.get<{
    Params: { handle: string };
    Querystring: { limit?: number; since?: string; retweets?: boolean; replies?: boolean; media?: "image" | "video" | "gif" | "any" | "none" };
  }>("/api/urls/:handle", {
    schema: {
      tags: ["Tweets"],
      summary: "Latest tweet URLs of an account",
      description:
        "The URLs of an account's latest tweets, newest first (50 by default). Every call reads X live. " +
        "To check for new tweets on a schedule, save `newestId` from one answer and send it as `since` next time: you get only what is new.",
      params: {
        type: "object",
        required: ["handle"],
        properties: {
          handle: { type: "string", minLength: 1, maxLength: 50, pattern: "^@?[A-Za-z0-9_]+$", description: "X username, with or without the @", examples: ["narendramodi"] },
        },
      },
      querystring: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 200, default: DEFAULT_LIMIT, description: "How many tweets to return" },
          since: { type: "string", pattern: "^[0-9]{1,25}$", description: "Only tweets newer than this tweet id (use the `newestId` of the last answer)" },
          retweets: { type: "boolean", default: false, description: "Include retweets (their URL is the original tweet's)" },
          replies: { type: "boolean", default: true, description: "Include the account's replies" },
          media: { type: "string", enum: ["image", "video", "gif", "any", "none"], description: "Only tweets with this kind of media: image, video or gif; any = at least one; none = text only. Leave out for all tweets." },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            handle: { type: "string" },
            count: { type: "integer", description: "How many tweets are in the answer" },
            newestId: { type: ["string", "null"], description: "The newest tweet id; send it back as `since` to get only newer tweets" },
            urls: { type: "array", items: { type: "string" }, description: "The tweet URLs, newest first" },
            tweets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  url: { type: "string" },
                  hasImage: { type: "boolean", description: "The tweet has at least one image" },
                  hasVideo: { type: "boolean", description: "The tweet has a video" },
                  hasGif: { type: "boolean", description: "The tweet has an animated GIF" },
                  mediaTypes: { type: "array", items: { type: "string", enum: ["image", "video", "gif"] }, description: "The kinds of media the tweet has; empty for a text-only tweet" },
                  mediaCount: { type: "integer", description: "How many media items (a tweet can have up to 4 images)" },
                  createdAt: { type: "string", format: "date-time" },
                  isRetweet: { type: "boolean" },
                  isReply: { type: "boolean" },
                  text: { type: "string" },
                },
              },
            },
            meta: { type: "object", properties: { pages: { type: "integer" }, timestamp: { type: "string" } } },
          },
        },
      },
    },
  }, async (request, reply) => {
    const handle = request.params.handle.replace(/^@/, "");
    const { limit = DEFAULT_LIMIT, since, retweets = false, replies = true, media } = request.query;
    const sinceId = since ? BigInt(since) : null;

    const kindsOf = (t: NormalizedTweet) => [...new Set(t.media.map((m) => m.type))];
    const hasMedia = (t: NormalizedTweet) => {
      if (!media) return true;
      if (media === "any") return t.media.length > 0;
      if (media === "none") return t.media.length === 0;
      return kindsOf(t).includes(media);
    };
    const keep = (t: NormalizedTweet) =>
      (retweets || !t.isRetweet) && (replies || !t.replyToId) && (sinceId === null || BigInt(t.id) > sinceId) && hasMedia(t);

    try {
      const byId = new Map<string, NormalizedTweet>();
      let cursor: string | undefined;
      let pagesRead = 0;

      while (pagesRead < MAX_PAGES) {
        const result = await getTimeline(handle, cursor);
        pagesRead++;
        for (const tweet of result.tweets) byId.set(tweet.id, tweet);

        cursor = result.cursor ?? undefined;
        if (!cursor || result.tweets.length === 0) break;
        if ([...byId.values()].filter(keep).length >= limit) break;
        // Nothing on this page is newer than `since`: older pages cannot have anything new either.
        if (sinceId !== null && result.tweets.every((t) => BigInt(t.id) <= sinceId)) break;
      }

      const wanted = [...byId.values()]
        .filter(keep)
        .sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : BigInt(b.id) < BigInt(a.id) ? -1 : 0))
        .slice(0, limit);

      const tweets = wanted.map((t) => ({
        id: t.id,
        url: `https://x.com/${t.authorHandle}/status/${t.id}`,
        hasImage: kindsOf(t).includes("image"),
        hasVideo: kindsOf(t).includes("video"),
        hasGif: kindsOf(t).includes("gif"),
        mediaTypes: kindsOf(t),
        mediaCount: t.media.length,
        createdAt: t.createdAt,
        isRetweet: t.isRetweet,
        isReply: t.replyToId !== null,
        text: t.text,
      }));

      return {
        ok: true,
        handle,
        count: tweets.length,
        // Send this back as `since` next time to get only newer tweets. With nothing new it stays what you sent.
        newestId: tweets[0]?.id ?? since ?? null,
        urls: tweets.map((t) => t.url),
        tweets,
        meta: { pages: pagesRead, timestamp: new Date().toISOString() },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      reply.status(502);
      return { ok: false, error: message, meta: { timestamp: new Date().toISOString() } };
    }
  });
}
