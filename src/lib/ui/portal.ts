/** Render the node as a direct child of <body>, immune to ancestor
 *  transforms/filters that break position:fixed (bottom sheets, dialogs).
 *  Teardown only removes: it must never reinsert the node back into its
 *  original parent. On `{#if}` close Svelte tears the branch down while
 *  the parent anchors are still intact, so reinserting would resurrect
 *  the sheet as a dead, static zombie in the live tree (visible but
 *  responding to nothing). `remove()` on an already-detached node is a
 *  harmless no-op, which also covers full page unmounts. */
export function portal(node: HTMLElement): { destroy(): void } {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    }
  };
}
