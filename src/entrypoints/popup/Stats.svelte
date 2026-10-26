<script lang="ts">
  import { onMount } from 'svelte';
  import { getConfig, getFlags } from '../../lib/settings';
  import { getQueue, upNext } from '../../lib/queue';
  import { initials } from '../../lib/format';
  import { dayAgo, fmtMin, getLog, isoDate, minutesOn, minutesOver, logItem, type Page, type WatchLog } from './lib';

  let { go }: { go: (p: Page) => void } = $props();

  let log = $state<WatchLog>({});
  let limit = $state(0);
  /** Seconds still queued (0 when the queue is off), and the speed they'd play at. */
  let queueSec = $state(0);
  let rate = $state(1);
  let table = $state(false);
  let hover = $state<number | null>(null);
  let focus = $state<number | null>(null);
  let dayEls = $state<HTMLButtonElement[]>([]);

  onMount(() => {
    void Promise.all([getLog(), getConfig('watch-time'), getFlags(), getQueue(), getConfig('playback-speed')]).then(
      ([l, wt, f, q, speed]) => {
        log = l;
        limit = wt.dailyLimitMinutes;
        queueSec = f['read-later-queue'] ? upNext(q).reduce((s, i) => s + i.duration, 0) : 0;
        rate = f['playback-speed'] ? speed.rate : 1;
      },
    );
    return logItem.watch((l) => (log = l));
  });

  const fmtDate = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', o);
  /** Bars use 112px of a 128px plot (room for the notes above them). */
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

  /** The day's finding: will the queue fit in what's left of the limit? */
  const finding = $derived.by(() => {
    if (!limit || !queueSec) return '';
    const need = Math.max(1, Math.round(queueSec / rate / 60));
    const left = limit - todayMin;
    const at = rate === 1 ? '' : ` at ${rate}×`;
    if (left <= 0) return `Your queue needs ${fmtMin(need)}${at}, and today's limit is used up.`;
    return need > left
      ? `Your queue needs ${fmtMin(need)}${at}, ${fmtMin(need - left)} more than you have left.`
      : `Your queue needs ${fmtMin(need)}${at}, within what you have left.`;
  });

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
        text: `${fmtDate(dayAgo(6), { month: 'short', day: 'numeric' })} – ${fmtDate(dayAgo(0), { month: 'short', day: 'numeric' })}`,
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
    const all = [...totals.values()]
      .map((c) => ({ name: c.name || 'Unknown channel', min: Math.round(c.sec / 60) }))
      .filter((c) => c.min > 0)
      .sort((a, b) => b.min - a.min);
    const top = all.slice(0, 5);
    const other = Math.max(0, total - top.reduce((s, c) => s + c.min, 0));
    return { top, other, otherCount: all.length - top.length };
  });
</script>

