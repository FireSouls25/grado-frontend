<script lang="ts">
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from '$lib/i18n';
  import { profile } from '$lib/shell/profile';
  import { isTeacher, isSecretary } from '$lib/access';

  $: myRoles = $profile.me?.roles ?? [];
  $: own = isTeacher(myRoles) ? 'teacher' : isSecretary(myRoles) ? 'secretary' : 'admin';
  type HelpStep = { title: string; body: string; detail?: string };
  type HelpRole = { id: string; title: string; steps: HelpStep[] };
  $: helpRoles = $t.help.roles as unknown as readonly HelpRole[];
  $: active = helpRoles.find((r) => r.id === own) ?? helpRoles[0];
  let expanded: Record<string, boolean> = {};
</script>

<div class="page">
  <TopBar title={$t.help.title} showBack>
    <TopActions settings={false} help={false} />
  </TopBar>
  <div class="sheet">
    <h2 class="role-title">{active.title}</h2>
    <p class="intro">{$t.help.intro}</p>
    <div class="guides">
      {#each active.steps as step, i (step.title)}
        <article class="guide">
          <div class="badge" aria-hidden="true">{i + 1}</div>
          <div class="gtext">
            <h3>{step.title}</h3>
            <p>{step.body}</p>
            {#if step.detail}
              <button
                type="button"
                class="more"
                aria-expanded={!!expanded[step.title]}
                on:click={() => (expanded = { ...expanded, [step.title]: !expanded[step.title] })}
              >
                {$t.help.moreDetails}
              </button>
              {#if expanded[step.title]}
                <p class="detail">{step.detail}</p>
              {/if}
            {/if}
          </div>
        </article>
      {/each}
    </div>
    <p class="fine"><Icon name="warn" /> {$t.help.stale}</p>
  </div>
</div>

<style>
  .page {
    padding-bottom: calc(24px + env(safe-area-inset));
  }
  .role-title {
    font-size: 1rem;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .intro {
    color: var(--muted);
    font-size: 0.85rem;
    margin-bottom: 12px;
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
  .more {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 2px 0;
    color: var(--accent);
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }
  .detail {
    background: var(--surface);
    border: 1px dashed var(--line);
    border-radius: var(--radius-control);
    padding: 8px 10px;
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
