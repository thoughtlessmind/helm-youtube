import type { Feature } from '../lib/features';
import {
  startTracking,
  stopTracking,
  getToday,
  getRange,
  getChannelTotals,
  type DayStats,
  type ChannelStats,
} from '../lib/yt/watch-tracker';

/**
 * watch-analytics.ts
 *
 * A floating dashboard that shows:
 *   - Total watch time today and this week
 *   - A 7-day bar chart (pure CSS/divs, no chart library)
 *   - Most-watched channels (last 7 and 30 days) with per-channel time
 *
 * Affordance: a small floating "📊" button (bottom-right, above the scroll).
 * Clicking it opens a shadow-DOM panel. Clicking outside or pressing Esc closes it.
 *
 * No FeatureConfig — always-on display preferences are hardcoded.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format seconds as "Xh Ym" or "Ym" or "<1m". */
function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return '<1m';
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const PANEL_CSS = `
  :host { all: initial; font-family: 'YouTube Sans', Roboto, sans-serif; }

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

  .panel {
    background: #0f0f0f;
    color: #fff;
    border-radius: 12px;
    width: 360px;
    max-height: calc(100vh - 96px);
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    padding: 0;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid #272727;
    position: sticky;
    top: 0;
    background: #0f0f0f;
    z-index: 1;
  }

  .header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #fff;
  }

  .close-btn {
    background: none;
    border: none;
    color: #aaa;
    cursor: pointer;
    font-size: 20px;
    padding: 4px 8px;
    border-radius: 4px;
    line-height: 1;
  }
  .close-btn:hover { color: #fff; background: #272727; }

  .section {
    padding: 16px 20px;
    border-bottom: 1px solid #1a1a1a;
  }
  .section:last-child { border-bottom: none; }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #aaa;
    margin: 0 0 12px;
  }

  .stat-row {
    display: flex;
    gap: 12px;
  }

  .stat-box {
    flex: 1;
    background: #1a1a1a;
    border-radius: 8px;
    padding: 12px;
    text-align: center;
  }

  .stat-value {
    font-size: 22px;
    font-weight: 700;
    color: #ff0000;
  }

  .stat-label {
    font-size: 11px;
    color: #aaa;
    margin-top: 4px;
  }

  /* Bar chart */
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
    gap: 4px;
    height: 100%;
    justify-content: flex-end;
  }

  .bar {
    width: 100%;
    background: #ff0000;
    border-radius: 3px 3px 0 0;
    min-height: 2px;
    transition: height 0.2s ease;
  }

  .bar-col.today .bar { background: #cc0000; }

  .bar-day {
    font-size: 9px;
    color: #aaa;
    text-align: center;
    white-space: nowrap;
  }

  /* Channel list */
  .channel-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .channel-item {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .channel-rank {
    font-size: 12px;
    color: #aaa;
    width: 18px;
    text-align: right;
    flex-shrink: 0;
  }

  .channel-bar-wrap {
    flex: 1;
    background: #1a1a1a;
    border-radius: 4px;
    height: 20px;
    position: relative;
    overflow: hidden;
  }

  .channel-bar-fill {
    height: 100%;
    background: #272727;
    border-radius: 4px;
    position: absolute;
    left: 0; top: 0;
  }

  .channel-name {
    position: relative;
    font-size: 12px;
    color: #fff;
    padding: 0 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
    line-height: 20px;
  }

  .channel-time {
    font-size: 12px;
    color: #aaa;
    flex-shrink: 0;
  }

  .tab-row {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .tab-btn {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 12px;
    border: 1px solid #444;
    background: none;
    color: #aaa;
    cursor: pointer;
  }
  .tab-btn.active { background: #ff0000; border-color: #ff0000; color: #fff; }

  .empty {
    font-size: 13px;
    color: #555;
    text-align: center;
    padding: 8px 0;
  }
`;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function renderBarChart(days: DayStats[]): string {
  // days[0] = today, days[6] = 6 days ago
  const reversed = [...days].reverse(); // oldest first
  const maxSec = Math.max(...reversed.map((d) => d.totalSeconds), 1);

  const bars = reversed
    .map((d, i) => {
      const pct = Math.round((d.totalSeconds / maxSec) * 100);
      const height = Math.max(pct, 2);
      const isToday = i === reversed.length - 1;
      const dow = DAY_LABELS[new Date(d.date + 'T12:00:00').getDay()];
      return `
        <div class="bar-col${isToday ? ' today' : ''}">
          <div class="bar" style="height:${height}%" title="${fmtTime(d.totalSeconds)}"></div>
          <div class="bar-day">${escHtml(dow)}</div>
        </div>`;
    })
    .join('');

  return `<div class="chart">${bars}</div>`;
}

function renderChannelList(channels: ChannelStats[]): string {
  if (channels.length === 0) return `<div class="empty">No data yet</div>`;
  const maxSec = channels[0].seconds;
  const items = channels
    .slice(0, 10)
    .map((ch, i) => {
      const pct = Math.round((ch.seconds / maxSec) * 100);
      return `
        <li class="channel-item">
          <span class="channel-rank">${i + 1}</span>
          <div class="channel-bar-wrap">
            <div class="channel-bar-fill" style="width:${pct}%"></div>
            <span class="channel-name" title="${escHtml(ch.name)}">${escHtml(ch.name || ch.channelId)}</span>
          </div>
          <span class="channel-time">${fmtTime(ch.seconds)}</span>
        </li>`;
    })
    .join('');
  return `<ul class="channel-list">${items}</ul>`;
}

