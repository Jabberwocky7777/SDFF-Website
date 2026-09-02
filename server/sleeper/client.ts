/**
 * Typed, rate-limited Sleeper API client.
 *
 * Sleeper is read-only, unauthenticated, and asks clients to stay under
 * ~1000 requests/minute (PLAN.md §0). This client enforces a token-bucket
 * ceiling well below that, retries 429/5xx with exponential backoff + jitter,
 * and validates responses with the schemas in ./schemas.ts.
 */
import { z } from 'zod'
import {
  bracketMatchSchema,
  draftPickSchema,
  draftSchema,
  leagueListItemSchema,
  leagueSchema,
  matchupSchema,
  nflStateSchema,
  rosterSchema,
  transactionSchema,
  tradedPickSchema,
  userSchema,
  type BracketMatch,
  type LeagueListItem,
  type SleeperDraft,
  type SleeperDraftPick,
  type SleeperLeague,
  type SleeperMatchup,
  type SleeperPlayer,
  type SleeperRoster,
  type SleeperTransaction,
  type SleeperUser,
  type NflState,
  type TradedPick,
} from './schemas.js'

const BASE = 'https://api.sleeper.app/v1'

export interface SleeperClientOptions {
  /** Sustained request ceiling. Default 8/s — far under Sleeper's ~1000/min. */
  requestsPerSecond?: number
  /** Max burst above the sustained rate. Default 12. */
  burst?: number
  /** Retry attempts for 429/5xx/network errors. Default 4. */
  maxRetries?: number
  userAgent?: string
  fetchImpl?: typeof fetch
}

class TokenBucket {
  private tokens: number
  private lastRefill = Date.now()

  constructor(
    private readonly ratePerSec: number,
    private readonly capacity: number,
  ) {
    this.tokens = capacity
  }

  async take(): Promise<void> {
    for (;;) {
      this.refill()
      if (this.tokens >= 1) {
        this.tokens -= 1
        return
      }
      const deficit = 1 - this.tokens
      await sleep((deficit / this.ratePerSec) * 1000)
    }
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    if (elapsed <= 0) return
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.ratePerSec)
    this.lastRefill = now
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

export class SleeperError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly url?: string,
  ) {
    super(message)
    this.name = 'SleeperError'
  }
}

export class SleeperClient {
  private readonly bucket: TokenBucket
  private readonly maxRetries: number
  private readonly userAgent: string
  private readonly fetchImpl: typeof fetch
  private requestCount = 0

  constructor(opts: SleeperClientOptions = {}) {
    const rps = opts.requestsPerSecond ?? 8
    this.bucket = new TokenBucket(rps, opts.burst ?? Math.max(rps, 12))
    this.maxRetries = opts.maxRetries ?? 4
    this.userAgent = opts.userAgent ?? 'SDFF-Website/1.0 (+https://github.com/Jabberwocky7777/SDFF-Website)'
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  get stats(): { requestCount: number } {
    return { requestCount: this.requestCount }
  }

  /**
   * Rate-limited raw GET for the live proxy layer. Accepts a full URL or a
   * `/v1`-relative path. Returns parsed JSON (or null for 404 / empty).
   */
  raw(pathOrUrl: string): Promise<unknown> {
    return this.request(pathOrUrl)
  }

  private async request(pathname: string): Promise<unknown> {
    const url = pathname.startsWith('http') ? pathname : `${BASE}${pathname}`

    let attempt = 0
    for (;;) {
      await this.bucket.take()
      this.requestCount++

      let res: Response
      try {
        res = await this.fetchImpl(url, {
          headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        })
      } catch (err) {
        if (attempt < this.maxRetries) {
          await sleep(backoffMs(attempt))
          attempt++
          continue
        }
        throw new SleeperError(`Network error: ${(err as Error).message}`, undefined, url)
      }

      if (res.status === 404) {
        // Sleeper returns 404 for "no such thing" — surface as null, not an error.
        return null
      }

      if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'))
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : backoffMs(attempt)
        await sleep(waitMs)
        attempt++
        continue
      }

      if (!res.ok) {
        throw new SleeperError(`Sleeper returned ${res.status}`, res.status, url)
      }

      const text = await res.text()
      if (!text) return null
      try {
        return JSON.parse(text)
      } catch {
        throw new SleeperError('Sleeper returned invalid JSON', res.status, url)
      }
    }
  }

