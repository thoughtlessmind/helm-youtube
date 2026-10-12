/**
 * video-notes — one private note per video. A "Notes" button in the watch-page action row (left
 * of Like; a blue dot when this video has a note) opens a card above the description: autosaves
 * as you type, "Add 6:52" inserts the current time at the caret, Close/Esc returns focus to the
 * button. The card follows the video on SPA navigation and picks up edits from other tabs.
 *
 * Storage: `local:ytpro:video-notes` → Record<videoId, string> (blank notes are deleted).
 */

import { storage } from '#imports';
import type { Feature } from '../lib/features';
import { fmtClock } from '../lib/format';
import { getVideoId, isWatchPage } from '../lib/yt/video';
import { createHost } from '../lib/yt/ui';
import { getVideo, onVideoEvent } from '../lib/yt/player';
import { actionCss, placeAboveDescription, placeInActionRow } from '../lib/yt/action-row';

type Notes = Record<string, string>;
const KEY = 'local:ytpro:video-notes' as const;
const DEBOUNCE_MS = 400;

const SVG = (d: string, extra = '') =>
  `<svg${extra} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`; // first duplicate attribute wins

// The dot punches a hole in the icon (mask) instead of a ring in the button's colour, so it reads
// the same on any theme and hover state.
const NOTE_ICON = SVG(
  `<mask id="hole"><rect width="24" height="24" fill="#fff"/><circle cx="21.6" cy="3.6" r="6"/></mask>
   <g><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5V14l-6 6H6.5A1.5 1.5 0 0 1 5 18.5z"/><path d="M13 20v-4.5a1.5 1.5 0 0 1 1.5-1.5H19"/><path d="M8.5 8.5h7M8.5 11.5h4"/></g>
   <circle class="dot" cx="21.6" cy="3.6" r="3.6" stroke="none"/>`,
  ' style="overflow:visible"',
);

const BTN_CSS = `${actionCss(96)}
.dot{fill:var(--yt-sys-color-baseline--call-to-action);display:none}
.has-note .dot{display:inline}
`;

const CARD_CSS = `
:host{display:block;flex:1 1 100%;margin:12px 12px 0 0}
section{padding:6px 8px 16px 12px;border-radius:12px;background:var(--yt-sys-color-baseline--additive-background)}
header{display:flex;align-items:center;gap:8px;height:36px}
.lock{width:16px;height:16px;flex:none;color:var(--yt-sys-color-baseline--text-secondary)}
h2{margin:0;font-size:14px;line-height:20px;font-weight:500}
.status{font-size:12px;line-height:18px;color:var(--yt-sys-color-baseline--text-secondary)}
.grow{flex:1}
textarea.ytp-input{display:block;height:65px;margin-top:4px;padding:2px 0 4px;resize:none;line-height:20px}
`;

// append, not innerHTML: a createHost root already holds its <style>.
const html = (s: string) => document.createRange().createContextualFragment(s);

