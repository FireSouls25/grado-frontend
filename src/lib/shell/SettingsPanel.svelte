<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from '$lib/i18n';
  import { theme, type Theme } from '$lib/theme/theme';
  import { session } from '../../domains/auth/session';
  import { push } from 'svelte-spa-router';

  const options: { value: Theme; label: string; icon: 'sun' | 'moon' | 'auto' }[] = [
    { value: 'light', label: $t.settings.themeLight, icon: 'sun' },
    { value: 'dark', label: $t.settings.themeDark, icon: 'moon' },
    { value: 'auto', label: $t.settings.themeAuto, icon: 'auto' }
  ];

  function signOut() {
    session.logout();
    push('/login');
  }
</script>

<div class="panel">
  <section>
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

  <section>
    <h3>{$t.settings.about}</h3>
    <p>{$t.settings.aboutBody}</p>
  </section>

  <section>
    <h3>{$t.settings.account}</h3>
    <button class="signout" type="button" on:click={signOut}>
      <Icon name="logout" />
      <span>{$t.settings.signOut}</span>
    </button>
  </section>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  h3 {
    font-size: 0.85rem;
    color: var(--muted);
    font-weight: 700;
    margin-bottom: 8px;
  }
  .segment {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-chip);
    padding: 6px;
  }
  .segment button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 4px;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }
  .segment button.selected {
    background: var(--surface);
    color: var(--accent);
    box-shadow: var(--shadow);
  }
  .panel p {
    color: var(--muted);
    font-size: 0.92rem;
  }
  .signout {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 52px;
    padding: 12px 16px;
    border-radius: var(--radius-chip);
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--danger);
    font-weight: 600;
  }
  .signout:active {
    transform: scale(0.98);
  }
</style>
