import type { Feature } from '../lib/features';
import { fetchJson } from '../lib/fetch-json';
import { getConfig, watchConfig, type FeatureConfig } from '../lib/settings';
import { createHost } from '../lib/yt/ui';
import { fmtClock } from '../lib/format';
import {
  CLOSE_ICON,
  PLAYER_CSS,
  getVideo,
  isAdShowing,
  mountInPlayer,
  onVideoEvent,
  playerVideoId,
  tooltip,
} from '../lib/yt/player';

/**
 * SponsorBlock auto-skip (board WatchPlayer). Segments of all five categories are fetched once per
 * video through the SW (content-script fetches are cross-origin blocked); the categories enabled
 * in config are drawn on the progress bar and skipped when playback enters them — once per
 * segment per play-through. The in-player toast's Undo seeks back to the segment start and leaves
 * that segment alone. SponsorBlock 404 = no segments, silently.
 */

type Category = keyof FeatureConfig['sponsorblock'];
interface Segment {
  category: Category;
  segment: [number, number];
  UUID: string;
}

const API = 'https://sponsor.ajay.app/api/skipSegments';
// Board colours (sponsor, self-promo, outro) + SponsorBlock's own for the rest; the player is always dark.
const CATS: Record<Category, [label: string, color: string]> = {
  sponsor: ['Sponsor', '#00d400'],
  selfpromo: ['Self-promotion', '#ffff00'],
  interaction: ['Interaction reminder', '#cc00ff'],
  intro: ['Intro', '#00ffff'],
  outro: ['Outro', '#3a7bfd'],
};
const CATEGORIES = Object.keys(CATS) as Category[];
const NOTE = 'skipped automatically';

// Inside .ytp-progress-bar: above the played/markers layers (z 40), below the scrubber (z 43).
const BAR_CSS = `
:host{position:absolute;inset:0;z-index:42;pointer-events:none}
:host-context(.ad-showing){display:none}
.seg{position:absolute;top:-6px;height:18px;pointer-events:auto;cursor:pointer}
.seg:focus-visible{outline-offset:0}
.bar{position:absolute;left:0;right:0;top:7px;height:4px;transition:transform .1s}
.seg:hover .bar,.seg:focus-visible .bar,:host-context(.ytp-progress-bar-container:hover) .bar{transform:scaleY(1.5)}
.dot{width:8px;height:8px;border-radius:50%;flex:none}
`;

// In-player, bottom-left above the controls; visible while the controls are hidden too.
const TOAST_CSS = `
:host{position:absolute;left:29px;bottom:98px;z-index:60}
.toast{display:flex;align-items:center;gap:4px;height:36px;box-sizing:border-box;padding:0 2px 0 14px;border-radius:18px;background:rgba(28,28,28,.9);animation:tin .18s ease-out}
.dot{width:9px;height:9px;border-radius:50%;margin-right:5px;flex:none}
.text{white-space:nowrap;padding-right:2px}
.undo{color:#3ea6ff;font-weight:500;padding:7px 11px;border-radius:18px;transition:background-color .1s}
.undo:hover{background-color:rgba(255,255,255,.1)}
@keyframes tin{from{opacity:0;transform:translateY(7px)}}
`;

