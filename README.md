# Pravaha

**Give it an X/Twitter username, get back the URLs of the latest tweets. No login, no API key, no database, no cache.**

Pravaha (Sanskrit: "continuous stream") is a small API. Every call reads X live, so the answer is always current and nothing is stored.

```
GET http://localhost:4000/api/urls/narendramodi
```

```json
{
  "ok": true,
  "handle": "narendramodi",
  "count": 50,
  "newestId": "2117650129998295517",
  "urls": [
    "https://x.com/narendramodi/status/2117650129998295517",
    "https://x.com/narendramodi/status/2117517153859678694"
  ],
  "tweets": [{ "id": "...", "url": "...", "createdAt": "...", "isRetweet": false, "isReply": false, "text": "..." }]
}
```

## Run it

Needs [Node.js 22+](https://nodejs.org/). Nothing else: no Docker, no database.

```bash
npm install
npm start          # or: npm run dev   (restarts on every change)
```

- API: http://localhost:4000
- **Swagger UI: http://localhost:4000/docs** (try every call from the browser)
- OpenAPI document: http://localhost:4000/docs/json

## Endpoints

| Endpoint | What it returns |
|---|---|
| `GET /api/urls/{handle}` | **The latest tweet URLs of an account** (50 by default), newest first |
| `GET /api/timeline/{handle}` | The same tweets in full detail (media, likes, retweets, views), 20 per page, with a `cursor` |
| `GET /api/tweet/{id}` | One tweet, with its thread |
| `GET /api/user/{handle}` | Profile: name, bio, avatar, banner, follower count |
| `GET /api/search?q=` | Search tweets (depends on X allowing guest search; the least reliable) |
| `GET /api/trends?location=` | Trending topics (`/api/trends/locations` lists the places) |
| `GET /api/health` | Which data sources are currently usable |

### `/api/urls/{handle}` options

| Option | Default | |
|---|---|---|
| `limit` | `50` | How many tweets to return (1 to 200). Pages are read until that many are found or X has no more. |
| `since` | none | Only tweets newer than this tweet id. |
| `retweets` | `false` | Include retweets. A retweet's URL is the original author's tweet. |
| `replies` | `true` | Include the account's replies. |
| `media` | all tweets | Only tweets with `image`, `video` or `gif` media; `any` = at least one, `none` = text only. |

Every tweet in the answer is marked with `hasImage`, `hasVideo`, `hasGif`, `mediaTypes` (a list) and `mediaCount`.

The `@` in front of a username is optional.

### Checking for new tweets on a schedule

Pravaha keeps no state, so your scheduler remembers where it was: take the `newestId` from one answer and send it as `since` next time. You get only what is new, or an empty list.

```bash
# first run: the latest 50
curl -s localhost:4000/api/urls/narendramodi

# every 15 minutes after that, with the newestId you saved
curl -s "localhost:4000/api/urls/narendramodi?since=2117650129998295517&limit=20"
```

With nothing new, `count` is `0` and `newestId` stays what you sent.

## How it works

Each call goes through the data sources in order, and a source that keeps failing is skipped for a while (a circuit breaker, in memory):

| Source | Used for |
|---|---|
| X guest API (the same internal calls x.com makes for a visitor who is not logged in) | timelines, tweets, profiles, search, trends |
| FxTwitter | timelines, tweets, profiles (fallback) |
| Twitter embeds (syndication) | single tweets (last resort) |

There is no cache and no database. When every source fails, the call fails with a `502` and `{"ok": false, "error": "..."}`.

## Configuration

Optional. Copy `.env.example` to `.env`.

| Variable | Default | |
|---|---|---|
| `PORT` | `4000` | Port to listen on |
| `HOST` | `0.0.0.0` | Address to listen on (`127.0.0.1` keeps it to your machine) |
| `RATE_LIMIT_MAX` | `60` | Requests allowed per window, per client |
| `RATE_LIMIT_WINDOW_MS` | `60000` | The window |
| `TWITTER_GUEST_TIMEOUT` | `10000` | Milliseconds to wait for X |

## Please read

- **It uses X's unofficial guest API, which is against X's terms of service.** X can change or block it at any time, and the API will then return errors. Treat it as best effort: do not build something that must never miss a tweet.
- It is built for light use, such as a few accounts every 15 minutes. Ask for only what you need (`since`, a small `limit`) and back off when a call fails. It does not try to hide from X.
- For anything that must be reliable, use the official [X API](https://developer.x.com).
- `/api/urls` with the default 50 reads several pages from X and takes a few seconds. There is no cache to answer faster.

## Project layout

```
src/
  server.ts            starts the API and the Swagger docs
  routes/              one file per endpoint
  services/            source-router.ts: tries the sources in order
  adapters/            one file per data source
  lib/                 circuit breaker, shared types
```
