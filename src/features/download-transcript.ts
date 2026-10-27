/**
 * download-transcript — "Transcript" button in the watch-page action row (left of Like) with a
 * menu: Download .txt, Download .srt (subtitles), Copy transcript. The transcript comes from
 * YouTube's own panel (lib/yt/transcript.ts). Videos without one get a disabled menu that says so.
 */

import type { Feature } from '../lib/features';
import { fmtClock } from '../lib/format';
import { saveFile } from '../lib/download';
import { flashToast } from '../lib/yt/toast';
import { getVideoId, isWatchPage } from '../lib/yt/video';
import { createHost, icon, menuKeys, openPopover, pageTooltip } from '../lib/yt/ui';
import { actionCss, placeInActionRow } from '../lib/yt/action-row';
import { watchTitle } from '../lib/yt/player-bridge';
import { fetchTranscript, hasTranscript, type TranscriptSegment } from '../lib/yt/transcript';

/** A text page with a down arrow: the transcript's text, not the video. */
const TRANSCRIPT = icon('<path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7z"/><path d="M14 3v4h4"/><path d="M9 9h2.5M9 12h6"/><path d="M12 14.5v4M10 16.5l2 2 2-2"/>');
const TXT = icon('<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3H14l4 4v12.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 15.5h6"/>');
const SRT = icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 12.5h3M12.5 12.5h4.5M7 15.5h6M15.5 15.5h1.5"/>');
const COPY = icon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>');

const CSS = `${actionCss(122)}
.ytp-btn[aria-busy="true"]{cursor:progress}
.ytp-menu{min-width:264px}
.ytp-menu p{margin:0;padding:2px 16px 8px;font-size:12px;line-height:18px;color:var(--yt-sys-color-baseline--text-secondary)}
`;

const srtTime = (s: number) => {
  const ms = Math.round(s * 1000);
  const p = (n: number, d = 2) => String(n).padStart(d, '0');
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

const toTxt = (segs: TranscriptSegment[]) => segs.map((s) => `${fmtClock(s.start)}  ${s.text}`).join('\n');

/** SubRip: each cue ends where the next starts; the last one gets 3 s. */
const toSrt = (segs: TranscriptSegment[]) =>
  segs
    .map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(segs[i + 1]?.start ?? s.start + 3)}\n${s.text}`)
    .join('\n\n') + '\n';

const fileBase = () => watchTitle().replace(/[/\\:*?"<>|]+/g, '-') || getVideoId() || 'transcript';

const feature: Feature = {

  setup(ctx) {
    const { host, root } = createHost('ytp-transcript', CSS, `
      <button class="ytp-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Transcript">${TRANSCRIPT}<span>Transcript</span></button>
      <div class="ytp-menu" popover>
        <p id="state" hidden>No transcript for this video</p>
        <div role="menu" aria-label="Transcript">
          <button class="ytp-menu-item" role="menuitem" data-act="txt">${TXT}Download .txt</button>
          <button class="ytp-menu-item" role="menuitem" data-act="srt">${SRT}Download .srt (subtitles)</button>
          <button class="ytp-menu-item" role="menuitem" data-act="copy">${COPY}Copy transcript</button>
        </div>
      </div>`);
    const btn = root.querySelector('button')!;
    pageTooltip(btn, 'Download or copy transcript');
    const panel = root.querySelector<HTMLElement>('.ytp-menu')!;
    const menu = panel.querySelector<HTMLElement>('[role=menu]')!;
    const state = root.getElementById('state')!;
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role=menuitem]')];
    let close = () => {};

    const open = () => {
      const none = !hasTranscript();
      state.hidden = !none;
      for (const it of items) it.setAttribute('aria-disabled', String(none));
      if (none) menu.setAttribute('aria-describedby', 'state');
      else menu.removeAttribute('aria-describedby');
      close = openPopover(btn, panel, { align: 'end' });
    };

    const run = async (act: string) => {
      if (btn.ariaBusy) return;
      btn.ariaBusy = 'true';
      const segs = await fetchTranscript(ctx.observer);
      btn.ariaBusy = null;
      if (!segs) return flashToast('No transcript for this video');
      if (act === 'copy') {
        try {
          await navigator.clipboard.writeText(toTxt(segs));
          flashToast('Transcript copied');
        } catch {
          flashToast('Couldn’t copy the transcript');
        }
        return;
      }
      const text = act === 'srt' ? toSrt(segs) : toTxt(segs);
      saveFile(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${fileBase()}.${act}`);
      flashToast(`Transcript saved as .${act}`);
    };

    btn.addEventListener('click', open);
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault(); // stops YouTube's volume keys via createHost's guard
      if (btn.getAttribute('aria-expanded') !== 'true') open();
    });
    menu.addEventListener('click', (e) => {
      const it = (e.target as Element).closest<HTMLElement>('[data-act]');
      if (!it || it.getAttribute('aria-disabled') === 'true') return;
      close();
      void run(it.dataset.act!);
    });
    const offKeys = menuKeys(menu);

    const ensure = () => {
      if (isWatchPage()) placeInActionRow(host);
    };
    const offChange = ctx.observer.onChange(ensure);
    const offNav = ctx.navigation.onNavigate(() => {
      close();
      ensure();
    });
    ensure();

    return () => {
      offChange();
      offNav();
      offKeys();
      close();
      host.remove();
    };
  },
};

export default feature;
