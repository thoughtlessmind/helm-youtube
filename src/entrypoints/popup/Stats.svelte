<script lang="ts">
  import { onMount } from 'svelte';
  import { getConfig } from '../../lib/settings';
  import { initials } from '../../lib/format';
  import { dayAgo, fmtMin, getLog, isoDate, minutesOn, minutesOver, logItem, type Page, type WatchLog } from './lib';

  let { go }: { go: (p: Page) => void } = $props();

  let log = $state<WatchLog>({});
  let limit = $state(0);
  let table = $state(false);
  let hover = $state<number | null>(null);
  let focus = $state<number | null>(null);
  let dayEls = $state<HTMLButtonElement[]>([]);

  onMount(() => {
    void Promise.all([getLog(), getConfig('watch-time')]).then(([l, wt]) => {
      log = l;
      limit = wt.dailyLimitMinutes;
    });
    return logItem.watch((l) => (log = l));
  });

  const fmtDate = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', o);
  /** The plot is 112px tall inside a 128px box (room for the notes above bars). */
  const PLOT = 112;

  const days = $derived(
    [6, 5, 4, 3, 2, 1, 0].map((back) => {
      const d = dayAgo(back);
      const min = minutesOn(log, d);
      const today = back === 0;
      const over = !today && limit ? Math.max(0, min - limit) : 0;
      return {
        today,
        min,
        over,
        short: today ? 'Today' : fmtDate(d, { weekday: 'short' }),
        long: fmtDate(d, { weekday: 'long' }),
        date: fmtDate(d, { month: 'short', day: 'numeric' }),
      };
    }),
  );
  const todayMin = $derived(days[6].min);
  const total = $derived(days.reduce((s, d) => s + d.min, 0));
  const lastWeek = $derived(minutesOver(log, 7, 7));
  const overDays = $derived(days.filter((d) => d.over > 0).length);

  // Board scale is 200 min = 112px; grow it when a day or the limit needs more room.
  const domain = $derived(Math.max(200, Math.max(...days.map((d) => d.min)) * 1.05, limit * 1.1));
  const px = $derived(PLOT / domain);
  const hourStep = $derived(60 * Math.max(1, Math.ceil(domain / 60 / 4)));
  const grid = $derived(
    Array.from({ length: Math.floor((domain - 1) / hourStep) }, (_, i) => (i + 1) * hourStep).filter((m) => m !== limit),
  );

  const label = (d: (typeof days)[number]) =>
    `${d.long}, ${d.date}${d.today ? ', today' : ''}: ${fmtMin(d.min)}` +
    (d.today ? ' so far' : d.over ? `, ${fmtMin(d.over)} over the ${fmtMin(limit)} limit` : '');

  const active = $derived(hover ?? focus);
  const readout = $derived.by(() => {
    if (active == null)
      return {
        value: '',
        text: `${fmtDate(dayAgo(6), { weekday: 'short', month: 'short', day: 'numeric' })} – ${fmtDate(dayAgo(0), { weekday: 'short', month: 'short', day: 'numeric' })}`,
      };
    const d = days[active];
    return {
      value: fmtMin(d.min),
      text: d.today
        ? `so far · Today, ${d.long} ${d.date}`
        : `${d.long}, ${d.date}${d.over ? ` · ${fmtMin(d.over)} over limit` : ''}`,
    };
  });

  function dayKey(e: KeyboardEvent, i: number) {
    const to = ({ ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: 6 } as Record<string, number>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    dayEls[Math.max(0, Math.min(6, to))]?.focus();
  }

  const channels = $derived.by(() => {
    const totals = new Map<string, { name: string; sec: number }>();
    for (let back = 0; back < 7; back++) {
      for (const [id, c] of Object.entries(log[isoDate(dayAgo(back))]?.perChannel ?? {})) {
        const t = totals.get(id) ?? { name: c.name, sec: 0 };
        t.sec += c.seconds;
        if (c.name) t.name = c.name;
        totals.set(id, t);
      }
    }
    const top = [...totals.values()]
      .map((c) => ({ name: c.name || 'Unknown channel', min: Math.round(c.sec / 60) }))
      .filter((c) => c.min > 0)
      .sort((a, b) => b.min - a.min)
      .slice(0, 5);
    const other = Math.max(0, total - top.reduce((s, c) => s + c.min, 0));
    return { top, other };
  });
</script>

<div class="page stats">
  <header class="subhead">
    <button class="ib" aria-label="Back to now playing" onclick={() => go('main')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>
    </button>
    <h1>Watch time</h1>
  </header>

  <div class="scroll body">
    <section aria-label="Today">
      <div class="sec-head">
        <h2 class="label">Today</h2>
        <span class="small">{fmtDate(new Date(), { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </div>
      <div class="card today-card">
        <div class="today-row">
          <span class="big">{fmtMin(todayMin)}</span>
          {#if limit}
            <span class="muted">of {fmtMin(limit)}</span>
            <span class="small">{todayMin <= limit ? `${fmtMin(limit - todayMin)} left` : `${fmtMin(todayMin - limit)} over`}</span>
          {/if}
        </div>
        {#if limit}
          <div
            class="meter"
            role="meter"
            aria-label="Watched today"
            aria-valuemin="0"
            aria-valuemax={limit}
            aria-valuenow={Math.min(todayMin, limit)}
            aria-valuetext="{fmtMin(todayMin)} of {fmtMin(limit)}"
          >
            <div style:width="{Math.min(100, (todayMin / limit) * 100)}%"></div>
          </div>
        {/if}
      </div>
    </section>

    <section aria-label="Last 7 days">
      <div class="sec-head week-head">
        <h2 class="label">Last 7 days</h2>
        <button
          class="ib sm"
          aria-label="Show as table"
          title="Show as table"
          aria-pressed={table}
          onclick={() => {
            table = !table;
            hover = focus = null;
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"></path></svg>
        </button>
      </div>
      <div class="card week">
        <div class="tiles">
          <div><span class="small">Total</span><span class="num">{fmtMin(total)}</span></div>
          <div><span class="small">Daily average</span><span class="num">{fmtMin(Math.round(total / 7))}</span></div>
          <div>
            <span class="small">Over limit</span>
            <span class="num">{limit ? `${overDays} day${overDays === 1 ? '' : 's'}` : 'No limit'}</span>
          </div>
        </div>
        {#if lastWeek}
          <div class="vs">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              {#if total <= lastWeek}<path d="M12 5v14M6 13l6 6 6-6"></path>{:else}<path d="M12 19V5M6 11l6-6 6 6"></path>{/if}
            </svg>
            <span>
              {#if total === lastWeek}
                <strong>Same</strong> as last week ({fmtMin(lastWeek)})
              {:else}
                <strong>{fmtMin(Math.abs(total - lastWeek))} {total < lastWeek ? 'less' : 'more'}</strong> than last week ({fmtMin(lastWeek)})
              {/if}
            </span>
          </div>
        {/if}

        {#if !table}
          <div class="readout"><strong>{readout.value}</strong><span class:gap={!!readout.value}>{readout.text}</span></div>
          <div
            class="chart"
            role="group"
            aria-label="Watch time per day, {days[0].long} to today.{limit ? ` Daily limit ${fmtMin(limit)}.` : ''}"
          >
            <div class="axis" aria-hidden="true">
              <div class="gl base"></div>
              {#each grid as m (m)}
                <div class="gl" style:bottom="{m * px}px"></div>
                <span class="yl" style:bottom="{m * px - 6}px">{fmtMin(m)}</span>
              {/each}
              {#if limit}
                <div class="gl limit" style:bottom="{limit * px}px"></div>
                <span class="yl" style:bottom="{limit * px - 6}px">{fmtMin(limit)}</span>
              {/if}
            </div>
            {#each days as d, i (i)}
              {@const h = d.min * px}
              {@const note = d.today ? 'so far' : d.over ? `+${fmtMin(d.over)}` : ''}
              <button
                class="day"
                bind:this={dayEls[i]}
                aria-label={label(d)}
                onmouseenter={() => (hover = i)}
                onmouseleave={() => (hover = null)}
                onfocus={() => (focus = i)}
                onblur={() => (focus = null)}
                onkeydown={(e) => dayKey(e, i)}
              >
                <span class="plot">
                  {#if note}<span class="note" style:bottom="{h + 3}px">{note}</span>{/if}
                  <span class="bar" class:over={d.over > 0} class:today={d.today} style:height="{h}px"></span>
                </span>
                <span class="dl" class:cur={d.today}>{d.short}</span>
              </button>
            {/each}
          </div>
          <div class="legend">
            {#if limit}
              <span><span class="key" style:background="var(--mark-bar)" aria-hidden="true"></span>Under {fmtMin(limit)}</span>
              <span><span class="key" style:background="var(--mark-over)" aria-hidden="true"></span>Over {fmtMin(limit)}</span>
            {/if}
            <span><span class="key" style:background="var(--accent-mark)" aria-hidden="true"></span>Today</span>
            {#if limit}<span><span class="dash" aria-hidden="true"></span>Daily limit</span>{/if}
          </div>
        {:else}
          <ul class="tbl" aria-label="Watch time per day">
            {#each days as d, i (i)}
              <li>
                <span class="grow" class:cur={d.today}>{d.long}, {d.date}</span>
                <span class="muted">{d.today ? 'so far' : d.over ? `${fmtMin(d.over)} over` : ''}</span>
                <span class="t">{fmtMin(d.min)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </section>

    <section aria-label="Most watched channels, last 7 days">
      <div class="sec-head">
        <h2 class="label">Most watched channels</h2>
        <span class="small">Last 7 days</span>
      </div>
      <div class="card chans">
        {#if channels.top.length}
          <ol>
            {#each channels.top as c, i (i)}
              <li>
                <span class="av" aria-hidden="true">{initials(c.name)}</span>
                <span class="ctext">
                  <span class="cline"><span class="cname">{c.name}</span><span class="ctime">{fmtMin(c.min)}</span></span>
                  <span class="cbar" aria-hidden="true" style:width="{((c.min / channels.top[0].min) * 100).toFixed(1)}%"></span>
                </span>
              </li>
            {/each}
          </ol>
          {#if channels.other}
            <div class="others">
              <span class="av muted" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="6" cy="12" r="1.6" fill="currentColor"></circle><circle cx="12" cy="12" r="1.6" fill="currentColor"></circle><circle cx="18" cy="12" r="1.6" fill="currentColor"></circle></svg>
              </span>
              <span class="grow muted">Other channels</span>
              <span class="ctime">{fmtMin(channels.other)}</span>
            </div>
          {/if}
        {:else}
          <div class="empty">Nothing watched in the last 7 days.</div>
        {/if}
      </div>
    </section>
  </div>

  <footer class="foot">
    <div class="grow small">Daily limit <strong>{limit ? fmtMin(limit) : 'Off'}</strong></div>
    <button class="ghost change" aria-label="Change daily limit in Settings" onclick={() => go('settings')}>
      Change
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>
    </button>
  </footer>
</div>

<style>
  .body {
    padding: 4px 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .grow {
    flex-grow: 1;
  }
  .small {
    font-size: 11px;
    color: var(--muted);
  }
  .sec-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 0 4px 8px;
  }
  .week-head {
    align-items: center;
    margin: -6px 0 2px 4px;
  }
  .today-card {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .today-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .today-row .muted {
    font-size: 13px;
  }
  .today-row .small {
    margin-left: auto;
    font-size: 12px;
  }
  .big {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1;
  }
  .meter {
    height: 6px;
    border-radius: 999px;
    background: var(--accent-soft);
    overflow: hidden;
  }
  .meter div {
    height: 100%;
    border-radius: 999px;
    background: var(--accent-mark);
  }
  [aria-pressed='true'] {
    background: rgba(127, 127, 140, 0.16);
    color: var(--text);
  }
  .week-head .ib:not([aria-pressed='true']) {
    color: var(--muted);
  }
  .week {
    padding: 14px;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .tiles div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .num {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .vs {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    font-size: 12px;
    color: var(--muted);
  }
  .vs strong,
  .readout strong,
  .foot strong {
    color: var(--text);
    font-weight: 700;
  }
  .readout {
    margin-top: 14px;
    height: 18px;
    font-size: 12px;
    line-height: 18px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .readout .gap {
    margin-left: 6px;
  }
  .chart {
    position: relative;
    display: flex;
    padding-left: 22px;
    margin-top: 4px;
  }
  .axis {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 128px;
    pointer-events: none;
    font-size: 10px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .gl {
    position: absolute;
    left: 22px;
    right: 0;
    border-top: 1px solid var(--line);
  }
  .gl.base {
    bottom: 0;
    border-top-color: var(--track);
  }
  .gl.limit {
    border-top: 1px dashed var(--muted);
  }
  /* Right edge at 16px like the board; longer labels ("30m") grow left. */
  .yl {
    position: absolute;
    right: calc(100% - 16px);
    line-height: 12px;
    white-space: nowrap;
  }
  .day {
    flex: 1 1 0;
    min-width: 0;
    position: relative;
    display: flex;
    flex-direction: column;
    border-radius: 10px;
    transition: background-color 0.15s ease;
  }
  .day:hover {
    background-color: rgba(127, 127, 140, 0.08);
  }
  .plot {
    position: relative;
    display: block;
    height: 128px;
  }
  .note {
    position: absolute;
    left: -4px;
    right: -4px;
    text-align: center;
    font-size: 10px;
    line-height: 12px;
    color: var(--muted);
    white-space: nowrap;
  }
  .bar {
    position: absolute;
    bottom: 0;
    left: 50%;
    width: 20px;
    margin-left: -10px;
    border-radius: 4px 4px 0 0;
    background: var(--mark-bar);
    transition: filter 0.15s ease;
  }
  .bar.over {
    background: var(--mark-over);
  }
  .bar.today {
    background: var(--accent-mark);
  }
  .day:hover .bar,
  .day:focus-visible .bar {
    filter: brightness(1.22);
  }
  .dl {
    display: block;
    padding: 6px 0 4px;
    text-align: center;
    font-size: 11px;
    color: var(--muted);
    font-weight: 500;
  }
  .dl.cur {
    color: var(--text);
    font-weight: 700;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    margin-top: 8px;
    font-size: 11px;
    color: var(--muted);
  }
  .legend > span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .legend .key {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .dash {
    width: 14px;
    border-top: 1px dashed var(--muted);
  }
  .tbl {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
  }
  .tbl li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 0;
    font-size: 12px;
  }
  .tbl li + li {
    border-top: 1px solid var(--line);
  }
  .tbl .cur {
    font-weight: 700;
  }
  .tbl .t {
    width: 56px;
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .chans {
    padding: 6px 0;
  }
  .chans ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .chans li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
  }
  .av {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--avatar);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .ctext {
    flex-grow: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cline {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .cname {
    flex-grow: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ctime {
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .cbar {
    display: block;
    height: 4px;
    border-radius: 2px;
    background: var(--mark-bar);
  }
  .others {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px 8px;
    margin-top: 2px;
    border-top: 1px solid var(--line);
    font-size: 13px;
  }
  .empty {
    padding: 14px;
    font-size: 12px;
    color: var(--muted);
    text-align: center;
  }
  .foot .small {
    font-size: 12px;
  }
  .change {
    color: var(--accent-text);
  }
</style>