  private async getValidated<T>(pathname: string, schema: z.ZodType<T>): Promise<T | null> {
    const raw = await this.request(pathname)
    if (raw == null) return null
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      throw new SleeperError(
        `Response for ${pathname} failed validation: ${z.prettifyError(parsed.error)}`,
      )
    }
    return parsed.data
  }

  // ── Endpoints ──────────────────────────────────────────────────────────────

  getNflState(): Promise<NflState | null> {
    return this.getValidated('/state/nfl', nflStateSchema)
  }

  /** Resolve a username (or id) to a user object with the stable user_id. */
  getUser(usernameOrId: string): Promise<SleeperUser | null> {
    return this.getValidated(`/user/${encodeURIComponent(usernameOrId)}`, userSchema)
  }

  /** League discovery: every league a user is in for a given season. */
  getUserLeagues(userId: string, season: number | string): Promise<LeagueListItem[]> {
    return this.getValidated(
      `/user/${encodeURIComponent(userId)}/leagues/nfl/${season}`,
      z.array(leagueListItemSchema),
    ).then((r) => r ?? [])
  }

  getLeague(leagueId: string): Promise<SleeperLeague | null> {
    return this.getValidated(`/league/${leagueId}`, leagueSchema)
  }

  getRosters(leagueId: string): Promise<SleeperRoster[]> {
    return this.getValidated(`/league/${leagueId}/rosters`, z.array(rosterSchema)).then(
      (r) => r ?? [],
    )
  }

  getLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
    return this.getValidated(`/league/${leagueId}/users`, z.array(userSchema)).then(
      (r) => r ?? [],
    )
  }

  getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    return this.getValidated(
      `/league/${leagueId}/matchups/${week}`,
      z.array(matchupSchema),
    ).then((r) => r ?? [])
  }

  getWinnersBracket(leagueId: string): Promise<BracketMatch[]> {
    return this.getValidated(
      `/league/${leagueId}/winners_bracket`,
      z.array(bracketMatchSchema),
    ).then((r) => r ?? [])
  }

  getLosersBracket(leagueId: string): Promise<BracketMatch[]> {
    return this.getValidated(
      `/league/${leagueId}/losers_bracket`,
      z.array(bracketMatchSchema),
    ).then((r) => r ?? [])
  }

  getTransactions(leagueId: string, week: number): Promise<SleeperTransaction[]> {
    return this.getValidated(
      `/league/${leagueId}/transactions/${week}`,
      z.array(transactionSchema),
    ).then((r) => r ?? [])
  }

  getTradedPicks(leagueId: string): Promise<TradedPick[]> {
    return this.getValidated(
      `/league/${leagueId}/traded_picks`,
      z.array(tradedPickSchema),
    ).then((r) => r ?? [])
  }

  getLeagueDrafts(leagueId: string): Promise<SleeperDraft[]> {
    return this.getValidated(`/league/${leagueId}/drafts`, z.array(draftSchema)).then(
      (r) => r ?? [],
    )
  }

  getDraftPicks(draftId: string): Promise<SleeperDraftPick[]> {
    return this.getValidated(
      `/draft/${draftId}/picks`,
      z.array(draftPickSchema),
    ).then((r) => r ?? [])
  }

  /**
   * The ~5MB player dictionary. Fetch once per day, globally — never per request
   * (PLAN.md §1, §7). Not validated per-entry for size reasons; caller decides.
   */
  async getAllPlayers(): Promise<Record<string, SleeperPlayer>> {
    const raw = await this.request('/players/nfl')
    if (raw == null || typeof raw !== 'object') return {}
    return raw as Record<string, SleeperPlayer>
  }
}

function backoffMs(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 15_000)
  return base + Math.random() * 250
}

/** Shared singleton for the server process. */
let shared: SleeperClient | null = null
export function getSleeperClient(): SleeperClient {
  if (!shared) shared = new SleeperClient()
  return shared
}