<div class="page stats">
  <header class="top sub">
    <button class="ib" aria-label="Back to now playing" onclick={() => go('main')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>
    </button>
    <h1>Watch time</h1>
    <span class="date">{fmtDate(new Date(), { weekday: 'short', month: 'short', day: 'numeric' })}</span>
  </header>

  <div class="scroll body">
    <section class="card" aria-label="Today">
      <div class="lab">Today</div>
      <div class="big">
        <strong>{fmtMin(todayMin)}</strong>
        {#if limit}
          <span class="muted">of {fmtMin(limit)}</span>
          <span class="left">{todayMin <= limit ? `${fmtMin(limit - todayMin)} left` : `${fmtMin(todayMin - limit)} over`}</span>
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
        <div class="ends"><span>0</span><span>{fmtMin(limit)} limit</span></div>
      {/if}
      {#if finding}<p class="finding">{finding}</p>{/if}
      <button class="link" onclick={() => go('settings:Watch time')}>
        {limit ? 'Change daily limit' : 'Set a daily limit'}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>
      </button>
    </section>

    <section class="card" aria-label="Last 7 days">
      <div class="head">
        <h2>Last 7 days</h2>
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
      <div class="strip">
        <div><span class="lab">Total</span><strong>{fmtMin(total)}</strong></div>
        <div><span class="lab">Daily average</span><strong>{fmtMin(Math.round(total / 7))}</strong></div>
        <div>
          <span class="lab">Over limit</span>
          <strong>{limit ? `${overDays} day${overDays === 1 ? '' : 's'}` : 'No limit'}</strong>
        </div>
      </div>
      {#if lastWeek}
        <div class="vs">
          {#if total === lastWeek}
            <span><strong>Same</strong> as the week before ({fmtMin(lastWeek)})</span>
          {:else}
            <svg class:less={total < lastWeek} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              {#if total < lastWeek}<path d="M12 5v14M6 13l6 6 6-6"></path>{:else}<path d="M12 19V5M6 11l6-6 6 6"></path>{/if}
            </svg>
            <span><strong class:less={total < lastWeek}>{fmtMin(Math.abs(total - lastWeek))} {total < lastWeek ? 'less' : 'more'}</strong> than the week before ({fmtMin(lastWeek)})</span>
          {/if}
        </div>
      {/if}

      {#if !table}
        <div class="readout">{#if readout.value}<strong>{readout.value}</strong>{/if}<span>{readout.text}</span></div>
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
                {#if note}<span class="note" style:bottom="{h + 4}px">{note}</span>{/if}
                <span class="bar" class:over={d.over > 0} class:today={d.today} style:height="{h}px"></span>
              </span>
              <span class="dl" class:cur={d.today}>{d.short}</span>
            </button>
          {/each}
        </div>
        <div class="legend">
          {#if limit}
            <span><span class="key" style:background="var(--bar)" aria-hidden="true"></span>Under {fmtMin(limit)}</span>
            <span><span class="key" style:background="var(--bar-over)" aria-hidden="true"></span>Over {fmtMin(limit)}</span>
          {/if}
          <span><span class="key" style:background="var(--accent)" aria-hidden="true"></span>Today</span>
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
    </section>

    <section class="card" aria-label="Most watched channels, last 7 days">
      <div class="head">
        <h2>Most watched channels</h2>
        <span class="lab">Last 7 days</span>
      </div>
      {#if channels.top.length}
        <ol class="chans">
          {#each channels.top as c, i (i)}
            <li>
              <span class="av" aria-hidden="true">{initials(c.name)}</span>
              <span class="ctext">
                <span class="cline"><span class="cname">{c.name}</span><span class="ctime">{fmtMin(c.min)}</span></span>
                <span class="cbar" class:top={i === 0} aria-hidden="true" style:width="{((c.min / channels.top[0].min) * 100).toFixed(1)}%"></span>
              </span>
            </li>
          {/each}
          {#if channels.other}
            <li class="others">
              <span class="av" aria-hidden="true">{channels.otherCount || '·'}</span>
              <span class="ctext"><span class="cline"><span class="cname">Other channels</span><span class="ctime">{fmtMin(channels.other)}</span></span></span>
            </li>
          {/if}
        </ol>
      {:else}
        <p class="empty">Nothing watched in the last 7 days.</p>
      {/if}
    </section>
  </div>
</div>

<style>
  .date {
    padding-right: 6px;
    font-size: 12px;
    color: var(--muted);
  }
  .body {
    padding: 0 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .card {
    flex-shrink: 0;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 24px;
    margin: -4px -6px 0 0;
  }
  .head h2 {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
  }

  /* Today */
  .big {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-top: 4px;
  }
  .big strong {
    font-size: 32px;
    line-height: 36px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .big .muted {
    font-size: 15px;
  }
  .left {
    margin-left: auto;
    font-size: 13px;
    font-weight: 500;
  }
  .meter {
    height: 8px;
    margin-top: 12px;
    border-radius: 999px;
    background: var(--s3);
    overflow: hidden;
  }
  .meter div {
    height: 100%;
    border-radius: 999px;
    background: var(--accent);
  }
  .ends {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-size: 11px;
    line-height: 14px;
    color: var(--faint);
  }
  .finding {
    margin: 12px 0 0;
    font-size: 13px;
    line-height: 18px;
  }
  .link {
    margin: 8px 0 -4px -2px;
    height: 24px;
    padding: 0 2px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
  }
  .link:hover {
    color: var(--text);
  }

  /* Last 7 days */
  .strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 10px;
  }
  .strip div {
    padding-left: 12px;
    border-left: 1px solid var(--s3);
  }
  .strip div:first-child {
    padding-left: 0;
    border-left: 0;
  }
  .strip strong {
    display: block;
    margin-top: 2px;
    font-size: 16px;
    line-height: 22px;
    font-weight: 600;
  }
  .vs {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    font-size: 12px;
    line-height: 16px;
    color: var(--muted);
  }
  .vs strong {
    font-weight: 600;
    color: var(--text);
  }
  .vs .less {
    color: var(--positive);
  }
  .readout {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin: 14px 0 8px;
    min-height: 20px;
    font-size: 12px;
    color: var(--muted);
  }
  .readout strong {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  .chart {
    position: relative;
    display: flex;
    padding-left: 28px;
  }
  .axis {
    position: absolute;
    left: 28px;
    right: 0;
    top: 0;
    height: 128px;
    pointer-events: none;
  }
  .gl {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px solid var(--rule);
  }
  .gl.base {
    bottom: 0;
    border-top-color: var(--s3);
  }
  .gl.limit {
    border-top: 1px dashed var(--muted);
  }
  .yl {
    position: absolute;
    left: -28px;
    width: 22px;
    text-align: right;
    font-size: 11px;
    line-height: 12px;
    color: var(--faint);
  }
  .day {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    border-radius: 6px;
  }
  .plot {
    position: relative;
    width: 100%;
    height: 128px;
  }
  .bar {
    position: absolute;
    bottom: 0;
    left: 50%;
    width: 22px;
    margin-left: -11px;
    border-radius: 4px 4px 0 0;
    background: var(--bar);
    transition: opacity 0.15s ease;
  }
  .bar.over {
    background: var(--bar-over);
  }
  .bar.today {
    background: var(--accent);
  }
  .day:hover .bar,
  .day:focus-visible .bar {
    opacity: 0.8;
  }
  .note {
    position: absolute;
    left: -8px;
    right: -8px;
    text-align: center;
    font-size: 11px;
    line-height: 12px;
    color: var(--muted);
    white-space: nowrap;
  }
  .dl {
    margin-top: 6px;
    font-size: 11px;
    line-height: 14px;
    color: var(--faint);
  }
  .dl.cur,
  .day:hover .dl {
    color: var(--text);
  }
  .dl.cur {
    font-weight: 600;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 12px;
    font-size: 11px;
    line-height: 14px;
    color: var(--muted);
  }
  .legend > span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .key {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
  .dash {
    width: 14px;
    border-top: 1px dashed var(--muted);
  }
  .tbl {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    font-size: 13px;
  }
  .tbl li {
    display: flex;
    gap: 10px;
    padding: 8px 0;
  }
  .tbl li + li {
    border-top: 1px solid var(--rule);
  }
  .grow {
    flex-grow: 1;
  }
  .tbl .cur {
    font-weight: 600;
  }
  .tbl .muted {
    font-size: 12px;
  }
  .t {
    min-width: 52px;
    text-align: right;
    font-weight: 500;
  }

  /* Channels */
  .chans {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
  }
  .chans li {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
  }
  .av {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--s3);
    font-size: 11px;
    font-weight: 600;
  }
  .ctext {
    flex-grow: 1;
    min-width: 0;
  }
  .cline {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 13px;
    line-height: 18px;
  }
  .cname {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ctime {
    flex-shrink: 0;
    font-weight: 500;
  }
  .cbar {
    display: block;
    height: 2px;
    margin-top: 5px;
    border-radius: 2px;
    background: var(--faint);
  }
  .cbar.top {
    background: var(--text);
  }
  .others {
    color: var(--muted);
  }
  .empty {
    margin: 10px 0 0;
    font-size: 13px;
    color: var(--muted);
  }
</style>
