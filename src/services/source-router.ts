import { twitterGuest } from "../adapters/twitter-guest.js";
import { fixtweet } from "../adapters/fixtweet.js";
import { syndication } from "../adapters/syndication.js";
import { isSourceHealthy, recordSuccess, recordFailure, getAllSourceStates } from "../lib/circuit-breaker.js";
import type { DataSourceAdapter, NormalizedTweet, NormalizedUser, TimelineResult } from "../lib/types.js";

/**
 * Data Source Router
 *
 * Routes requests through available data sources in priority order, respecting circuit breaker
 * state. Every call goes to the live sources - there is no database and no cache: what you get is
 * what X returned a moment ago, and when every source fails the call fails.
 */

// Ordered by priority — twitter-guest is primary (has timelines + search)
const TIMELINE_SOURCES: DataSourceAdapter[] = [twitterGuest, fixtweet];
const TWEET_SOURCES: DataSourceAdapter[] = [twitterGuest, fixtweet, syndication];
const USER_SOURCES: DataSourceAdapter[] = [twitterGuest, fixtweet];
const SEARCH_SOURCES: DataSourceAdapter[] = [twitterGuest];


async function trySource<T>(
  adapter: DataSourceAdapter,
  operation: (a: DataSourceAdapter) => Promise<T>
): Promise<T> {
  if (!isSourceHealthy(adapter.name)) {
    throw new Error(`Source ${adapter.name} is unhealthy (circuit open)`);
  }

  const start = Date.now();
  try {
    const result = await operation(adapter);
    recordSuccess(adapter.name, Date.now() - start);
    return result;
  } catch (err) {
    recordFailure(adapter.name);
    throw err;
  }
}

async function routeThrough<T>(
  sources: DataSourceAdapter[],
  operation: (a: DataSourceAdapter) => Promise<T>,
  operationName: string
): Promise<T> {
  const errors: string[] = [];

  for (const source of sources) {
    try {
      return await trySource(source, operation);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Router] ${source.name} failed for ${operationName}: ${msg}`);
      errors.push(`${source.name}: ${msg}`);
      continue;
    }
  }

  throw new Error(`All sources failed for ${operationName}: ${errors.join("; ")}`);
}

// --- Public API ---
// Each result carries `source: "live"` and `cached: false`, so the routes need no change; both are always these values now.

export async function getTimeline(handle: string, cursor?: string): Promise<TimelineResult & { source: string; cached: boolean }> {
  const result = await routeThrough(TIMELINE_SOURCES, (a) => a.fetchTimeline(handle, cursor), `timeline:${handle}`);
  return { ...result, source: "live", cached: false };
}

export async function getTweet(id: string): Promise<{ tweet: NormalizedTweet; thread?: NormalizedTweet[]; source: string; cached: boolean }> {
  const result = await routeThrough(TWEET_SOURCES, (a) => a.fetchTweet(id), `tweet:${id}`);
  return { ...result, source: "live", cached: false };
}

export async function getUser(handle: string): Promise<NormalizedUser & { source: string; cached: boolean }> {
  const result = await routeThrough(USER_SOURCES, (a) => a.fetchUser(handle), `user:${handle}`);
  return { ...result, source: "live", cached: false };
}

export async function searchTweets(query: string, cursor?: string): Promise<{ tweets: NormalizedTweet[]; cursor?: string; source: string; cached: boolean }> {
  for (const source of SEARCH_SOURCES) {
    if (!source.searchTweets) continue;
    try {
      const result = await trySource(source, (a) => a.searchTweets!(query, cursor));
      return { ...result, source: "live", cached: false };
    } catch {
      continue;
    }
  }
  throw new Error("No search sources available");
}

export function getHealth() {
  return getAllSourceStates().map((s) => ({
    name: s.name,
    healthy: s.isHealthy,
    consecutiveFailures: s.consecutiveFailures,
    avgLatencyMs: s.avgLatencyMs,
    lastSuccess: s.lastSuccess?.toISOString() ?? null,
    lastFailure: s.lastFailure?.toISOString() ?? null,
    unhealthyUntil: s.unhealthyUntil?.toISOString() ?? null,
  }));
}
