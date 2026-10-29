<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import Toast from '$lib/ui/Toast.svelte';
  import { notice, dismissNotice } from '$lib/ui/notice';
  import { profile } from '$lib/shell/profile';

  export let active: 'agenda' | 'horario' | null = null;

  onMount(() => {
    if ($profile.state === 'idle') void profile.refresh();
  });

  type Key = 'agenda' | 'horario';
  type IconName = 'list' | 'calendar';

  $: items = [
    { key: 'agenda' as Key, href: '/agenda', icon: 'list' as IconName, label: $t.nav.agenda },
    { key: 'horario' as Key, href: '/horario', icon: 'calendar' as IconName, label: $t.nav.schedule }
  ];

  $: userLabel = $profile.me?.teacher
    ? `${$profile.me.teacher.names} ${$profile.me.teacher.surnames}`.trim()
    : ($profile.me?.username ?? '');
</script>

<div class="console">
  <aside class="side" aria-label={$t.agenda.eyebrow}>
    <div class="brandcard">
      <svg class="brandmark" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect width="28" height="28" rx="7" fill="var(--accent-soft)" />
        <path d="M7 9.5C7 8.67 7.67 8 8.5 8H13.5V20H8.5C7.67 20 7 19.33 7 18.5V9.5Z" stroke="var(--accent)" stroke-width="1.75" stroke-linejoin="round" />
        <path d="M21 9.5C21 8.67 20.33 8 19.5 8H14.5V20H19.5C20.33 20 21 19.33 21 18.5V9.5Z" stroke="var(--accent)" stroke-width="1.75" stroke-linejoin="round" />
      </svg>
      <div class="u-t">
        <strong>{$t.admin.schoolName}</strong>
        <small>{$t.agenda.eyebrow}</small>
      </div>
    </div>

    <nav class="vnav" aria-label={$t.agenda.eyebrow}>
      <p class="nav-cap">{$t.agenda.eyebrow}</p>
      {#each items as item (item.key)}
        <button
          type="button"
          class:active={active === item.key}
          aria-current={active === item.key ? 'page' : undefined}
          on:click={() => item.key !== active && push(item.href)}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </button>
      {/each}
    </nav>

    {#if userLabel}
      <div class="side-foot">
        <button type="button" class="userrow" on:click={() => push('/perfil')}>
          <Icon name="user" />
          <span class="uname">{userLabel}</span>
        </button>
      </div>
    {/if}
  </aside>

  <nav class="mnav" aria-label={$t.agenda.eyebrow}>
    {#each items as item (item.key)}
      <button
        type="button"
        class:active={active === item.key}
        aria-current={active === item.key ? 'page' : undefined}
        on:click={() => item.key !== active && push(item.href)}
      >
        <Icon name={item.icon} />
        <span>{item.label}</span>
      </button>
    {/each}
  </nav>

  <div class="sbody"><slot /></div>
  <Toast message={$notice} onClose={dismissNotice} />
</div>

<style>
  .console {
    min-height: 100vh;
    min-height: 100svh;
    background: var(--bg);
    color: var(--ink);
  }
  .side {
    display: none;
  }
  .mnav {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: calc(8px + env(safe-area-inset-top)) 16px 8px;
    background: var(--bg);
    border-bottom: 1px solid var(--line);
    position: sticky;
    top: 0;
    z-index: 20;
  }
  .mnav::-webkit-scrollbar {
    display: none;
  }
  .mnav button {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 12px;
    border-radius: var(--radius-control);
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-soft);
    font-weight: 500;
    font-size: 0.82rem;
    white-space: nowrap;
  }
  .mnav button.active {
    background: var(--active);
    border-color: var(--control);
    color: var(--ink);
    font-weight: 600;
  }
  .mnav button :global(svg) {
    width: 16px;
    height: 16px;
  }
  .sbody {
    min-width: 0;
    padding: 12px 16px calc(64px + env(safe-area-inset-bottom));
  }
  .brandcard {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 6px 8px 10px;
  }
  .brandmark {
    width: 32px;
    height: 32px;
    flex: none;
  }
  .u-t {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
    min-width: 0;
  }
  .u-t strong {
    font-size: 0.82rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .u-t small {
    font-size: 0.72rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .vnav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .nav-cap {
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 500;
    padding: 4px 10px 6px;
  }
  .vnav button {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 0 10px;
    min-height: 36px;
    border-radius: var(--radius-control);
    color: var(--muted);
    font-weight: 500;
    font-size: 0.85rem;
    text-align: left;
  }
  .vnav button :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
  }
  .vnav button:hover {
    background: var(--tint);
    color: var(--ink);
  }
  .vnav button.active {
    background: var(--active);
    color: var(--ink);
    font-weight: 600;
  }
  .side-foot {
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .userrow {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius-control);
    color: var(--ink-soft);
    font-size: 0.82rem;
    font-weight: 500;
    text-align: left;
  }
  .userrow:hover {
    background: var(--tint);
    color: var(--ink);
  }
  .userrow :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
  }
  .uname {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @media (min-width: 960px) {
    .console {
      display: grid;
      grid-template-columns: 232px minmax(0, 1fr);
    }
    .side {
      display: flex;
      background: var(--bg);
      padding: 16px 12px;
      flex-direction: column;
      gap: 12px;
      position: sticky;
      top: 0;
      height: 100vh;
      height: 100svh;
      overflow-y: auto;
    }
    .mnav {
      display: none;
    }
    .sbody {
      padding: 14px 20px 32px 8px;
    }
  }
</style>
