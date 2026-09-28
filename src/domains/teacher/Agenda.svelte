<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { daySchedule, isMissing, type TeacherClass } from './api';
  import { guarded } from '$lib/nav';
  import { ApiError } from '$lib/api/types';
  import { session } from '../auth/session';
  import { devAccounts } from '../auth/accounts';

  interface AgendaItem extends TeacherClass {
    Room: string;
    Grade: string;
    Status: 'done' | 'pending';
  }

  // Referencia visual entregada (Lun 18 · noviembre 2026). Se usa como
  // respaldo cuando el backend aún no expone el horario; en cuanto
  // GET /v1/teachers/me/schedule exista, los datos vivos la reemplazan.
  const demoWeek = [
    { key: 'lun', weekday: 'Lun', day: '18', jsWeekday: 1, active: true },
    { key: 'mar', weekday: 'Mar', day: '19', jsWeekday: 2, active: false },
    { key: 'mie', weekday: 'Mié', day: '20', jsWeekday: 3, active: false },
    { key: 'jue', weekday: 'Jue', day: '21', jsWeekday: 4, active: false },
    { key: 'vie', weekday: 'Vie', day: '22', jsWeekday: 5, active: false }
  ];

  const demoClasses: AgendaItem[] = [
    {
      GroupID: 'demo-10a',
      ClassLabel: '10°A',
      SubjectID: 'matematicas',
      SubjectName: 'Matemáticas',
      Weekday: 1,
      Start: '07:00',
      End: '08:30',
      Room: '201',
      Grade: '10°A',
      Status: 'done'
    },
    {
      GroupID: 'demo-11b',
      ClassLabel: '11°B',
      SubjectID: 'fisica',
      SubjectName: 'Física',
      Weekday: 1,
      Start: '08:45',
      End: '10:15',
      Room: '304',
      Grade: '11°B',
      Status: 'pending'
    },
    {
      GroupID: 'demo-9a',
      ClassLabel: '9°A',
      SubjectID: 'geometria',
      SubjectName: 'Geometría',
      Weekday: 1,
      Start: '10:30',
      End: '12:00',
      Room: '102',
      Grade: '9°A',
      Status: 'pending'
    },
    {
      GroupID: 'demo-10b',
      ClassLabel: '10°B',
      SubjectID: 'estadistica',
      SubjectName: 'Estadística',
      Weekday: 1,
      Start: '13:00',
      End: '14:30',
      Room: '202',
      Grade: '10°B',
      Status: 'pending'
    }
  ];

  let selectedDay = 0;
  let search = '';
  let loading = true;
  let loadError = false;
  let liveClasses: AgendaItem[] | null = null;
  let selectedCard = 'demo-11b';

  $: account = devAccounts.find((a) => a.id === $session) ?? devAccounts[1];
  $: teacherName = account?.displayName ? `Prof. ${account.displayName}` : $t.agenda.teacherName;

  async function load() {
    loading = true;
    loadError = false;
    try {
      const weekday = demoWeek[selectedDay].jsWeekday;
      const classes = await guarded(() => daySchedule(weekday));
      if (classes === null) {
        liveClasses = null;
        loading = false;
        return;
      }
      if (classes.length === 0) {
        liveClasses = [];
      } else {
        liveClasses = classes.map((c, i) => ({
          ...c,
          Room: c.ClassLabel.replace(/[^0-9]/g, '').slice(0, 3) || `20${i + 1}`,
          Grade: c.ClassLabel,
          Status: 'pending' as const
        }));
      }
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        // Backend sin ruta todavía: respaldo visual, no error.
        liveClasses = null;
      } else {
        loadError = true;
      }
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function selectDay(i: number) {
    selectedDay = i;
    load();
  }

  // Solo el día demo (Lun 18) trae clases de referencia; el resto usa el
  // backend o queda vacío honesto.
  $: baseList =
    liveClasses !== null
      ? liveClasses
      : selectedDay === 0
        ? demoClasses
        : [];

  $: q = search.trim().toLowerCase();
  $: visible = q
    ? baseList.filter((c) =>
        `${c.SubjectName} ${c.Grade} ${c.Room}`.toLowerCase().includes(q)
      )
    : baseList;

  $: doneCount = baseList.filter((c) => c.Status === 'done').length;

  function openClass(item: AgendaItem) {
    selectedCard = item.GroupID;
    push(`/clase/${encodeURIComponent(item.GroupID)}?materia=${encodeURIComponent(item.SubjectID)}`);
  }
</script>

<div class="agenda">
  <!-- Barra superior estilo referencia -->
  <header class="top">
    <div class="top-inner">
      <div class="brand">
        <span class="mark" aria-hidden="true">O</span>
        <span class="brand-text">
          <strong>Observador</strong>
          <small>Estudiantil</small>
        </span>
      </div>

      <nav class="mainnav" aria-label={$t.a11y.sections}>
        <button type="button" class="navlink active" aria-current="page">{$t.nav.agenda}</button>
        <button type="button" class="navlink" on:click={() => push('/horario')}>{$t.nav.myClasses}</button>
        <button type="button" class="navlink" on:click={() => push('/hoy')}>{$t.nav.warnings}</button>
        <button type="button" class="navlink" on:click={() => push('/admin/estudiantes')}>{$t.nav.students}</button>
      </nav>

      <div class="top-right">
        <label class="search">
          <Icon name="search" />
          <input
            type="search"
            placeholder={$t.agenda.searchPlaceholder}
            bind:value={search}
            aria-label={$t.agenda.searchPlaceholder}
          />
        </label>
        <div class="profile">
          <span class="avatar" aria-hidden="true">CM</span>
          <span class="who">
            <strong>{teacherName}</strong>
            <small>{$t.agenda.teacherId}</small>
          </span>
        </div>
        <button type="button" class="gear" aria-label={$t.settings.title} on:click={() => push('/ajustes')}>
          <Icon name="settings" />
        </button>
      </div>
    </div>
  </header>

  <main class="body">
    <p class="crumbs">{$t.agenda.breadcrumbHome} <span aria-hidden="true">›</span> <strong>{$t.agenda.breadcrumbHere}</strong></p>

    <div class="title-row">
      <h1>{$t.agenda.title}</h1>
      <div class="stats">
        <div class="stat">
          <small>{$t.agenda.todayLabel}</small>
          <strong>{$t.agenda.todayValue(baseList.length)}</strong>
        </div>
        <div class="stat">
          <small>{$t.agenda.registeredLabel}</small>
          <strong class="green">{$t.agenda.registeredValue(doneCount, baseList.length || 4)}</strong>
        </div>
      </div>
    </div>

    <section class="week" aria-label={$t.agenda.monthLabel}>
      <p class="month">{$t.agenda.monthLabel}</p>
      <div class="days" role="tablist">
        {#each demoWeek as d, i}
          <button
            type="button"
            role="tab"
            aria-selected={selectedDay === i}
            class="day"
            class:selected={selectedDay === i}
            on:click={() => selectDay(i)}
          >
            <small>{d.weekday}</small>
            <strong>{d.day}</strong>
            {#if selectedDay === i}<span class="dot" aria-hidden="true"></span>{/if}
          </button>
        {/each}
      </div>
    </section>

    <h2 class="list-title">{$t.agenda.listTitle}</h2>

    {#if loading}
      <Skeleton rows={4} />
    {:else if loadError}
      <EmptyState icon="warn" title={$t.common.loadError} actionLabel={$t.common.retry} onAction={load} />
    {:else if visible.length === 0}
      <EmptyState icon="calendar" title={$t.agenda.emptyTitle} body={$t.agenda.emptyBody} />
    {:else}
      <ul class="classes">
        {#each visible as item (item.GroupID)}
          <li>
            <article class="class-card" class:selected={selectedCard === item.GroupID}>
              <div class="left">
                <p class="time"><Icon name="clock" /> {item.Start} - {item.End}</p>
              </div>
              <div class="mid">
                <h3>{item.SubjectName}</h3>
                <p>{$t.agenda.gradeLabel(item.Grade)}</p>
              </div>
              <div class="right">
                <span class="room"><Icon name="pin" /> {$t.agenda.roomLabel(item.Room)}</span>
                {#if item.Status === 'done'}
                  <span class="chip chip-green">{$t.agenda.statusDone}</span>
                {:else}
                  <span class="chip chip-yellow">{$t.agenda.statusPending}</span>
                {/if}
                <button
                  type="button"
                  class="open"
                  class:primary={selectedCard === item.GroupID}
                  on:click={() => openClass(item)}
                >
                  {$t.agenda.openClass}
                </button>
              </div>
            </article>
          </li>
        {/each}
      </ul>
    {/if}
  </main>
</div>

<style>
  .agenda {
    min-height: 100vh;
    min-height: 100svh;
    background: var(--bg);
    color: var(--ink);
  }
  .top {
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  .top-inner {
    max-width: 1180px;
    margin: 0 auto;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
  }
  .mark {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 800;
    font-size: 1.15rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .brand-text {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .brand-text strong {
    font-size: 0.95rem;
  }
  .brand-text small {
    color: var(--accent);
    font-weight: 700;
    font-size: 0.75rem;
  }
  .mainnav {
    flex: 1;
    display: flex;
    justify-content: center;
    gap: 4px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 4px;
    max-width: 560px;
    margin: 0 auto;
  }
  .navlink {
    flex: 1;
    white-space: nowrap;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
  }
  .navlink.active {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .top-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: none;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    padding: 8px 14px;
    color: var(--muted);
    min-width: 230px;
  }
  .search input {
    border: none;
    background: none;
    outline: none;
    width: 100%;
    font-size: 0.85rem;
  }
  .profile {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-pill);
    background: var(--chip-sky-bg);
    color: var(--chip-sky-ink);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.85rem;
    flex: none;
  }
  .who {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .who strong {
    font-size: 0.85rem;
    white-space: nowrap;
  }
  .who small {
    color: var(--muted);
    font-size: 0.72rem;
  }
  .gear {
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    color: var(--muted);
    border: 1px solid var(--line);
    background: var(--surface);
  }
  .body {
    max-width: 1180px;
    margin: 0 auto;
    padding: 18px 20px 96px;
  }
  .crumbs {
    color: var(--muted);
    font-size: 0.8rem;
    margin-bottom: 4px;
  }
  .crumbs strong {
    color: var(--ink);
  }
  .title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }
  .title-row h1 {
    font-size: 1.9rem;
  }
  .stats {
    display: flex;
    gap: 12px;
    flex: none;
  }
  .stat {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px 18px;
    min-width: 130px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stat small {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
  }
  .stat strong {
    font-size: 1.25rem;
  }
  .stat strong.green {
    color: var(--chip-green-ink);
  }
  .week {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 14px 16px 16px;
    margin-bottom: 22px;
  }
  .month {
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 10px;
  }
  .days {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
  }
  .day {
    background: var(--surface-2);
    border: 1px solid transparent;
    border-radius: 12px;
    padding: 12px 8px 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-height: 74px;
  }
  .day small {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
  }
  .day strong {
    font-size: 1.3rem;
  }
  .day.selected {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .day.selected small {
    color: var(--accent-ink);
    opacity: 0.9;
  }
  .dot {
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: currentColor;
    margin-top: 2px;
  }
  .list-title {
    font-size: 0.9rem;
    margin-bottom: 12px;
  }
  .classes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .class-card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 16px 18px;
    display: grid;
    grid-template-columns: 170px 1fr auto;
    align-items: center;
    gap: 16px;
  }
  .class-card.selected {
    border: 1.5px solid var(--accent);
    box-shadow: var(--shadow);
  }
  .time {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .mid h3 {
    font-size: 1.05rem;
  }
  .mid p {
    color: var(--muted);
    font-size: 0.82rem;
  }
  .right {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .room {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .open {
    background: var(--surface-2);
    color: var(--ink);
    font-weight: 700;
    font-size: 0.85rem;
    border-radius: 10px;
    padding: 10px 18px;
    white-space: nowrap;
  }
  .open.primary {
    background: var(--accent);
    color: var(--accent-ink);
  }

  @media (max-width: 960px) {
    .top-inner {
      flex-wrap: wrap;
    }
    .mainnav {
      order: 3;
      flex-basis: 100%;
      max-width: none;
      overflow-x: auto;
    }
    .top-right {
      margin-left: auto;
      flex-wrap: wrap;
    }
    .search {
      min-width: 160px;
      flex: 1;
    }
    .title-row {
      flex-direction: column;
    }
    .stats {
      width: 100%;
    }
    .stat {
      flex: 1;
    }
    .class-card {
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .right {
      flex-wrap: wrap;
    }
  }
</style>
