<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from '$lib/i18n';
  import { theme } from '$lib/theme/theme';
  import { notifications, timeAgo, weekdayName, type NoticeStrings } from '$lib/notifications';

  export let settings = true;
  export let help = true;

  const order = ['light', 'dark', 'auto'] as const;
  function cycleTheme() {
    const next = order[(order.indexOf($theme) + 1) % order.length];
    theme.set(next);
  }

  const themeIcon = () => ($theme === 'light' ? 'sun' : $theme === 'dark' ? 'moon' : 'auto');

  let panelOpen = false;
  let panel: HTMLDivElement | null = null;

  function strings(): NoticeStrings {
    return {
      actionLabel: (a: string) =>
        ($t.studentDetail.actionLabel as Record<string, string>)[a] ?? a,
      resourceLabel: (r: string) =>
        ($t.studentDetail.resourceLabel as Record<string, string>)[r] ?? r,
      riskTitle: (name) => $t.notifications.riskTitle(name),
      riskBody: (missed, sessions, pct) => $t.notifications.riskBody(missed, sessions, pct),
      alertTitle: (name) => $t.notifications.alertTitle(name),
      alertBody: (reason) => $t.notifications.alertBody(reason),
      deniedTitle: $t.notifications.deniedTitle,
      deniedBody: (action, resource, status) =>
        $t.notifications.deniedBody(action, resource, status),
      bareSubjectsTitle: $t.notifications.bareSubjectsTitle,
      bareSubjectsBody: (count, names) => $t.notifications.bareSubjectsBody(count, names),
      scheduleChangedTitle: $t.notifications.scheduleChangedTitle,
      scheduleChangedBody: (count, day) => $t.notifications.scheduleChangedBody(count, day),
      dayName: (w) => weekdayName(w, $t.admin.scheduleWeekdays, $t.admin.scheduleWeekend)
    };
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    if (panelOpen) {
      notifications.markSeen();
      void notifications.refresh();
    }
  }

  function onWindowClick(e: MouseEvent) {
    const target = e.target as Node;
    if (panelOpen && panel && !panel.contains(target)) panelOpen = false;
  }

  function go(href: string | null) {
    panelOpen = false;
    if (href) push(href);
  }

  onMount(() => notifications.start(strings()));
  onDestroy(() => notifications.stop());
</script>

<svelte:window on:click={onWindowClick} />

<div class="actions" role="group" aria-label={$t.a11y.actions}>
  <div class="bellwrap" bind:this={panel}>
    <button
      class="icon-btn"
      type="button"
      on:click={togglePanel}
      aria-label={$t.notifications.title}
      title={$t.notifications.title}
      aria-expanded={panelOpen}
    >
      <Icon name="bell" />
      {#if $notifications.unread > 0}
        <span class="badge" aria-hidden="true">
          {$notifications.unread > 9 ? '9+' : $notifications.unread}
        </span>
      {/if}
    </button>
    {#if panelOpen}
      <div class="panel" role="dialog" aria-label={$t.notifications.title}>
        <div class="panelhead">
          <strong>{$t.notifications.title}</strong>
          <button type="button" class="mark" on:click={() => notifications.markSeen()}>
            {$t.notifications.markAllRead}
          </button>
        </div>
        {#if $notifications.notices.length === 0}
          <p class="empty">
            <strong>{$t.notifications.emptyTitle}</strong>
            <span>{$t.notifications.emptyBody}</span>
          </p>
        {:else}
          <ul>
            {#each $notifications.notices as n (n.id)}
              <li>
                <button type="button" on:click={() => go(n.href)}>
                  <span class="n-kind" class:alert={n.kind === 'alert'}></span>
                  <span class="n-main">
                    <strong>{n.title}</strong>
                    <small>{n.body} · {timeAgo(n.at)}</small>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
  <button class="icon-btn" type="button" on:click={cycleTheme} aria-label={$t.a11y.theme} title={$t.a11y.theme}>
    <Icon name={themeIcon()} />
  </button>
  <button
    class="icon-btn"
    type="button"
    on:click={() => push('/perfil')}
    aria-label={$t.a11y.profile}
    title={$t.a11y.profile}
  >
    <Icon name="user" />
  </button>
  {#if settings}
    <button
      class="icon-btn"
      type="button"
      on:click={() => push('/ajustes')}
      aria-label={$t.settings.title}
      title={$t.settings.title}
    >
      <Icon name="settings" />
    </button>
  {/if}
  {#if help}
    <button
      class="icon-btn"
      type="button"
      on:click={() => push('/ayuda')}
      aria-label={$t.help.title}
      title={$t.help.title}
    >
      <Icon name="help" />
    </button>
  {/if}
</div>

<style>
  .actions {
    display: flex;
    gap: 4px;
  }
  .icon-btn {
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    color: var(--muted);
    transition:
      background-color 0.15s ease,
      color 0.15s ease,
      transform 0.1s ease;
  }
  .icon-btn:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .icon-btn:active {
    transform: scale(0.92) rotate(8deg);
  }
  .bellwrap {
    position: relative;
  }
  .bellwrap .icon-btn {
    position: relative;
  }
  .badge {
    position: absolute;
    top: 4px;
    right: 4px;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--danger);
    color: #fff;
    font-size: 0.68rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-variant-numeric: tabular-nums;
  }
  .panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: min(340px, calc(100vw - 32px));
    max-height: min(60vh, 420px);
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow);
    z-index: 60;
    padding: 8px;
  }
  .panelhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
  }
  .mark {
    color: var(--accent);
    font-weight: 700;
    font-size: 0.8rem;
    min-height: 36px;
    padding: 0 8px;
  }
  .empty {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 18px 12px;
    text-align: center;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .panel ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .panel li button {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    text-align: left;
    padding: 10px 8px;
    border-radius: var(--radius-chip);
  }
  .panel li button:active {
    transform: scale(0.99);
  }
  .n-kind {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--chip-sky-bg);
    margin-top: 5px;
  }
  .n-kind.alert {
    background: var(--g-grave-ink);
  }
  .n-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .n-main strong {
    font-size: 0.88rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .n-main small {
    color: var(--muted);
    font-size: 0.76rem;
  }
</style>
