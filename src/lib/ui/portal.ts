/** Render the node as a direct child of <body>, immune to ancestor
 *  transforms/filters that break position:fixed (bottom sheets, dialogs).
 *  Teardown is defensive: on unmount Svelte may detach siblings first,
 *  in which case reinsertion is pointless and the node just goes away. */
export function portal(node: HTMLElement): { destroy(): void } {
  const parent: Node | null = node.parentNode;
  const next: Node | null = node.nextSibling;
  document.body.appendChild(node);
  return {
    destroy() {
      try {
        if (parent && next && next.parentNode === parent) {
          parent.insertBefore(node, next);
          return;
        }
      } catch {
        /* fall through to removal */
      }
      node.remove();
    }
  };
}
