import type { Feature } from '../lib/features';
import { getConfig, watchConfig, type FeatureConfig } from '../lib/settings';
import { onKey } from '../lib/yt/keys';
import { flashToast } from '../lib/yt/toast';
import { channelIdFromHref } from '../lib/yt/video';
import {
  startTracking,
  getRange,
  getChannelTotals,
  getChannelTotal,
  type DayStats,
  type ChannelStats,
} from '../lib/yt/watch-tracker';

/**
 * watch-time.ts
 *
 * Watch-time stats on top of the shared tracker (lib/yt/watch-tracker.ts):
 *   - Dashboard: a floating button (bottom-right) opens a shadow-DOM panel
 *     with today / last-7-days totals, a 7-day bar chart and the most-watched
 *     channels (7 or 30 days). Click outside, ✕ or Esc closes it.
 *   - Channel pages: a badge in the header with your total time on that channel.
 *   - Soft daily limit (config `dailyLimitMinutes`, 0 = off): a toast once a
 *     day when today's total crosses it. Never pauses or blocks anything.
 */

const LIMIT_CHECK_MS = 30_000;

/** Channel-header anchors for the badge, most specific first; first match wins. */
const HEADER_SELECTORS = [
  'ytd-c4-tabbed-header-renderer #channel-header-container',
  'ytd-c4-tabbed-header-renderer #inner-header-container',
  'ytd-page-header-renderer .page-header-view-model-wiz__page-header-headline-info',
  'ytd-page-header-renderer .page-header-view-model-wiz__page-header-headline',
  '#channel-header #inner-header-container',
  '#channel-header',
  'ytd-channel-name.ytd-c4-tabbed-header-renderer',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format seconds as "Xh Ym" or "Ym" (floored). */
function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

// ---------------------------------------------------------------------------
// CSS (shadow DOM, themed via --yt-sys-color-baseline--* tokens)
// ---------------------------------------------------------------------------

const DASHBOARD_CSS = `
  :host { all: initial; font-family: Roboto, Arial, sans-serif; }

  .fab {
    position: fixed;
    bottom: 260px;
    right: 16px;
    z-index: 2147483645;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: var(--yt-sys-color-baseline--static-brand-red);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 12px rgba(0,0,0,0.4);
    transition: transform 0.15s;
  }
  .fab:hover { transform: scale(1.1); }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 72px 16px 0 0;
  }
  .overlay[hidden] { display: none; }

  .panel {
    width: 360px;
    max-height: calc(100vh - 96px);
    overflow-y: auto;
    border-radius: 12px;
    background: var(--yt-sys-color-baseline--menu-background);
    color: var(--yt-sys-color-baseline--text-primary);
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--yt-sys-color-baseline--outline);
    position: sticky;
    top: 0;
    background: inherit;
  }
  .header h2 { margin: 0; font-size: 16px; font-weight: 600; }

  .close-btn {
    background: none;
    border: none;
    color: var(--yt-sys-color-baseline--text-secondary);
    cursor: pointer;
    font-size: 20px;
    padding: 4px 8px;
    border-radius: 4px;
    line-height: 1;
  }
  .close-btn:hover {
    color: var(--yt-sys-color-baseline--text-primary);
    background: var(--yt-sys-color-baseline--additive-background);
  }

  .section {
    padding: 16px 20px;
    border-bottom: 1px solid var(--yt-sys-color-baseline--outline);
  }
  .section:last-child { border-bottom: none; }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--yt-sys-color-baseline--text-secondary);
    margin: 0 0 12px;
  }

  .stat-row { display: flex; gap: 12px; }
  .stat-box {
    flex: 1;
    background: var(--yt-sys-color-baseline--additive-background);
    border-radius: 8px;
    padding: 12px;
    text-align: center;
  }
  .stat-value {
    font-size: 22px;
    font-weight: 700;
    color: var(--yt-sys-color-baseline--static-brand-red);
  }
  .stat-label {
    font-size: 11px;
    color: var(--yt-sys-color-baseline--text-secondary);
    margin-top: 4px;
  }

  /* 7-day bar chart */
  .chart {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 80px;
    padding-top: 8px;
  }
  .bar-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    height: 100%;
  }
  .bar {
    width: 100%;
    min-height: 2px;
    border-radius: 3px 3px 0 0;
    background: var(--yt-sys-color-baseline--static-brand-red);
    opacity: 0.55;
  }
  .today .bar { opacity: 1; }
  .bar-day {
    font-size: 9px;
    color: var(--yt-sys-color-baseline--text-secondary);
    white-space: nowrap;
  }

  /* Channel list */
  .tab-row { display: flex; gap: 8px; margin-bottom: 12px; }
  .tab-btn {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 12px;
    border: 1px solid var(--yt-sys-color-baseline--outline);
    background: none;
    color: var(--yt-sys-color-baseline--text-secondary);
    cursor: pointer;
  }
  .tab-btn.active {
    background: var(--yt-sys-color-baseline--static-brand-red);
    border-color: transparent;
    color: #fff;
  }

  .channel-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .channel-item { display: flex; align-items: center; gap: 10px; }
  .channel-rank {
    font-size: 12px;
    color: var(--yt-sys-color-baseline--text-secondary);
    width: 18px;
    text-align: right;
    flex-shrink: 0;
  }
  .channel-bar-wrap {
    flex: 1;
    min-width: 0;
    position: relative;
    height: 20px;
    border-radius: 4px;
    overflow: hidden;
    background: var(--yt-sys-color-baseline--additive-background);
  }
  .channel-bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--yt-sys-color-baseline--additive-background);
  }
  .channel-name {
    position: relative;
    display: block;
    padding: 0 8px;
    font-size: 12px;
    line-height: 20px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .channel-time {
    font-size: 12px;
    color: var(--yt-sys-color-baseline--text-secondary);
    flex-shrink: 0;
  }

  .empty {
    font-size: 13px;
    color: var(--yt-sys-color-baseline--text-disabled);
    text-align: center;
    padding: 8px 0;
  }
`;

const BADGE_CSS = `
  :host { all: initial; display: block; }
  .badge {
    display: inline-block;
    margin-top: 8px;
    padding: 4px 10px;
    border-radius: 12px;
    background: var(--yt-sys-color-baseline--additive-background);
    border: 1px solid var(--yt-sys-color-baseline--outline);
    color: var(--yt-sys-color-baseline--text-secondary);
    font: 500 13px Roboto, Arial, sans-serif;
  }
  strong { color: var(--yt-sys-color-baseline--text-primary); }
`;

// ---------------------------------------------------------------------------
// Dashboard rendering
// ---------------------------------------------------------------------------

/** `week` is today first, as returned by getRange. */
function renderBarChart(week: DayStats[]): string {
  const max = Math.max(...week.map((d) => d.totalSeconds), 1);
  const bars = [...week]
    .reverse() // oldest first
    .map(
      (d) => `
        <div class="bar-col${d === week[0] ? ' today' : ''}">
          <div class="bar" style="height:${(d.totalSeconds / max) * 100}%" title="${fmtTime(d.totalSeconds)}"></div>
          <div class="bar-day">${new Date(`${d.date}T12:00`).toLocaleDateString(undefined, { weekday: 'short' })}</div>
        </div>`,
    )
    .join('');
  return `<div class="chart">${bars}</div>`;
}

function renderChannelList(channels: ChannelStats[]): string {
  if (channels.length === 0) return `<div class="empty">No data yet</div>`;
  const max = channels[0].seconds;
  const items = channels
    .slice(0, 10)
    .map((ch, i) => {
      const label = escHtml(ch.name || ch.channelId);
      return `
        <li class="channel-item">
          <span class="channel-rank">${i + 1}</span>
          <div class="channel-bar-wrap">
            <div class="channel-bar-fill" style="width:${(ch.seconds / max) * 100}%"></div>
            <span class="channel-name" title="${label}">${label}</span>
          </div>
          <span class="channel-time">${fmtTime(ch.seconds)}</span>
        </li>`;
    })
    .join('');
  return `<ul class="channel-list">${items}</ul>`;
}

async function panelHTML(channelDays: number): Promise<string> {
  const [week, channels] = await Promise.all([getRange(7), getChannelTotals(channelDays)]);
  const weekTotal = week.reduce((s, d) => s + d.totalSeconds, 0);
  const tab = (days: number) =>
    `<button class="tab-btn${days === channelDays ? ' active' : ''}" data-days="${days}">${days} days</button>`;

  return `
    <div class="header">
      <h2>Watch time</h2>
      <button class="close-btn" data-act="close" aria-label="Close">✕</button>
    </div>

    <div class="section">
      <div class="stat-row">
        <div class="stat-box">
          <div class="stat-value">${fmtTime(week[0].totalSeconds)}</div>
          <div class="stat-label">Today</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${fmtTime(weekTotal)}</div>
          <div class="stat-label">Last 7 days</div>
        </div>
      </div>
    </div>

    <div class="section">
      <p class="section-title">Per day</p>
      ${renderBarChart(week)}
    </div>

    <div class="section">
      <p class="section-title">Most-watched channels</p>
      <div class="tab-row">${tab(7)}${tab(30)}</div>
      ${renderChannelList(channels)}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

const feature: Feature = {
  id: 'watch-time',

  async setup(ctx) {
    const stopTracking = startTracking(ctx);
    /** Set on teardown so in-flight async work doesn't touch the page. */
    let stopped = false;

    // ---- Dashboard: floating button + panel ----
    const dash = document.createElement('div');
    const dashRoot = dash.attachShadow({ mode: 'open' });
    dashRoot.innerHTML = `
      <style>${DASHBOARD_CSS}</style>
      <button class="fab" aria-label="Watch time" title="Watch time">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
        </svg>
      </button>
      <div class="overlay" hidden><div class="panel"></div></div>
    `;
    const overlay = dashRoot.querySelector<HTMLElement>('.overlay')!;
    const panel = dashRoot.querySelector<HTMLElement>('.panel')!;
    document.body.appendChild(dash);

    let channelDays = 7;
    const renderPanel = async () => {
      panel.innerHTML = await panelHTML(channelDays);
    };
    const closePanel = () => {
      overlay.hidden = true;
    };

    // The open overlay covers the button, so a click on it only ever opens.
    dashRoot.querySelector('.fab')!.addEventListener('click', async () => {
      await renderPanel();
      overlay.hidden = false;
    });

    overlay.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === overlay || target.closest('[data-act="close"]')) {
        closePanel();
        return;
      }
      const days = target.closest<HTMLElement>('[data-days]')?.dataset.days;
      if (days) {
        channelDays = Number(days);
        void renderPanel();
      }
    });

    const offEsc = onKey('Escape', closePanel);

    // ---- Channel page: watched-time badge in the header ----
    const badge = document.createElement('div');
    const badgeRoot = badge.attachShadow({ mode: 'open' });
    /** True once the badge holds the current channel page's stat. */
    let badgeReady = false;

    // YouTube re-renders the header, so this also re-attaches a dropped badge.
    const mountBadge = () => {
      if (!badgeReady || badge.isConnected) return;
      for (const sel of HEADER_SELECTORS) {
        const anchor = document.querySelector(sel);
        if (anchor) {
          anchor.appendChild(badge);
          return;
        }
      }
    };

    const showChannelStat = async () => {
      badgeReady = false;
      badge.remove();
      const channelId = channelIdFromHref(location.pathname);
      if (!channelId) return;
      const seconds = await getChannelTotal(channelId);
      // Torn down, or navigated elsewhere while reading storage
      if (stopped || channelIdFromHref(location.pathname) !== channelId) return;
      badgeRoot.innerHTML = `
        <style>${BADGE_CSS}</style>
        <span class="badge">You've watched <strong>${fmtTime(seconds)}</strong> of this channel</span>
      `;
      badgeReady = true;
      mountBadge();
    };

    void showChannelStat();
    const offChange = ctx.observer.onChange(mountBadge);
    const offNav = ctx.navigation.onNavigate(() => void showChannelStat());

    // ---- Soft daily limit ----
    let limitMinutes = 0;
    let limitTimer: ReturnType<typeof setInterval> | undefined;
    /** Date (YYYY-MM-DD) the limit toast last fired. */
    let remindedOn = '';

    const checkLimit = async () => {
      const [today] = await getRange(1);
      if (stopped || limitMinutes <= 0 || today.date === remindedOn) return;
      if (today.totalSeconds < limitMinutes * 60) return;
      remindedOn = today.date;
      flashToast(`Daily limit reached: ${fmtTime(today.totalSeconds)} watched today`, 8000);
    };

    const applyLimit = ({ dailyLimitMinutes }: FeatureConfig['watch-time']) => {
      limitMinutes = dailyLimitMinutes;
      remindedOn = ''; // a new limit gets its own reminder
      clearInterval(limitTimer);
      if (limitMinutes > 0) {
        limitTimer = setInterval(checkLimit, LIMIT_CHECK_MS);
        void checkLimit();
      }
    };

    applyLimit(await getConfig('watch-time'));
    const offConfig = watchConfig('watch-time', applyLimit);

    return () => {
      stopped = true;
      stopTracking();
      offEsc();
      offChange();
      offNav();
      offConfig();
      clearInterval(limitTimer);
      dash.remove();
      badge.remove();
    };
  },
};

export default feature;
