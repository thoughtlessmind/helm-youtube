import { storage } from '#imports';
import type { Feature } from '../lib/features';
import { getConfig, getFlags, watchConfig } from '../lib/settings';
import { createHost } from '../lib/yt/ui';
import { flashToast } from '../lib/yt/toast';
import { channelIdFromHref } from '../lib/yt/video';
import {
  startTracking,
  getLog,
  getChannelTotals,
  isoDate,
  LOG_KEY,
  type WatchLog,
} from '../lib/yt/watch-tracker';

/**
 * Watch time: tracking (lib/yt/watch-tracker.ts; stats live in the popup) plus two on-page bits:
 *   - Daily-limit banner at the top of the page content once today's total reaches
 *     `dailyLimitMinutes` (0 = off). Snooze 15 min / Dismiss for today, shared by every tab
 *     through `local:ytpro:watch-time-reminder`. Never pauses or blocks anything.
 *   - Channel pages: "• You've watched 6h 10m" in the header's meta line, with a tooltip.
 */

const REMINDER_KEY = 'local:ytpro:watch-time-reminder' as const;
const SPEED_KEY = 'local:ytpro:per-channel-speed' as const;
const SNOOZE_MS = 15 * 60_000;

interface Reminder {
  snoozeUntil?: number;
  /** YYYY-MM-DD the reminder was dismissed for. */
  dismissedOn?: string;
}

/** The page YouTube is showing (ytd-browse / ytd-watch-flexy / ytd-search …). */
const ACTIVE_PAGE = 'ytd-page-manager > :not([hidden])';
/** The channel header's meta line (@handle • subscribers • videos). Its rows clip overflow, so
 * the stat goes after the last row, not inside it. */
const CHANNEL_META =
  'ytd-browse[page-subtype="channels"]:not([hidden]) yt-page-header-renderer yt-content-metadata-view-model';

/** 7440 → "2h 04m", 7200 → "2h", 2700 → "45m". */
export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return !h ? `${m}m` : !m ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

function appendHtml(root: ShadowRoot, html: string): void {
  const t = document.createElement('template');
  t.innerHTML = html;
  root.append(t.content);
}

const CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;

const BANNER_CSS = `
/* YouTube's reset (div{margin:0}) beats :host, so spacing lives on the section. */
:host{align-self:stretch}
:host(.off) section{display:none}
:host(:focus){outline:none}
section{display:flex;align-items:center;gap:12px;height:54px;box-sizing:border-box;margin:12px 24px 0;padding:0 8px 0 16px;border-radius:12px;background:var(--yt-sys-color-baseline--additive-background)}
section>svg{width:24px;height:24px;flex:none}
p{flex:1;min-width:0;margin:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
b{font-weight:500}
.muted{color:var(--yt-sys-color-baseline--text-secondary)}
`;

const STAT_CSS = `
/* Same box as YouTube's meta rows (10px inline-flex, middle, 2px top) so they line up. */
:host{display:inline-flex;align-items:center;vertical-align:middle;margin-top:2px;font-size:10px;line-height:normal;color:var(--yt-sys-color-baseline--text-secondary)}
.dot,.stat{font-size:14px;line-height:20px}
.dot{margin:0 4px}
button{margin:0;padding:0;border:0;border-radius:2px;font:inherit;color:inherit;background:none;cursor:default;transition:color .1s}
.stat:hover button,button:focus-visible{color:var(--yt-sys-color-baseline--text-primary)}
.stat>.ytp-tooltip{top:calc(100% + 8px);bottom:auto;left:-8px;translate:none;font-weight:400}
.ytp-tooltip span{display:block}
.stat:hover>.ytp-tooltip,.stat:focus-within>.ytp-tooltip{opacity:1}
.stat.esc>.ytp-tooltip{opacity:0}
`;

