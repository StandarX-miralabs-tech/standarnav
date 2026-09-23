/**
 * One cumulated counter behind the README's downloads badge: npm installs, release
 * asset downloads, and the clones of this repository that were not made by its own CI.
 *
 * Three of those four terms are measured. The fourth is not, and the honesty of the
 * badge rests on saying which: a clone carries no identity, so CI checkouts can only be
 * *subtracted*, never *excluded*. See [ADR-0024](../docs/adr/0024-download-counter.md).
 *
 * The state file is the reason this is a script and not a shields.io URL. npm's download
 * API keeps a long history, but GitHub's traffic API keeps **fourteen days**: a day not
 * read before it falls off the window is gone. So every run folds the new days into a
 * running total and records how far it has counted.
 */

// Declared rather than pulled from `@types/bun`, the way `scripts/size-budget.ts` does it:
// `tsconfig.json` sets `"types": []`, so a global arrives named or not at all.
declare const Bun: {
  file(path: string): { exists(): Promise<boolean>; text(): Promise<string> };
  write(path: string, data: string): Promise<number>;
};

const OWNER_REPO = process.env.GITHUB_REPOSITORY ?? "StandarX-miralabs-tech/standarnav";
const PACKAGE = "@standarx/nav";

/**
 * A single `actions/checkout` registers about **two** clones, not one. Measured on this
 * repository on 2026-09-23 over the two days whose volume is dominated by CI: 294 clones
 * against 143 jobs (2.06) and 363 against 182 (1.99). Subtracting one per job would leave
 * roughly 430 clones standing that are almost certainly still CI.
 */
export const CHECKOUTS_PER_JOB = 2;

export interface DayCount {
  readonly day: string;
  readonly count: number;
}

export interface Tally {
  /** Last day folded in, `null` before the first run. Days are counted once, ever. */
  readonly through: string | null;
  readonly total: number;
}

export interface CounterState {
  readonly npm: Tally;
  readonly clones: Tally;
  /** An absolute the API already accumulates, so it is replaced rather than added to. */
  readonly releaseAssets: number;
  readonly updated: string;
}

export interface Badge {
  readonly schemaVersion: 1;
  readonly label: string;
  readonly message: string;
  readonly color: string;
}

export const EMPTY_STATE: CounterState = {
  npm: { through: null, total: 0 },
  clones: { through: null, total: 0 },
  releaseAssets: 0,
  updated: "",
};

/** UTC, and never today: a day still in progress would be folded in twice. */
export function lastCompleteDay(now: Date): string {
  const yesterday = new Date(now.getTime() - 86_400_000);
  return yesterday.toISOString().slice(0, 10);
}

/**
 * What a day of clones leaves once this repository's own checkouts are taken off it.
 * Clamped at zero: on a heavy CI day the subtraction can overshoot, and a negative day
 * would silently pay for a later one.
 */
export function residualClones(
  clones: readonly DayCount[],
  jobs: readonly DayCount[],
  perJob: number = CHECKOUTS_PER_JOB,
): DayCount[] {
  const byDay = new Map(jobs.map((entry) => [entry.day, entry.count]));
  return clones.map((entry) => ({
    day: entry.day,
    count: Math.max(0, entry.count - (byDay.get(entry.day) ?? 0) * perJob),
  }));
}

/**
 * Folds the days this tally has not seen, and only those. `through` is exclusive on the
 * left and `until` inclusive on the right, so a run that repeats adds nothing.
 */
export function fold(tally: Tally, days: readonly DayCount[], until: string): Tally {
  let total = tally.total;
  let through = tally.through;
  for (const entry of days) {
    if (entry.day > until) continue;
    if (tally.through !== null && entry.day <= tally.through) continue;
    total += entry.count;
    if (through === null || entry.day > through) through = entry.day;
  }
  return { through: through ?? tally.through, total };
}

export function counterTotal(state: CounterState): number {
  return state.npm.total + state.clones.total + state.releaseAssets;
}

export function badgeFor(state: CounterState): Badge {
  return {
    schemaVersion: 1,
    label: "downloads",
    message: counterTotal(state).toLocaleString("en-US"),
    color: "blue",
  };
}

async function json(url: string, token?: string | undefined): Promise<unknown> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers });
  if (!response.ok) return null;
  return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** `{"error":"package not found"}` is the answer for a package with no downloads yet. */
async function npmDays(from: string, to: string): Promise<DayCount[]> {
  const body = await json(`https://api.npmjs.org/downloads/range/${from}:${to}/${PACKAGE}`);
  if (!isRecord(body) || !Array.isArray(body.downloads)) return [];
  return body.downloads.flatMap((entry: unknown) =>
    isRecord(entry) && typeof entry.day === "string" && typeof entry.downloads === "number"
      ? [{ day: entry.day, count: entry.downloads }]
      : [],
  );
}