const feature: Feature = {
  id: 'video-notes',

  setup(ctx) {
    let notes: Notes = {};
    let vid = getVideoId();
    let open = false;
    let dirty = false;
    let timer = 0;
    let writes = Promise.resolve();
    let offTime = () => {};

    const btnHost = createHost('ytp-notes', BTN_CSS);
    btnHost.root.append(html(`<button class="ytp-btn" type="button" aria-pressed="false" aria-label="Notes" title="Private note for this video">${NOTE_ICON}<span>Notes</span></button>`));
    const btn = btnHost.root.querySelector('button')!;
    const iconBody = btn.querySelector('g')!;

    const card = createHost('ytp-note-card', CARD_CSS);
    card.root.append(html(`
      <section aria-labelledby="title">
        <header>
          ${SVG('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', ' class="lock" stroke-width="2"')}
          <h2 id="title">Your private note</h2>
          <span class="status" role="status"></span>
          <div class="grow"></div>
          <button class="ytp-btn is-sm" type="button" data-stamp>${SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', ' stroke-width="1.9"')}<span></span></button>
          <button class="ytp-btn is-icon is-text" type="button" aria-label="Close note">${SVG('<path d="M6 6l12 12M18 6L6 18"/>')}</button>
        </header>
        <textarea class="ytp-input is-underline" aria-labelledby="title" placeholder="Write a note about this video…"></textarea>
      </section>`));
    const status = card.root.querySelector<HTMLElement>('.status')!;
    const stamp = card.root.querySelector<HTMLButtonElement>('[data-stamp]')!;
    const stampText = stamp.querySelector('span')!;
    const closeBtn = card.root.querySelector<HTMLButtonElement>('[aria-label="Close note"]')!;
    const ta = card.root.querySelector('textarea')!;

    const refresh = () => {
      const has = !!(open ? ta.value : (vid && notes[vid]) || '').trim();
      btn.classList.toggle('has-note', has);
      btn.setAttribute('aria-label', has ? 'Notes (has a note)' : 'Notes');
      if (has) iconBody.setAttribute('mask', 'url(#hole)');
      else iconBody.removeAttribute('mask');
    };

    /** Write the textarea to storage now. Writes are chained so two flushes can't race. */
    const flush = () => {
      clearTimeout(timer);
      if (!dirty || !vid) return;
      dirty = false;
      const id = vid;
      const text = ta.value.trim() ? ta.value : '';
      if (text) notes[id] = text;
      else delete notes[id];
      status.textContent = 'Saved just now';
      writes = writes.then(async () => {
        const cur = { ...(await storage.getItem<Notes>(KEY)) };
        if (text) cur[id] = text;
        else delete cur[id];
        await storage.setItem(KEY, cur);
      });
    };

    const onInput = () => {
      dirty = true;
      status.textContent = 'Saving…';
      refresh();
      clearTimeout(timer);
      timer = window.setTimeout(flush, DEBOUNCE_MS);
    };

    const showTime = () => {
      const t = fmtClock(getVideo()?.currentTime ?? 0);
      if (stampText.textContent === `Add ${t}`) return;
      stampText.textContent = `Add ${t}`;
      stamp.setAttribute('aria-label', `Add ${t} timestamp to note`);
    };
    const watchPlayer = () => {
      offTime();
      offTime = open ? onVideoEvent('timeupdate', showTime) : () => {};
      showTime();
    };

    const loadNote = () => {
      ta.value = (vid && notes[vid]) || '';
      status.textContent = '';
      refresh();
    };

    const show = () => {
      open = true;
      btn.setAttribute('aria-pressed', 'true');
      loadNote();
      watchPlayer();
      if (!placeAboveDescription(card.host)) return hide(true);
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    };

    const hide = (returnFocus: boolean) => {
      flush();
      open = false;
      watchPlayer();
      card.host.remove();
      btn.setAttribute('aria-pressed', 'false');
      refresh();
      if (returnFocus) btn.focus();
    };

    btn.addEventListener('click', () => (open ? hide(false) : show()));
    closeBtn.addEventListener('click', () => hide(true));
    card.root.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') hide(true);
    });
    ta.addEventListener('input', onInput);
    stamp.addEventListener('click', () => {
      const s = ta.selectionStart;
      const gap = s > 0 && !/\s/.test(ta.value[s - 1]) ? ' ' : '';
      ta.focus();
      ta.setRangeText(`${gap}[${fmtClock(getVideo()?.currentTime ?? 0)}] `, s, ta.selectionEnd, 'end');
      onInput();
    });

    const ensure = () => {
      if (!isWatchPage()) return;
      placeInActionRow(btnHost.host);
      if (open) placeAboveDescription(card.host);
    };

    const offWatch = storage.watch<Notes>(KEY, (v) => {
      notes = v ?? {};
      // Another tab edited this note while ours has nothing unsaved: show theirs.
      if (open && !dirty && vid && ta.value !== (notes[vid] ?? '')) ta.value = notes[vid] ?? '';
      refresh();
    });
    const offNav = ctx.navigation.onNavigate(() => {
      flush();
      vid = getVideoId();
      if (!vid) {
        if (open) hide(false);
      } else if (open) {
        loadNote();
        watchPlayer();
      }
      refresh();
      ensure();
    });
    const offChange = ctx.observer.onChange(ensure);

    void storage.getItem<Notes>(KEY).then((v) => {
      notes = v ?? {};
      if (open && !dirty) loadNote();
      refresh();
    });
    ensure();

    return () => {
      offChange();
      offNav();
      offWatch();
      if (open) hide(false);
      btnHost.host.remove();
    };
  },
};

export default feature;
