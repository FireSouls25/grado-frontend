<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import Icon from '$lib/ui/Icon.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import HelpPanel from './HelpPanel.svelte';
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
  let settingsOpen = false;
  let helpOpen = false;

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
  {#if help}
    <button
      class="icon-btn"
      type="button"
      on:click={() => (helpOpen = true)}
      aria-label={$t.help.title}
      title={$t.help.title}
    >
      <Icon name="help" />
    </button>
  {/if}
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
      on:click={() => (settingsOpen = true)}
      aria-label={$t.settings.title}
      title={$t.settings.title}
    >
      <Icon name="settings" />
    </button>
  {/if}
</div>

<Sheet open={settingsOpen} title={$t.settings.title} onClose={() => (settingsOpen = false)}>
  <SettingsPanel onNavigate={() => (settingsOpen = false)} />
</Sheet>

<Sheet open={helpOpen} title={$t.help.title} onClose={() => (helpOpen = false)}>
  <HelpPanel />
</Sheet>

<style>
  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .icon-btn {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-control);
    border: 1px solid transparent;
    color: var(--ink-soft);
  }
  .icon-btn:hover {
    background: var(--surface);
    border-color: var(--line);
    color: var(--ink);
  }
  .icon-btn:active {
    transform: translateY(1px);
  }
  .icon-btn :global(svg) {
    width: 18px;
    height: 18px;
  }
  .bellwrap {
    position: relative;
  }
  .bellwrap .icon-btn {
    position: relative;
  }
  .badge {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--danger);
    color: #fff;
    font-size: 0.65rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-variant-numeric: tabular-nums;
  }
  .panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    width: min(340px, calc(100vw - 32px));
    max-height: min(60vh, 420px);
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    z-index: 65;
    padding: 8px;
    animation: dropIn 0.14s var(--ease-out) both;
  }
  .panelhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 4px;
  }
  .panelhead strong {
    font-size: 0.85rem;
  }
  .mark {
    color: var(--accent);
    font-weight: 600;
    font-size: 0.78rem;
    min-height: 28px;
    padding: 0 6px;
    border-radius: 6px;
  }
  .mark:hover {
    background: var(--surface-2);
  }
  .empty {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 16px 12px;
    text-align: center;
    color: var(--muted);
    font-size: 0.82rem;
  }
  .panel ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .panel li button {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    text-align: left;
    padding: 8px 10px;
    border-radius: var(--radius-control);
  }
  .panel li button:hover {
    background: var(--surface-2);
  }
  .n-kind {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--accent);
    margin-top: 6px;
  }
  .n-kind.alert {
    background: var(--g-grave-ink);
  }
  .n-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .n-main strong {
    font-size: 0.84rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .n-main small {
    color: var(--muted);
    font-size: 0.75rem;
  }
  @keyframes dropIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