async function cloneDays(token: string): Promise<DayCount[]> {
  const body = await json(`https://api.github.com/repos/${OWNER_REPO}/traffic/clones`, token);
  if (!isRecord(body) || !Array.isArray(body.clones)) return [];
  return body.clones.flatMap((entry: unknown) =>
    isRecord(entry) && typeof entry.timestamp === "string" && typeof entry.count === "number"
      ? [{ day: entry.timestamp.slice(0, 10), count: entry.count }]
      : [],
  );
}

/**
 * Jobs, not runs: every job checks the repository out, so the job count is what a day of
 * CI costs the clone counter. One request per run, which is why only the days this state
 * has not folded yet are asked for.
 */
async function jobDays(token: string, days: readonly string[]): Promise<DayCount[]> {
  const counts: DayCount[] = [];
  for (const day of days) {
    const runs = await json(
      `https://api.github.com/repos/${OWNER_REPO}/actions/runs?created=${day}&per_page=100`,
      token,
    );
    if (!isRecord(runs) || !Array.isArray(runs.workflow_runs)) {
      counts.push({ day, count: 0 });
      continue;
    }
    let jobs = 0;
    for (const run of runs.workflow_runs) {
      if (!isRecord(run) || typeof run.jobs_url !== "string") continue;
      const body = await json(`${run.jobs_url}?per_page=100`, token);
      if (isRecord(body) && typeof body.total_count === "number") jobs += body.total_count;
    }
    counts.push({ day, count: jobs });
  }
  return counts;
}

async function releaseAssetDownloads(token: string): Promise<number> {
  const body = await json(
    `https://api.github.com/repos/${OWNER_REPO}/releases?per_page=100`,
    token,
  );
  if (!Array.isArray(body)) return 0;
  let total = 0;
  for (const release of body) {
    if (!isRecord(release) || !Array.isArray(release.assets)) continue;
    for (const asset of release.assets) {
      if (isRecord(asset) && typeof asset.download_count === "number")
        total += asset.download_count;
    }
  }
  return total;
}

/** Every day in `days` the tally has not folded yet, oldest first. */
export function pendingDays(tally: Tally, days: readonly DayCount[], until: string): string[] {
  return days
    .filter((entry) => entry.day <= until && (tally.through === null || entry.day > tally.through))
    .map((entry) => entry.day)
    .sort();
}

export async function update(
  previous: CounterState,
  now: Date,
  token: string,
): Promise<CounterState> {
  const until = lastCompleteDay(now);

  const clones = await cloneDays(token);
  const jobs = await jobDays(token, pendingDays(previous.clones, clones, until));

  // npm keeps a long history, so the window only has to reach back to the last day
  // folded; the first run asks for the package's whole life and gets what exists.
  const from = previous.npm.through ?? "2026-09-01";
  const npm = await npmDays(from, until);

  return {
    npm: fold(previous.npm, npm, until),
    clones: fold(previous.clones, residualClones(clones, jobs), until),
    releaseAssets: await releaseAssetDownloads(token),
    updated: until,
  };
}

export function readState(text: string): CounterState {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return EMPTY_STATE;
    const npm = isRecord(parsed.npm) ? parsed.npm : {};
    const clones = isRecord(parsed.clones) ? parsed.clones : {};
    return {
      npm: {
        through: typeof npm.through === "string" ? npm.through : null,
        total: typeof npm.total === "number" ? npm.total : 0,
      },
      clones: {
        through: typeof clones.through === "string" ? clones.through : null,
        total: typeof clones.total === "number" ? clones.total : 0,
      },
      releaseAssets: typeof parsed.releaseAssets === "number" ? parsed.releaseAssets : 0,
      updated: typeof parsed.updated === "string" ? parsed.updated : "",
    };
  } catch {
    return EMPTY_STATE;
  }
}

if (import.meta.main) {
  const token = process.env.GITHUB_TOKEN;
  if (token === undefined || token === "") {
    console.error("GITHUB_TOKEN is required — the traffic API needs push access");
    process.exit(1);
  }
  const directory = process.argv[2] ?? "badges";
  const statePath = `${directory}/state.json`;
  const badgePath = `${directory}/downloads.json`;

  const file = Bun.file(statePath);
  const previous = (await file.exists()) ? readState(await file.text()) : EMPTY_STATE;
  const next = await update(previous, new Date(), token);

  await Bun.write(statePath, `${JSON.stringify(next, null, 2)}\n`);
  await Bun.write(badgePath, `${JSON.stringify(badgeFor(next), null, 2)}\n`);

  console.log(
    `npm ${next.npm.total} + clones ${next.clones.total} + release assets ${next.releaseAssets} = ${counterTotal(next)} through ${next.updated}`,
  );
}
