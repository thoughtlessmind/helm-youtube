import { tick } from 'svelte';

export { moveItem } from './queue';

/**
 * Drag + keyboard reordering for a list whose rows have string ids. The component renders
 * `dragId` (dragging style) and `overId`/`after` (drop line), spreads the drag handlers on each
 * row and `key` on each row's grip (`data-grip={id}`): ArrowUp/Down move one step and focus
 * stays on the grip. `move(id, to)` applies a move to final index `to` (and announces it).
 * Works in the popup and inside shadow roots: the grip is looked up under `root()`.
 */
export class Reorder {
  dragId = $state<string | null>(null);
  overId = $state<string | null>(null);
  after = $state(false);

  opts: {
    ids: () => string[];
    move: (id: string, to: number) => void;
    root: () => ParentNode | null | undefined;
  };

  constructor(opts: Reorder['opts']) {
    this.opts = opts;
  }

  key = async (e: KeyboardEvent, id: string) => {
    const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    const ids = this.opts.ids();
    const to = ids.indexOf(id) + d;
    if (to < 0 || to >= ids.length) return;
    this.opts.move(id, to);
    await tick();
    this.opts.root()?.querySelector<HTMLElement>(`[data-grip="${CSS.escape(id)}"]`)?.focus();
  };

  start = (e: DragEvent, id: string) => {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    }
    this.dragId = id;
  };

  over = (e: DragEvent, id: string) => {
    if (!this.dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.overId = id;
    this.after = e.clientY > box.top + box.height / 2;
  };

  drop = (e: DragEvent, id: string) => {
    e.preventDefault();
    const ids = this.opts.ids();
    const from = this.dragId ? ids.indexOf(this.dragId) : -1;
    let to = ids.indexOf(id) + (this.after ? 1 : 0);
    if (from < to) to -= 1;
    if (from >= 0 && to !== from) this.opts.move(this.dragId!, to);
    this.end();
  };

  end = () => {
    this.dragId = this.overId = null;
  };
}
