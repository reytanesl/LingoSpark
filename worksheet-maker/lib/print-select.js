/**
 * "Tasks in the print / PDF" checklist: which worksheet task blocks go into print preview, the PDF
 * and Drive export. Works on the rendered sheet DOM (browser) and on jsdom (tests).
 */

/** Task blocks on the sheet in their current order: [{ id, snippet }]. */
export function printTaskList(root) {
  if (!root) return [];
  return [...root.querySelectorAll('.task-block[data-task]')].map((block) => {
    const head = block.querySelector('.task-head');
    const text = String(head?.textContent || '').replace(/^\s*\d+\.\s*/, '').replace(/\s+/g, ' ').trim();
    return { id: block.dataset.task, snippet: text.length > 70 ? `${text.slice(0, 68)}…` : text };
  });
}

/**
 * Hide (or, for a detached clone, remove) unticked task blocks and renumber the visible task heads 1, 2, 3…
 * @returns {() => void} restore function (undoes hiding + numbering on the live sheet)
 */
export function applyPrintSelection(root, excluded, { remove = false } = {}) {
  const undo = [];
  if (!root) return () => {};
  const off = excluded instanceof Set ? excluded : new Set(excluded || []);
  let n = 0;
  root.querySelectorAll('.task-block[data-task]').forEach((block) => {
    if (off.has(block.dataset.task)) {
      if (remove) block.remove();
      else {
        block.classList.add('print-excluded');
        undo.push(() => block.classList.remove('print-excluded'));
      }
      return;
    }
    block.querySelectorAll('.task-head > .n').forEach((el) => {
      const old = el.textContent;
      el.textContent = `${++n}.`;
      undo.push(() => { el.textContent = old; });
    });
  });
  return () => undo.reverse().forEach((f) => f());
}

/** Drop ids that are no longer on the sheet (e.g. a task was removed). */
export function prunePrintExclusions(excluded, root) {
  const ids = new Set(printTaskList(root).map((t) => t.id));
  for (const id of [...excluded]) if (!ids.has(id)) excluded.delete(id);
  return excluded;
}
