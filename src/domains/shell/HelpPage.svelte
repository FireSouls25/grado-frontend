<script lang="ts">
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from '$lib/i18n';
  import { profile } from '$lib/shell/profile';
  import { isTeacher, isSecretary } from '$lib/access';

  $: myRoles = $profile.me?.roles ?? [];
  $: own = isTeacher(myRoles) ? 'teacher' : isSecretary(myRoles) ? 'secretary' : 'admin';
  let tab: string = own;
  $: if (!tab) tab = own;
  type HelpRole = { id: string; title: string; steps: { title: string; body: string }[] };
  $: helpRoles = $t.help.roles as unknown as readonly HelpRole[];
  $: active = helpRoles.find((r) => r.id === tab) ?? helpRoles[0];
</script>

<div class="page">
  <TopBar title={$t.help.title} showBack>
    <TopActions settings={false} help={false} />
  </TopBar>
  <div class="sheet">
    <p class="intro">{$t.help.intro}</p>
    <div class="tabs" role="tablist">
      {#each helpRoles as r (r.id)}
        <button
          type="button"
          role="tab"
          aria-selected={tab === r.id}
          class:selected={tab === r.id}
          on:click={() => (tab = r.id)}
        >
          {r.title}
        </button>
      {/each}
    </div>
    <div class="guides">
      {#each active.steps as step, i (step.title)}
        <article class="guide">
          <div class="badge" aria-hidden="true">{i + 1}</div>
          <div class="gtext">
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>
        </article>
      {/each}
    </div>
    <p class="fine"><Icon name="warn" /> {$t.help.stale}</p>
  </div>
</div>

<style>
  .page {
    padding-bottom: calc(24px + env(safe-area-inset-bottom));
  }
  .intro {
    color: var(--muted);
    font-size: 0.85rem;
    margin-bottom: 12px;
  }
  .tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .tabs button {
    border: 1px solid var(--line);
    background: var(--surface-2);
    border-radius: 999px;
    padding: 7px 14px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--muted);
  }
  .tabs button.selected {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--surface);
  }
  .guides {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .guide {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 12px 14px;
  }
  .badge {
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.85rem;
  }
  .gtext {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  h3 {
    font-size: 0.88rem;
    font-weight: 600;
  }
  p {
    color: var(--muted);
    font-size: 0.82rem;
    line-height: 1.5;
  }
  .fine {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    font-size: 0.8rem;
  }
  .fine :global(svg) {
    width: 15px;
    height: 15px;
    flex: none;
  }
</style>