async function buildPanelHTML(channelTab: '7' | '30'): Promise<string> {
  const [today, week, channels] = await Promise.all([
    getToday(),
    getRange(7),
    getChannelTotals(channelTab === '7' ? 7 : 30),
  ]);

  const weekTotal = week.reduce((s, d) => s + d.totalSeconds, 0);

  return `
    <div class="header">
      <h2>Watch Analytics</h2>
      <button class="close-btn" data-act="close" aria-label="Close">✕</button>
    </div>

    <div class="section">
      <p class="section-title">Overview</p>
      <div class="stat-row">
        <div class="stat-box">
          <div class="stat-value">${fmtTime(today.totalSeconds)}</div>
          <div class="stat-label">Today</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${fmtTime(weekTotal)}</div>
          <div class="stat-label">This week</div>
        </div>
      </div>
    </div>

    <div class="section">
      <p class="section-title">Last 7 days</p>
      ${renderBarChart(week)}
    </div>

    <div class="section">
      <p class="section-title">Most-watched channels</p>
      <div class="tab-row">
        <button class="tab-btn${channelTab === '7' ? ' active' : ''}" data-tab="7">7 days</button>
        <button class="tab-btn${channelTab === '30' ? ' active' : ''}" data-tab="30">30 days</button>
      </div>
      ${renderChannelList(channels)}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

/** Ids for host elements so teardown can find and remove them. */
const BUTTON_HOST_ID = 'yt-pro-analytics-btn-host';
const PANEL_HOST_ID = 'yt-pro-analytics-panel-host';

const feature: Feature = {
  id: 'watch-analytics',

  async setup(ctx) {
    startTracking(ctx);

    // Track panel open state and channel tab selection
    let panelOpen = false;
    let channelTab: '7' | '30' = '7';

    // ---- Shadow-DOM floating button ----
    const btnHost = document.createElement('div');
    btnHost.id = BUTTON_HOST_ID;
    Object.assign(btnHost.style, {
      position: 'fixed',
      bottom: '260px',
      right: '16px',
      zIndex: '2147483645',
    } as Partial<CSSStyleDeclaration>);
    const btnShadow = btnHost.attachShadow({ mode: 'open' });

    const btnStyle = document.createElement('style');
    btnStyle.textContent = `
      button {
        width: 44px; height: 44px;
        border-radius: 50%;
        background: #ff0000;
        border: none;
        color: #fff;
        font-size: 20px;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 12px rgba(0,0,0,0.4);
        transition: transform 0.15s, background 0.15s;
      }
      button:hover { transform: scale(1.1); background: #cc0000; }
    `;
    btnShadow.appendChild(btnStyle);

    const fab = document.createElement('button');
    fab.setAttribute('aria-label', 'YouTube Pro Watch Analytics');
    fab.setAttribute('title', 'Watch Analytics');
    fab.innerHTML = `<svg viewBox="0 0 24 24" fill="white" width="20" height="20">
      <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
    </svg>`;
    btnShadow.appendChild(fab);
    document.body.appendChild(btnHost);

    // ---- Shadow-DOM panel overlay ----
    const panelHost = document.createElement('div');
    panelHost.id = PANEL_HOST_ID;
    const panelShadow = panelHost.attachShadow({ mode: 'open' });

    const panelStyleEl = document.createElement('style');
    panelStyleEl.textContent = PANEL_CSS;
    panelShadow.appendChild(panelStyleEl);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.style.display = 'none';
    panelShadow.appendChild(overlay);

    const panelEl = document.createElement('div');
    panelEl.className = 'panel';
    overlay.appendChild(panelEl);
    document.body.appendChild(panelHost);

    // ---- Panel logic ----
    const openPanel = async () => {
      panelOpen = true;
      overlay.style.display = 'flex';
      panelEl.innerHTML = '<div style="padding:40px;text-align:center;color:#aaa">Loading…</div>';
      panelEl.innerHTML = await buildPanelHTML(channelTab);
      wirePanel();
    };

    const closePanel = () => {
      panelOpen = false;
      overlay.style.display = 'none';
    };

    const wirePanel = () => {
      panelEl.querySelector('[data-act="close"]')?.addEventListener('click', closePanel);
      panelEl.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          channelTab = btn.dataset.tab as '7' | '30';
          panelEl.innerHTML = await buildPanelHTML(channelTab);
          wirePanel();
        });
      });
    };

    fab.addEventListener('click', () => {
      if (panelOpen) closePanel();
      else void openPanel();
    });

    // Close on overlay click (outside panel)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePanel();
    });

    // Close on Escape
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panelOpen) closePanel();
    };
    document.addEventListener('keydown', onKeyDown);

    return async () => {
      closePanel();
      document.removeEventListener('keydown', onKeyDown);
      btnHost.remove();
      panelHost.remove();
      await stopTracking();
    };
  },
};

export default feature;
