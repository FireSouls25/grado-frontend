<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import { notify } from '$lib/ui/notice';
  import { guarded, goBack } from '$lib/nav';
  import { profile } from '$lib/shell/profile';
  import { canManageOwners, isOwner } from '$lib/access';
  import { ApiError } from '$lib/api/types';
  import { foldSearch } from '$lib/search';
  import {
    listUsers,
    setUserActive,
    deleteUser,
    restoreUser,
    teachers,
    type UserAccount,
    type TeacherSummary
  } from './api';
  $: roles = $profile.me?.roles ?? [];
  $: staffOwners = canManageOwners(roles);

  const currentYear = new Date().getFullYear();

  let state: 'loading' | 'error' | 'ready' = 'loading';
  let loadError: unknown = null;
  let list: UserAccount[] = [];
  let teacherNames: Record<string, string> = {};
  let search = '';
  let fRole = '';
  let fState: '' | 'active' | 'inactive' | 'deleted' = '';
  let confirming: string | null = null;
  let acting = false;

  function roleLabel(role: string): string {
    if (role === 'admin') return $t.users.roleAdmin;
    if (role === 'secretary') return $t.users.roleSecretary;
    if (role === 'teacher') return $t.users.roleTeacher;
    if (role === 'student') return $t.users.roleStudent;
    if (role === 'owner') return $t.users.roleOwner;
    return role;
  }

  type SectionKey = 'owner' | 'admin' | 'secretary' | 'teacher' | 'none';

  // Each account lives in exactly one section: its highest-priority
  // role. Pure students never appear here; role-less accounts go last.
  function sectionOf(u: UserAccount): SectionKey | null {
    if (u.Roles.includes('owner')) return 'owner';
    if (u.Roles.includes('admin')) return 'admin';
    if (u.Roles.includes('secretary')) return 'secretary';
    if (u.Roles.includes('teacher')) return 'teacher';
    if (u.Roles.includes('student')) return null;
    return 'none';
  }

  function sectionTitle(key: SectionKey): string {
    if (key === 'owner') return $t.users.sectionOwner;
    if (key === 'admin') return $t.users.sectionAdmin;
    if (key === 'secretary') return $t.users.sectionSecretary;
    if (key === 'teacher') return $t.users.sectionTeacher;
    return $t.users.sectionNone;
  }

  const sectionOrder: SectionKey[] = ['owner', 'admin', 'secretary', 'teacher', 'none'];

  function initialsOf(username: string): string {
    return username
      .split(/[._\s-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  function isPrivileged(u: UserAccount): boolean {
    return u.Roles.includes('admin') || u.Roles.includes('owner');
  }

  async function load() {
    state = 'loading';
    loadError = null;
    confirming = null;
    try {
      const [data, teacherList] = await Promise.all([
        guarded(() => listUsers({ includeDeleted: staffOwners })),
        guarded(() => teachers())
      ]);
      if (data === null || teacherList === null) {
        list = [];
        state = 'ready';
        return;
      }
      list = [...data].sort((a, b) =>
        a.Username.toLowerCase() < b.Username.toLowerCase() ? -1 : 1
      );
      const names: Record<string, string> = {};
      for (const x of teacherList as TeacherSummary[]) {
        names[x.ID] = `${x.Surnames} ${x.Names}`.trim();
      }
      teacherNames = names;
      state = 'ready';
    } catch (err) {
      loadError = err;
      state = 'error';
    }
  }

  // The list scope (bin included or not) depends on roles, which arrive
  // after mount: the shell fires its own refresh first, so awaiting
  // here still races it. Reload whenever the resolved roles change.
  let loadedRolesKey = '\0';
  $: {
    const key = ($profile.me?.roles ?? []).join(',');
    if ($profile.state === 'ready' && key !== loadedRolesKey) {
      loadedRolesKey = key;
      void load();
    }
  }
  onMount(load);

  $: q = foldSearch(search.trim());
  // The bin is opt-in: every normal view hides soft-deleted accounts,
  // which only surface under the Eliminados filter (owners only).
  // Pure students never appear here; each account sits in exactly one
  // section, the one of its highest-priority role.
  $: visible = list.filter((u) => {
    const section = sectionOf(u);
    if (section === null) return false;
    if (fRole && !u.Roles.includes(fRole)) return false;
    if (fState === 'deleted') {
      if (!u.DeletedAt) return false;
    } else {
      if (u.DeletedAt) return false;
      if (fState === 'active' && !u.Active) return false;
      if (fState === 'inactive' && u.Active) return false;
    }
    if (q && !foldSearch(`${u.Username} ${u.Email}`).includes(q)) return false;
    return true;
  });

  $: sections = sectionOrder
    .map((key) => ({ key, title: sectionTitle(key), rows: visible.filter((u) => sectionOf(u) === key) }))
    .filter((s) => s.rows.length > 0);

  async function toggleActive(u: UserAccount) {
    if (acting) return;
    acting = true;
    try {
      await setUserActive(u.ID, !u.Active);
      notify($t.users.statusToggledOk);
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : $t.common.loadError);
    } finally {
      acting = false;
    }
  }

  async function remove(u: UserAccount) {
    if (confirming !== u.ID) {
      confirming = u.ID;
      return;
    }
    if (acting) return;
    acting = true;
    try {
      await deleteUser(u.ID);
      notify($t.users.deletedOk);
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : $t.common.loadError);
    } finally {
      acting = false;
    }
  }

  async function restore(u: UserAccount) {
    if (acting) return;
    acting = true;
    try {
      await restoreUser(u.ID);
      notify($t.users.restoredOk);
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : $t.common.loadError);
    } finally {
      acting = false;
    }
  }