const feature: Feature = {
  id: 'watch-time',

  async setup(ctx) {
    const stopTracking = startTracking(ctx);
    let stopped = false;

    // ---- Daily-limit banner ----
    const { host: banner, root: bannerRoot } = createHost('ytp-limit-banner', BANNER_CSS);
    banner.tabIndex = -1; // focus parks here when its own buttons hide it
    appendHtml(
      bannerRoot,
      `<section aria-label="Daily watch limit">${CLOCK}<p><b></b><span class="muted"></span></p>
        <button class="ytp-btn" data-act="snooze">Snooze 15 min</button>
        <button class="ytp-btn is-text" data-act="dismiss">Dismiss</button></section>`,
    );
    const [title, today] = bannerRoot.querySelectorAll('p > *');
    const snoozeBtn = bannerRoot.querySelector<HTMLButtonElement>('[data-act="snooze"]')!;

    let limitMinutes = (await getConfig('watch-time')).dailyLimitMinutes;
    let todaySeconds = 0;
    let reminder: Reminder = {};
    let snoozeTimer: ReturnType<typeof setTimeout> | undefined;

    const renderBanner = () => {
      clearTimeout(snoozeTimer);
      const snoozed = (reminder.snoozeUntil ?? 0) > Date.now();
      if (snoozed) snoozeTimer = setTimeout(renderBanner, reminder.snoozeUntil! - Date.now() + 500);
      const due =
        !stopped &&
        limitMinutes > 0 &&
        todaySeconds >= limitMinutes * 60 &&
        !snoozed &&
        reminder.dismissedOn !== isoDate();
      if (!due) {
        banner.classList.add('off');
        // Keep it (empty) while it holds focus parked by Snooze/Dismiss.
        if (document.activeElement !== banner) banner.remove();
        return;
      }
      title.textContent = `You've reached your ${fmtDuration(limitMinutes * 60)} daily limit`;
      today.textContent = ` · ${fmtDuration(todaySeconds)} watched today`;
      banner.classList.remove('off');
      const page = document.querySelector(ACTIVE_PAGE);
      if (page && page.firstElementChild !== banner) page.prepend(banner);
    };

    const setReminder = (next: Reminder) => {
      reminder = next;
      renderBanner();
      void storage.setItem(REMINDER_KEY, next);
    };

    bannerRoot.addEventListener('click', (e) => {
      const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (!act) return;
      const prev = reminder;
      const undo = () => {
        setReminder(prev);
        if (banner.isConnected) snoozeBtn.focus();
        flashToast('Daily limit reminder restored');
      };
      banner.focus({ preventScroll: true });
      if (act === 'snooze') {
        setReminder({ ...prev, snoozeUntil: Date.now() + SNOOZE_MS });
        flashToast('Reminder snoozed for 15 minutes', { action: { label: 'Undo', onClick: undo } });
      } else {
        setReminder({ ...prev, dismissedOn: isoDate() });
        flashToast('Reminder hidden for today', { action: { label: 'Undo', onClick: undo } });
      }
    });

    const todayOf = (log: WatchLog | null) => log?.[isoDate()]?.totalSeconds ?? 0;
    todaySeconds = todayOf(await getLog());
    reminder = (await storage.getItem<Reminder>(REMINDER_KEY)) ?? {};
    renderBanner();

    // Every tab's tracker flush lands here — no DOM polling.
    const offLog = storage.watch<WatchLog>(LOG_KEY, (log) => {
      todaySeconds = todayOf(log);
      renderBanner();
    });
    const offReminder = storage.watch<Reminder>(REMINDER_KEY, (r) => {
      reminder = r ?? {};
      renderBanner();
    });
    const offConfig = watchConfig('watch-time', (c) => {
      limitMinutes = c.dailyLimitMinutes;
      renderBanner();
    });

    // ---- Channel page: "• You've watched 6h 10m" ----
    const { host: stat, root: statRoot } = createHost('ytp-channel-watched', STAT_CSS);
    appendHtml(
      statRoot,
      `<span class="dot" aria-hidden="true">•</span><span class="stat"><button aria-describedby="tip"></button><span class="ytp-tooltip" id="tip" role="tooltip"></span></span>`,
    );
    const statWrap = statRoot.querySelector<HTMLElement>('.stat')!;
    const statBtn = statRoot.querySelector('button')!;
    const tip = statRoot.querySelector<HTMLElement>('.ytp-tooltip')!;
    statBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') statWrap.classList.add('esc');
    });
    const tipReset = () => statWrap.classList.remove('esc');
    statBtn.addEventListener('blur', tipReset);
    statWrap.addEventListener('mouseleave', tipReset);

    /** Pathname the stat was computed for; '' = nothing to show here. */
    let statPath = '';

    const placeStat = () => {
      if (!statPath) return;
      const row = document.querySelector(CHANNEL_META);
      if (row && row.lastElementChild !== stat) row.append(stat);
    };

    // ponytail: keyed by the URL's channel id (@handle or UC…), which is what the tracker
    // stores for almost every channel; a /channel/UC… visit to a @handle channel shows nothing.
    const showStat = async () => {
      statPath = '';
      stat.remove();
      const path = location.pathname;
      const id = channelIdFromHref(path);
      if (!id) return;
      const [totals, log, speeds, flags, speed] = await Promise.all([
        getChannelTotals(),
        getLog(),
        storage.getItem<Record<string, number>>(SPEED_KEY),
        getFlags(),
        getConfig('playback-speed'),
      ]);
      const all = totals[id]?.seconds ?? 0;
      if (stopped || location.pathname !== path || all < 60) return;
      let week = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        week += log[isoDate(d)]?.perChannel[id]?.seconds ?? 0;
      }
      const rate = flags['playback-speed'] && speed.perChannel ? speeds?.[id] : undefined;
      statBtn.textContent = `You've watched ${fmtDuration(all)}`;
      tip.replaceChildren(
        ...[
          `${fmtDuration(all)} all time`,
          `${fmtDuration(week)} in the last 7 days`,
          ...(rate ? [`Plays at ${rate}× on this channel`] : []),
        ].map((line) => Object.assign(document.createElement('span'), { textContent: line })),
      );
      statPath = path;
      placeStat();
    };

    void showStat();

    const offNav = ctx.navigation.onNavigate(() => {
      renderBanner();
      void showStat();
    });
    // YouTube re-renders headers/pages: put our bits back.
    const offChange = ctx.observer.onChange(() => {
      if (!banner.classList.contains('off')) renderBanner();
      placeStat();
    });

    return () => {
      stopped = true;
      stopTracking();
      offLog();
      offReminder();
      offConfig();
      offNav();
      offChange();
      clearTimeout(snoozeTimer);
      banner.remove();
      stat.remove();
    };
  },
};

export default feature;