function dot(color: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'dot';
  el.style.background = color;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

const feature: Feature = {

  async setup(ctx) {
    let cfg = await getConfig('sponsorblock');
    let videoId: string | null = null; // whose segments are loaded (or loading)
    let segs: Segment[] = [];
    const done = new Set<string>(); // UUIDs skipped or undone in this play-through
    let toastTimer = 0;

    const bar = createHost('ytp-sb-bar', PLAYER_CSS + BAR_CSS);
    const toast = createHost('ytp-sb-toast', PLAYER_CSS + TOAST_CSS);
    const region = document.createElement('div');
    region.setAttribute('role', 'status');
    toast.root.append(region);
    // Clicks on the toast mustn't reach the player (click = play/pause, double-click = fullscreen).
    for (const t of ['click', 'dblclick', 'mousedown', 'pointerdown']) {
      toast.host.addEventListener(t, (e) => e.stopPropagation());
    }

    const enabled = () => segs.filter((s) => cfg[s.category]);

    const render = () => {
      bar.root.querySelectorAll('.seg, .tt').forEach((n) => n.remove());
      const d = getVideo()?.duration;
      if (!d || !Number.isFinite(d)) return;
      // ponytail: maps time linearly across the bar; YouTube's 4px chapter gaps shift it a few px.
      for (const s of enabled()) {
        const [a, b] = s.segment;
        const [label, color] = CATS[s.category];
        const el = document.createElement('span');
        el.className = 'seg';
        el.tabIndex = 0;
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', `${label} segment, ${fmtClock(a)} to ${fmtClock(b)}, ${NOTE}`);
        el.style.left = `${(a / d) * 100}%`;
        el.style.width = `${((b - a) / d) * 100}%`;
        const fill = document.createElement('span');
        fill.className = 'bar';
        fill.style.background = color;
        el.append(fill);
        bar.root.append(el);
        tooltip(el, () => [dot(color), `${label} · ${NOTE}`]);
      }
    };

    const hideToast = () => {
      clearTimeout(toastTimer);
      region.replaceChildren();
    };

    const showToast = (s: Segment, undone: boolean) => {
      clearTimeout(toastTimer);
      const [a, b] = s.segment;
      const [name, color] = CATS[s.category];
      const label = name.toLowerCase();
      const el = document.createElement('div');
      el.className = 'toast';
      const text = document.createElement('span');
      text.className = 'text';
      text.textContent = undone ? `Back at the ${label} segment` : `Skipped ${label} (${fmtClock(b - a)})`;
      el.append(dot(color), text);
      if (!undone) {
        const undo = document.createElement('button');
        undo.className = 'undo';
        undo.textContent = 'Undo';
        undo.addEventListener('click', () => {
          const v = getVideo();
          if (v) v.currentTime = a; // `done` already holds this UUID → no re-skip
          showToast(s, true);
          region.querySelector<HTMLElement>('[aria-label="Dismiss"]')?.focus();
        });
        el.append(undo);
      }
      const close = document.createElement('button');
      close.className = 'pb sm';
      close.setAttribute('aria-label', 'Dismiss');
      close.innerHTML = CLOSE_ICON;
      close.addEventListener('click', hideToast);
      el.append(close);
      // Don't time out under the pointer or keyboard focus.
      const arm = () => {
        clearTimeout(toastTimer);
        toastTimer = window.setTimeout(hideToast, undone ? 3000 : 5000);
      };
      el.addEventListener('pointerenter', () => clearTimeout(toastTimer));
      el.addEventListener('pointerleave', arm);
      el.addEventListener('focusin', () => clearTimeout(toastTimer));
      el.addEventListener('focusout', arm);
      region.replaceChildren(el);
      arm();
    };

    const onTime = (v: HTMLVideoElement) => {
      if (playerVideoId() !== videoId) return void load(); // a navigation the events didn't catch
      if (!segs.length || isAdShowing()) return;
      const t = v.currentTime;
      const s = enabled().find((s) => !done.has(s.UUID) && t >= s.segment[0] && t < s.segment[1] - 0.5);
      if (!s) return;
      done.add(s.UUID);
      v.currentTime = s.segment[1];
      showToast(s, false);
    };

    const load = async () => {
      const id = playerVideoId();
      if (!id || id === videoId) return;
      videoId = id;
      segs = [];
      done.clear();
      hideToast();
      render();
      const cats = encodeURIComponent(JSON.stringify(CATEGORIES));
      let data: Segment[] | null;
      try {
        data = await fetchJson<Segment[]>(`${API}?videoID=${encodeURIComponent(id)}&categories=${cats}`);
      } catch {
        return; // extension context gone
      }
      if (videoId !== id || !Array.isArray(data)) return; // navigated meanwhile, or 404 = none
      segs = data.filter((s) => CATEGORIES.includes(s.category)); // actionTypes defaults to [skip]
      render();
    };

    const offs = [
      mountInPlayer(ctx, bar.host, 'progress'),
      mountInPlayer(ctx, toast.host, 'overlay'),
      onVideoEvent('timeupdate', onTime),
      onVideoEvent('loadedmetadata', () => void load()),
      onVideoEvent('durationchange', render),
      onVideoEvent('ended', () => done.clear()),
      ctx.navigation.onNavigate(() => void load()),
      watchConfig('sponsorblock', (next) => {
        cfg = next;
        render();
      }),
    ];
    void load();

    return () => {
      videoId = null;
      clearTimeout(toastTimer);
      offs.forEach((off) => off());
    };
  },
};

export default feature;