</script>

<AdminShell active="usuarios" year={currentYear}>
  <TopBar title={$t.users.title} subtitle={$t.users.subtitle} showBack onBack={() => goBack('/admin')}>
    <TopActions />
  </TopBar>

  <div class="sheet">
    <div class="filterbar" role="group" aria-label={$t.users.title}>
      <label class="search">
        <span class="cap">{$t.users.searchLabel}</span>
        <div class="search-box">
          <Icon name="search" />
          <input type="search" placeholder={$t.users.search} aria-label={$t.users.searchLabel} bind:value={search} />
        </div>
      </label>
      <Dropdown
        label={$t.users.filterRole}
        value={fRole}
        options={[
          { value: '', label: $t.users.stateAll },
          { value: 'owner', label: $t.users.roleOwner },
          { value: 'admin', label: $t.users.roleAdmin },
          { value: 'secretary', label: $t.users.roleSecretary },
          { value: 'teacher', label: $t.users.roleTeacher }
        ]}
        on:select={(e) => (fRole = String(e.detail))}
      />
      <Dropdown
        label={$t.users.filterState}
        value={fState}
        options={[
          { value: '', label: $t.users.stateAll },
          { value: 'active', label: $t.users.stateActive },
          { value: 'inactive', label: $t.users.stateInactive },
          ...(staffOwners ? [{ value: 'deleted', label: $t.users.stateDeleted }] : [])
        ]}
        on:select={(e) => {
          const v = String(e.detail);
          fState = v === 'active' || v === 'inactive' || v === 'deleted' ? v : '';
        }}
      />
      <span class="count" role="status">{$t.users.count(visible.length)}</span>
    </div>

    {#if state === 'loading'}
      <Skeleton rows={4} />
    {:else if state === 'error'}
      <ErrorState error={loadError} onRetry={load} />
    {:else if list.length === 0}
      <EmptyState
        icon="users"
        title={$t.users.emptyTitle}
        body={$t.users.emptyBody}
      />
    {:else if visible.length === 0}
      <EmptyState icon="list" title={$t.users.noMatchTitle} body={$t.users.noMatchBody} />
    {:else}
      {#each sections as section (section.key)}
        <section class="role-section" aria-label={section.title}>
          <div class="section-head">
            <h2>{section.title}</h2>
            <span class="count" role="status">{$t.users.count(section.rows.length)}</span>
          </div>
          <div class="colhead" aria-hidden="true">
            <span>{$t.users.userColumn}</span>
            <span>{$t.admin.filterRole}</span>
            <span class="num-col">{$t.users.filterState}</span>
            <span class="act-col">{$t.a11y.actions}</span>
          </div>
          <ul class="roster">
            {#each section.rows as u (u.ID)}
            {@const locked = isPrivileged(u) && !isOwner(roles)}
            {@const linked = u.TeacherID ? (teacherNames[u.TeacherID] ?? '') : ''}
            <li class="trow" class:deleted={!!u.DeletedAt}>
              <button type="button" class="who-btn" on:click={() => (confirming = null)}>
                <span class="avatar" aria-hidden="true">{initialsOf(u.Username)}</span>
                <span class="who">
                  <span class="nameline">
                    <strong class="name">{u.Username}</strong>
                    {#if u.DeletedAt}<span class="pill off">{$t.users.deletedLabel}</span>
                    {:else if !u.Active}<span class="pill off">{$t.users.inactiveLabel}</span>{/if}
                  </span>
                  <span class="sub">
                    {#if u.Email}{u.Email}{/if}
                    {#if linked} · {$t.users.linkedTeacher(linked)}{/if}
                  </span>
                </span>
              </button>

              <div class="roles-col">
                {#each u.Roles as r}
                  <span class="pill" class:dir={r === 'admin' || r === 'owner'}>{roleLabel(r)}</span>
                {:else}
                  <span class="pill mute">—</span>
                {/each}
              </div>

              <div class="state-col">
                {#if u.DeletedAt}
                  <span class="pill off">{$t.users.deletedLabel}</span>
                {:else}
                  <span class="pill" class:ok={u.Active}>{u.Active ? $t.users.stateActive : $t.users.stateInactive}</span>
                {/if}
              </div>

              <div class="act-col">
                {#if u.DeletedAt}
                  {#if staffOwners}
                    <button type="button" class="btn btn-sm" disabled={acting} on:click={() => restore(u)}>
                      {$t.users.restoreAction}
                    </button>
                  {/if}
                {:else}
                  <button
                    type="button"
                    class="btn btn-sm"
                    disabled={acting || locked}
                    title={locked ? $t.users.privilegedLocked : ''}
                    on:click={() => toggleActive(u)}
                  >
                    {u.Active ? $t.users.deactivateAction : $t.users.reactivateAction}
                  </button>
                  {#if staffOwners}
                    {#if confirming === u.ID}
                      <button type="button" class="btn btn-sm btn-danger" disabled={acting} on:click={() => remove(u)}>
                        {$t.users.confirmDeleteYes}
                      </button>
                      <button type="button" class="btn btn-sm" on:click={() => (confirming = null)}>
                        {$t.common.cancel}
                      </button>
                    {:else}
                      <button type="button" class="btn btn-sm btn-danger" on:click={() => remove(u)}>
                        {$t.users.deleteAction}
                      </button>
                    {/if}
                  {/if}
                {/if}
              </div>
            </li>
            {/each}
          </ul>
        </section>
      {/each}
      {#if fState === 'deleted' && staffOwners}
        <p class="hint">{$t.users.confirmDelete}</p>
      {/if}
    {/if}
  </div>
</AdminShell>

<style>
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sheet);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .filterbar {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    align-items: end;
  }
  @media (min-width: 780px) {
    .filterbar {
      grid-template-columns: 1.6fr 1fr 1fr auto;
    }
  }
  .search {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .search .cap {
    font-size: var(--fs-small);
    font-weight: 500;
    color: var(--muted);
  }
  .search-box {
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--control);
    border-radius: var(--radius-control);
    padding: 0 10px;
    color: var(--muted);
    min-height: var(--control-height);
  }
  .search-box:focus-within {
    border-color: var(--accent);
  }
  .search-box :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
  }
  .search-box input {
    border: 0;
    background: none;
    outline: none;
    width: 100%;
    color: var(--ink);
    font-size: 0.84rem;
  }
  .count {
    align-self: center;
    justify-self: end;
    background: var(--tint);
    border-radius: 999px;
    padding: 4px 12px;
    color: var(--ink-soft);
    font-size: 0.76rem;
    font-weight: 600;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .role-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .role-section + .role-section {
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .section-head h2 {
    font-size: 0.92rem;
    font-weight: 600;
  }
  .section-head .count {
    align-self: center;
  }
  .colhead {
    display: none;
  }
  .roster {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .trow {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 4px;
    border-top: 1px solid var(--line);
  }
  .trow:first-child {
    border-top: 0;
  }
  .trow.deleted {
    opacity: 0.85;
  }
  .who-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    min-width: 0;
    cursor: default;
  }
  .avatar {
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.74rem;
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .nameline {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex-wrap: wrap;
  }
  .name {
    font-weight: 600;
    font-size: 0.88rem;
    overflow-wrap: anywhere;
  }
  .sub {
    color: var(--muted);
    font-size: 0.76rem;
    overflow-wrap: anywhere;
  }
  .roles-col,
  .state-col {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .act-col {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex-wrap: wrap;
  }
  .pill {
    font-size: 0.74rem;
    font-weight: 600;
    border-radius: 999px;
    padding: 3px 10px;
    background: var(--tint);
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .pill.dir {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .pill.ok {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
  }
  .pill.off {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .pill.mute {
    background: transparent;
    border: 1px dashed var(--control);
    color: var(--muted);
  }
  @media (min-width: 820px) {
    .colhead {
      display: grid;
      grid-template-columns: minmax(220px, 1.4fr) 170px 110px auto;
      gap: 14px;
      padding: 0 4px 8px;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 500;
    }
    .colhead .num-col {
      text-align: left;
    }
    .colhead .act-col {
      justify-content: flex-end;
    }
    .trow {
      display: grid;
      grid-template-columns: minmax(220px, 1.4fr) 170px 110px auto;
      gap: 14px;
      align-items: center;
    }
  }
</style>
