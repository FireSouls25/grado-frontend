<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from '$lib/i18n';
  import { theme, type Theme } from '$lib/theme/theme';
  import { session } from '../../domains/auth/session';
  import { push } from 'svelte-spa-router';

  export let onNavigate: (() => void) | null = null;

  const options: { value: Theme; label: string; icon: 'sun' | 'moon' | 'auto' }[] = [
    { value: 'light', label: $t.settings.themeLight, icon: 'sun' },
    { value: 'dark', label: $t.settings.themeDark, icon: 'moon' },
    { value: 'auto', label: $t.settings.themeAuto, icon: 'auto' }
  ];

  function openProfile() {
    if (onNavigate) onNavigate();
    push('/perfil');
  }

  async function signOut() {
    if (onNavigate) onNavigate();
    await session.logout();
    push('/login');
  }
</script>

<div class="panel">
  <section class="block">
    <h3>{$t.settings.theme}</h3>
    <div class="segment" role="group" aria-label={$t.settings.theme}>
      {#each options as opt}
        <button
          type="button"
          class:selected={$theme === opt.value}
          aria-pressed={$theme === opt.value}
          on:click={() => theme.set(opt.value)}
        >
          <Icon name={opt.icon} />
          <span>{opt.label}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="block">
    <h3>{$t.settings.about}</h3>
    <p>{$t.settings.aboutBody}</p>
  </section>

  <section class="block">
    <h3>{$t.settings.account}</h3>
    <div class="acct-actions">
      <button class="btn profile-btn" type="button" on:click={openProfile}>
        <Icon name="user" />
        <span>{$t.profile.pageTitle}</span>
      </button>
      <button class="btn btn-danger signout" type="button" on:click={signOut}>
        <Icon name="logout" />
        <span>{$t.settings.signOut}</span>
      </button>
    </div>
  </section>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h3 {
    font-size: 0.78rem;
    color: var(--muted);
    font-weight: 600;
  }
  .segment {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: 4px;
  }
  .segment button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36px;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--muted);
  }
  .segment button :global(svg) {
    width: 16px;
    height: 16px;
  }
  .segment button:hover {
    color: var(--ink);
  }
  .segment button.selected {
    background: var(--surface);
    color: var(--accent);
    border: 1px solid var(--line);
  }
  .panel p {
    color: var(--muted);
    font-size: 0.85rem;
    line-height: 1.5;
  }
  .acct-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  @media (max-width: 460px) {
    .acct-actions {
      grid-template-columns: 1fr;
    }
  }
  .profile-btn,
  .signout {
    width: 100%;
    min-height: 40px;
  }
</style>
