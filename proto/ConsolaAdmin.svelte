<!-- PROTOTYPE VariantE — "Consola" v3. Faithful to reference/cosmos_32058566:
     warm cream page, flat white hairline cards, huge tight title, sidebar with
     user card + ⌘F search + bordered active pill, stat anatomy
     (label/number/sub + insight footer), tan trend with coral dots + dotted
     comparison + vertical hairlines, black/gray donut, pill legends, dark
     tooltip. Severity speaks the reference's Priority language (ink scale).
     Dark twin = HSL lightness inversion. Scoped; never touches global.css. -->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { theme } from '$lib/theme/theme';
  import { onMount } from 'svelte';
  import { attention, gravityBars, riskStudents, salones, hoursToday } from './mock';

  const MODES = ['auto', 'light', 'dark'] as const;
  const SEVS = ['todos', 'leve', 'medio', 'grave'] as const;
  const WEEK: [string, string, boolean][] = [['Lun', '18', true], ['Mar', '19', false], ['Mié', '20', false], ['Jue', '21', false], ['Vie', '22', false]];

  let override: (typeof MODES)[number] = 'auto';
  let prefersDark = false;
  let search = '';
  let searchEl: HTMLInputElement | null = null;
  let sevFilter: (typeof SEVS)[number] = 'todos';
  let selectedStudent: string | null = '1';
  let year = 2026;

  interface Task { id: string; sev: 'leve' | 'medio' | 'grave'; title: string; meta: string; action: string; done: boolean; }
  let tasks: Task[] = [
    { id: 't1', sev: 'grave', title: 'Llamar acudiente — S. Valderrama', meta: '9-2 · evasión reiterada · hoy 08:15', action: 'Llamar', done: false },
    { id: 't2', sev: 'grave', title: 'Llamar acudiente — T. Ríos', meta: '10-1 · hoy 09:40', action: 'Llamar', done: false },
    { id: 't3', sev: 'medio', title: 'Armar horario de 7-2', meta: '31 estudiantes · sin bloques', action: 'Asignar', done: false },
    { id: 't4', sev: 'medio', title: 'Armar horario de 9-3', meta: 'Sin bloques ni docente', action: 'Asignar', done: false },
    { id: 't5', sev: 'medio', title: 'Revisar a D. Mora', meta: '11-2 · +1 esta semana', action: 'Ficha', done: false },
    { id: 't6', sev: 'leve', title: 'Matricular 4 fichas en 9-3', meta: 'Sin salón asignado', action: 'Matricular', done: false },
    { id: 't7', sev: 'leve', title: 'Ver reporte de 8-1', meta: 'Tasa 88% · 1 llamado medio', action: 'Ver', done: false }
  ];

  const initials = (name: string) =>
    name.split(/[,\s]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  const trend = [88, 86, 89, 84, 87, 82, 85, 78];
  const trendPrev = [84, 87, 83, 86, 85, 84, 86, 80];
  const trendMonths = ['Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep'];
  const W = 560, H = 208, PADL = 30, PADR = 10, PADT = 14, PADB = 26;
  const yOf = (v: number) => H - PADB - ((v - 70) / 30) * (H - PADT - PADB);
  const xOf = (i: number) => PADL + (i * (W - PADL - PADR)) / (trend.length - 1);
  const line = trend.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const prevLine = trendPrev.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');

  const rated = salones.filter((s) => s.rate > 0);

  const mq = () => window.matchMedia('(prefers-color-scheme: dark)');
  function syncMq(e?: MediaQueryListEvent) {
    prefersDark = e ? e.matches : mq().matches;
  }
  onMount(() => {
    syncMq();
    const m = mq();
    m.addEventListener('change', syncMq);
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && t && t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && !t.isContentEditable) {
        e.preventDefault();
        searchEl?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      m.removeEventListener('change', syncMq);
      window.removeEventListener('keydown', onKey);
    };
  });

  $: appDark = $theme === 'dark' || ($theme === 'auto' && prefersDark);
  $: cutheme = override === 'auto' ? (appDark ? 'dark' : 'light') : override;

  $: q = search.trim().toLowerCase();
  $: students = riskStudents
    .filter((r) => (sevFilter === 'todos' ? true : r.severity === sevFilter))
    .filter((r) => (q ? `${r.name} ${r.salon}`.toLowerCase().includes(q) : true));
  $: open = tasks.filter((t) => !t.done).length;

  $: stateLine = `tema=${cutheme} · pendientes=${open}/${tasks.length} · filtro=${sevFilter} · datos demo`;
</script>

<div class={`e cutheme-${cutheme}`}>
  <aside class="side">
    <div class="usercard"><span class="logo">SB</span><span class="u-t"><strong>San Bartolomé</strong><small>Sede central · {year}</small></span><span class="collapse" aria-hidden="true">|←</span></div>
    <label class="sidesearch"><Icon name="search" /><input type="search" placeholder="Search" bind:value={search} /><kbd title="Pulsa / para buscar">/</kbd></label>
    <nav class="vnav" aria-label="Gestión">
      <p class="nav-cap">Gestionar</p>
      <button type="button" class="active"><Icon name="book" /> Resumen</button>
      <button type="button"><Icon name="users" /> Docentes</button>
      <button type="button"><Icon name="list" /> Estudiantes</button>
      <button type="button"><Icon name="calendar" /> Horario <em class="flag">{open}</em></button>
      <button type="button"><Icon name="warn" /> Llamados</button>
    </nav>
    <div class="yearbox">
      <small>Año lectivo</small>
      <div class="stepper"><button type="button" on:click={() => (year -= 1)} aria-label="Año anterior">‹</button><strong>{year}</strong><button type="button" on:click={() => (year += 1)} aria-label="Año siguiente">›</button></div>
      <div class="themeseg" role="group" aria-label="Tema del prototipo">
        <button type="button" class:on={override === 'auto'} on:click={() => (override = 'auto')}>Auto</button>
        <button type="button" class:on={override === 'light'} on:click={() => (override = 'light')}>Claro</button>
        <button type="button" class:on={override === 'dark'} on:click={() => (override = 'dark')}>Oscuro</button>
      </div>
    </div>
    <div class="user"><span class="avatar">RC</span><span><strong>Rectoría</strong><small>Administración</small></span></div>
  </aside>

  <div class="body">
    <main class="main">
      <div class="pagehead">
      <p class="eyebrow">Consola del colegio</p>
      <h1 class="title">Lunes 18</h1>
      <div class="controlbar">
      <div class="tabs" role="tablist" aria-label="Vistas"><button type="button" role="tab" aria-selected="true" class="on">Overview</button><button type="button" role="tab" aria-selected="false">Salones</button><button type="button" role="tab" aria-selected="false">Historial</button></div>
      <div class="controls">
          <label class="search"><Icon name="search" /><input type="search" placeholder="Search" bind:value={search} bind:this={searchEl} /><kbd title="Pulsa / para buscar">/</kbd></label>
          <button type="button" class="pillbtn">Periodo: 3 ▾</button>
          <button type="button" class="pillbtn" on:click={() => (override = override === 'light' ? 'dark' : override === 'dark' ? 'auto' : 'light')} title="Cambiar tema del prototipo">Tema: {override === 'auto' ? 'Auto' : override === 'light' ? 'Claro' : 'Oscuro'}</button>
      </div>
      </div>
      </div>
      <div class="content">
      <div class="feed">
      <div class="sheet">

      <p class="cat-kicker">Atención pendiente</p>
      <div class="alerts">
        <div class="stat">
          <div class="stat-in"><small>Salones sin horario</small><strong>{attention.noSchedule.count}</strong><span>{attention.noSchedule.detail}</span></div>
          <div class="stat-ft"><span class="ibadge"><Icon name="calendar" /></span> Requiere armado manual <button type="button" class="mini-act">Armar</button></div>
        </div>
        <div class="stat">
          <div class="stat-in"><small>Riesgo de asistencia</small><strong>{attention.risk.count}</strong><span>{attention.risk.detail}</span></div>
          <div class="stat-ft"><span class="ibadge"><Icon name="warn" /></span> 2 bajo el umbral de 85% <button type="button" class="mini-act">Ver lista</button></div>
        </div>
        <div class="stat">
          <div class="stat-in"><small>Graves esta semana</small><strong>{attention.graves.count}</strong><span>{attention.graves.detail}</span></div>
          <div class="stat-ft"><span class="ibadge"><Icon name="warn" /></span> Exigen llamada al acudiente <button type="button" class="mini-act">Revisar</button></div>
        </div>
      </div>

      <p class="cat-kicker">Estado general del colegio</p>
      <div class="gfx">
        <div class="panel wide">
          <div class="panel-head"><h2>Tendencia de asistencia</h2></div>
          <svg class="trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tendencia de asistencia demo">
            {#each trendMonths as m, i}
              <line x1={xOf(i)} x2={xOf(i)} y1={PADT} y2={H - PADB} class="vgrid" />
            {/each}
            {#each [70, 80, 90, 100] as g}
              <text x={PADL - 6} y={yOf(g) + 4} class="ylab" text-anchor="end">{g}</text>
            {/each}
            <polyline points={prevLine} class="prev" />
            <polyline points={line} class="line" />
            {#each trend as v, i}
              <circle cx={xOf(i)} cy={yOf(v)} r="5.5" class="dot" />
              <text x={xOf(i)} y={H - 8} class="xlab" text-anchor="middle">{trendMonths[i]}</text>
            {/each}
            <g class="tip" transform={`translate(${xOf(7) - 118},${yOf(78) - 58})`}>
              <rect width="112" height="44" rx="10" />
              <text x="12" y="19">Asistencia: 78</text>
              <text x="12" y="35">Tasa: 78%</text>
            </g>
          </svg>
          <div class="legend"><span><i class="sw solid"></i>Este periodo</span><span><i class="sw dotted"></i>Periodo anterior</span></div>
          <p class="insight"><span class="ibadge"><Icon name="check" /></span> −2,1 pts vs semana anterior · el valle coincide con la semana de festivos</p>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Foto de asistencia</h2><span class="caps">7 días</span></div>
          <div class="donut" role="img" aria-label="Dona de asistencia demo"><span>78%</span></div>
          <div class="legend pills">
            <span><i class="sw k-present"></i>Presentes</span>
            <span><i class="sw k-absent"></i>Inasistencias</span>
            <span><i class="sw k-evasion"></i>Evasiones</span>
            <span><i class="sw k-late"></i>Atrasos</span>
          </div>
        </div>
      </div>
      <div class="gfx">
        <div class="panel">
          <div class="panel-head"><h2>Llamados por gravedad</h2><span class="caps">7 días</span></div>
          <div class="bars">{#each gravityBars as b}<div class="bar-row"><span>{b.key}</span><div class="track"><span class={`fill sev-${b.key}`} style={`width:${b.value * 9}%`}></span></div><strong>{b.value}</strong></div>{/each}</div>
          <div class="legend pills"><span><i class="sw k-grave"></i>Grave</span><span><i class="sw k-medio"></i>Medio</span><span><i class="sw k-leve"></i>Leve</span></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Tasa por salón</h2><span class="caps">con lista pasada</span></div>
          <div class="salonbars">
            {#each rated as s}
              <div class="srow"><span class="slabel">{s.label}</span><div class="track"><span class={`fill ${s.rate < 85 ? 'bad' : 'ok'}`} style={`width:${s.rate}%`}></span></div><strong>{s.rate}%</strong></div>
            {/each}
          </div>
          <p class="insight"><span class="ibadge"><Icon name="pin" /></span> 9-2 y 10-1 bajo el umbral de 85%</p>
        </div>
      </div>

      <p class="cat-kicker">Estudiantes en riesgo</p>
      <div class="panel">
        <div class="panel-head">
          <div class="chips" role="tablist" aria-label="Gravedad">
            {#each SEVS as f}
              <button type="button" role="tab" aria-selected={sevFilter === f} class:on={sevFilter === f} on:click={() => (sevFilter = f)}>{f}</button>
            {/each}
          </div>
          <span class="count">{students.length} en lista</span>
        </div>
        <ul class="prow-head" aria-hidden="true"><li><span>Nº</span><span class="widespan">Estudiante</span><span>Salón</span><span>Inasist.</span><span>Evas.</span><span>Tasa</span><span>Gravedad</span></li></ul>
        <ul class="prows">
          {#each students as r, i}
            <li>
              <button type="button" class="prow" class:on={selectedStudent === r.id} on:click={() => (selectedStudent = selectedStudent === r.id ? null : r.id)}>
                <span class="rank">{String(i + 1).padStart(2, '0')}</span>
                <span class="avatar">{initials(r.name)}</span>
                <span class="who"><strong>{r.name}</strong><small>{r.trend}</small></span>
                <span class="salonpill">{r.salon}</span>
                <span class="countchip">{r.absences} inasist.</span>
                <span class="countchip" class:alert={r.evasions > 0}>{r.evasions} evas.</span>
                <span class="rateblock">
                  <strong class:low={r.rate < 85}>{r.rate}%</strong>
                  <span class="rbar"><span class:low={r.rate < 85} style={`width:${r.rate}%`}></span></span>
                  <small>{r.rate - 85 >= 0 ? `+${r.rate - 85} sobre 85%` : `${r.rate - 85} del 85%`}</small>
                </span>
                <span class={`sev ${r.severity}`}><i></i>{r.severity}</span>
              </button>
              {#if selectedStudent === r.id}
                <div class="detail-box">
                  <span><strong>Ficha:</strong> {r.name} · Salón {r.salon} · {year} · {r.rate}% asistencia</span>
                  <span class="sp"></span>
                  <button type="button">Abrir ficha</button>
                  <button type="button" class="primary">Llamar acudiente</button>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      </div>

      <p class="cat-kicker">Horario de hoy</p>
      <div class="panel">
        <div class="weekstrip" aria-label="Semana">
          {#each WEEK as [w, d, on]}
            <span class:today={on}><small>{w}</small><strong>{d}</strong></span>
          {/each}
          <button type="button" class="link">Ver semana</button>
        </div>
        <ol class="timeline">
          {#each hoursToday as h}
            <li class={h.status}>
              <span class="rail"><span class="pip"></span></span>
              <div class="tblock">
                <div><strong>{h.time}</strong><span class="subj">{h.subject}</span></div>
                <div class="facts"><span class="factpill"><Icon name="list" /> Salón {h.salon} · {year}</span><span><Icon name="users" /> Prof. {h.docente}</span><span><Icon name="pin" /> Aula {h.room}</span></div>
              </div>
              <span class={`st ${h.status}`}>{h.status === 'done' ? 'Finalizada ✓' : h.status === 'now' ? 'Ahora' : 'Siguiente'}</span>
              {#if h.status !== 'done'}<button type="button">Abrir lista</button>{/if}
            </li>
          {/each}
        </ol>
      </div>

      <p class="state">Estado del prototipo: {stateLine}</p>
      </div>
      </div>
      <aside class="railp" aria-label="Pendientes">
      <div class="rail-head"><h2>Pendientes</h2><span class="pill">{open} abiertos</span></div>
      <ul class="todos">
        {#each tasks as t}
          <li class:done={t.done}>
            <button type="button" class="box" role="checkbox" aria-checked={t.done} aria-label={t.title} on:click={() => (t.done = !t.done)}>
              {#if t.done}<Icon name="check" />{/if}
            </button>
            <span class={`sev ${t.sev}`}><i></i>{t.sev}</span>
            <div class="todo-t"><strong>{t.title}</strong><small>{t.meta}</small></div>
            {#if !t.done}<button type="button" class="go">{t.action}</button>{/if}
          </li>
        {/each}
      </ul>
      <p class="fine">Toca el círculo para dar por hecho un pendiente (solo memoria demo).</p>
    </aside>
      </div>
    </main>
  </div>
</div>

<style>
  /* Reference skin: warm cream, flat hairline cards, ink-500 titles.
     Dark twin inverts the lightness channel, hue/saturation held. */
  .e { min-height: 100vh; display: grid; grid-template-columns: 272px 1fr; }
  .cutheme-light {
    color-scheme: light;
    --bg: hsl(36, 9%, 94%); --surface: hsl(0, 0%, 100%); --surface-2: hsl(40, 12%, 97%);
    --tint: hsl(45, 8%, 91%);
    --card: hsl(44, 20%, 95.5%); --rail: hsl(0, 0%, 100%);
    --ink: hsl(45, 9%, 12%); --ink-soft: hsl(40, 6%, 32%); --muted: hsl(60, 2%, 60%); --line: hsl(45, 10%, 88%);
    --accent: hsl(28, 40%, 52%); --accent-ink: hsl(0, 0%, 100%); --accent-soft: hsl(28, 45%, 93%);
    --coral: hsl(343, 68%, 48%);
    --g-leve-bg: hsl(203, 70%, 91%); --g-leve-ink: hsl(198, 72%, 45%);
    --g-medio-bg: hsl(46, 75%, 87%); --g-medio-ink: hsl(45, 85%, 31%);
    --g-grave-bg: hsl(6, 70%, 91%); --g-grave-ink: hsl(0, 60%, 51%);
    --m-present: hsl(45, 9%, 12%); --m-absent: hsl(45, 8%, 84%); --m-evasion: hsl(60, 2%, 68%); --m-late: hsl(40, 3%, 53%);
    --shadow: 0 1px 2px hsla(45, 9%, 12%, 0.05);
  }
  .cutheme-dark {
    color-scheme: dark;
    --bg: hsl(230, 10%, 17%); --surface: hsl(230, 12%, 11%); --surface-2: hsl(230, 10%, 14%);
    --tint: hsl(230, 10%, 18%);
    --card: hsl(230, 10%, 21%); --rail: hsl(230, 10%, 21%);
    --ink: hsl(60, 25%, 95%); --ink-soft: hsl(45, 8%, 76%); --muted: hsl(45, 6%, 60%); --line: hsl(45, 6%, 26%);
    --accent: hsl(31, 95%, 68%); --accent-ink: hsl(30, 45%, 8%); --accent-soft: hsl(30, 40%, 18%);
    --coral: hsl(330, 100%, 73%);
    --g-leve-bg: hsl(195, 55%, 20%); --g-leve-ink: hsl(190, 100%, 80%);
    --g-medio-bg: hsl(55, 55%, 20%); --g-medio-ink: hsl(60, 95%, 77%);
    --g-grave-bg: hsl(355, 55%, 22%); --g-grave-ink: hsl(0, 100%, 71%);
    --m-present: hsl(60, 25%, 95%); --m-absent: hsl(45, 5%, 34%); --m-evasion: hsl(45, 5%, 45%); --m-late: hsl(45, 5%, 58%);
    --shadow: 0 10px 28px hsla(0, 0%, 0%, 0.45);
  }
  .e { background: var(--bg); color: var(--ink); }
  .e button { color: inherit; }

  /* Sidebar (reference: user card, ⌘F search, section caps, bordered active) */
  .side { background: var(--bg); padding: 18px 14px; display: flex; flex-direction: column; gap: 14px; position: sticky; top: 0; height: 100vh; }
  .usercard { display: flex; gap: 10px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; box-shadow: var(--shadow); }
  .logo { width: 36px; height: 36px; flex: none; background: var(--ink); color: var(--bg); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.72rem; }
  .u-t { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; } .u-t strong { font-size: 0.82rem; white-space: nowrap; } .u-t small { color: var(--muted); font-size: 0.7rem; }
  .collapse { margin-left: auto; color: var(--muted); font-size: 0.75rem; }
  .sidesearch, .search { display: flex; gap: 8px; align-items: center; background: var(--tint); border: 1px solid transparent; border-radius: 10px; padding: 9px 12px; color: var(--muted); }
  .sidesearch input, .search input { border: 0; background: none; outline: none; width: 100%; color: var(--ink); font-size: 0.84rem; }
  kbd { font-family: inherit; font-size: 0.7rem; color: var(--muted); background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 1px 6px; }
  .vnav { display: flex; flex-direction: column; gap: 2px; } .nav-cap { color: var(--ink-soft); font-size: 0.78rem; font-weight: 500; padding: 0 12px 6px; }
  .vnav button { display: flex; gap: 10px; align-items: center; padding: 9px 12px; border-radius: 10px; color: var(--ink-soft); font-weight: 500; font-size: 0.86rem; border: 1px solid transparent; }
  .vnav button.active { background: var(--surface); border-color: var(--line); color: var(--ink); box-shadow: var(--shadow); }
  .vnav em { margin-left: auto; font-style: normal; font-size: 0.7rem; background: var(--tint); border-radius: 999px; padding: 1px 8px; color: var(--muted); }
  .vnav em.flag { background: var(--accent-soft); color: var(--accent); }
  .yearbox { background: transparent; border: 0; border-top: 1px solid var(--line); border-radius: 0; padding: 14px 4px 0; } .yearbox small { color: var(--muted); font-weight: 600; font-size: 0.7rem; }
  .stepper { display: flex; align-items: center; gap: 14px; margin: 6px 0 10px; } .stepper strong { font-size: 1.3rem; font-weight: 600; } .stepper button { width: 34px; height: 34px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface-2); }
  .themeseg { display: grid; grid-template-columns: repeat(3, 1fr); background: var(--tint); border-radius: 10px; padding: 3px; gap: 2px; }
  .themeseg button { font-size: 0.72rem; font-weight: 600; color: var(--muted); border-radius: 8px; padding: 7px 4px; } .themeseg button.on { background: var(--surface); color: var(--ink); box-shadow: var(--shadow); }
  .user { margin-top: auto; display: flex; gap: 10px; align-items: center; border-top: 1px solid var(--line); padding-top: 12px; } .avatar { width: 34px; height: 34px; border-radius: 999px; background: var(--tint); color: var(--ink-soft); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.72rem; } .user small { color: var(--muted); font-size: 0.72rem; } .user strong { font-size: 0.84rem; }

  .body { display: block; }
  .content { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 20px; align-items: start; }
  .feed { min-width: 0; }
  .main { padding: 26px 28px 0; margin: 0 auto; max-width: 1400px; min-width: 0; }
  .sheet { background: var(--surface); border: 1px solid var(--line); border-bottom: 0; border-radius: 24px 24px 0 0; padding: 24px 26px 130px; margin-top: 4px; }
  .sheet .panel, .sheet .stat, .sheet .prow { box-shadow: none; background: var(--card); }
  .eyebrow { color: var(--muted); font-size: 0.85rem; margin-bottom: 2px; }
  .title { font-size: 2.6rem; letter-spacing: -0.03em; font-weight: 550; line-height: 1.05; margin-bottom: 12px; }
  .controlbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 12px; }
  .controls { display: flex; gap: 8px; align-items: center; }
  .search { background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); min-width: 230px; min-height: 44px; }
  .pillbtn { min-height: 44px; }
  .pillbtn { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 9px 14px; font-size: 0.82rem; font-weight: 500; box-shadow: var(--shadow); white-space: nowrap; }
  .tabs { display: inline-flex; gap: 2px; background: var(--tint); border: 1px solid var(--line); border-radius: 12px; padding: 3px; margin-bottom: 12px; }
  .tabs button { padding: 8px 20px; color: var(--muted); font-size: 0.84rem; font-weight: 600; border-radius: 9px; } .tabs button:hover { color: var(--ink); } .tabs button.on { background: var(--surface); color: var(--ink); box-shadow: var(--shadow); }

  .cat-kicker { color: var(--ink-soft); font-size: 0.84rem; font-weight: 500; margin: 22px 0 10px; }
  .alerts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .stat { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); overflow: hidden; }
  .stat-in { padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 2px; } .stat-in small { color: var(--muted); font-size: 0.74rem; } .stat-in strong { font-size: 1.6rem; font-weight: 550; letter-spacing: -0.02em; } .stat-in span { color: var(--muted); font-size: 0.78rem; }
  .stat-ft { display: flex; gap: 8px; align-items: center; border-top: 1px solid var(--line); padding: 10px 18px; color: var(--ink-soft); font-size: 0.76rem; } .mini-act { margin-left: auto; background: var(--accent); color: var(--accent-ink); font-weight: 700; font-size: 0.74rem; border-radius: 999px; padding: 7px 14px; white-space: nowrap; }

  .gfx { display: grid; grid-template-columns: 1.5fr 1fr; gap: 10px; margin-bottom: 10px; }
  .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); padding: 20px 22px; min-width: 0; }
  .panel-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 14px; } .panel-head h2 { font-size: 0.95rem; font-weight: 550; } .caps { color: var(--muted); font-size: 0.76rem; } .count { color: var(--muted); font-size: 0.78rem; }
  .link { color: var(--ink-soft); font-weight: 500; font-size: 0.8rem; }

  .trend { width: 100%; height: auto; display: block; }
  .trend .vgrid { stroke: var(--line); stroke-width: 1; }
  .trend .ylab, .trend .xlab { fill: var(--muted); font-size: 10px; }
  .trend .prev { fill: none; stroke: var(--muted); opacity: 0.45; stroke-width: 1.5; stroke-dasharray: 3 4; }
  .trend .line { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .trend .dot { fill: var(--surface); stroke: var(--coral); stroke-width: 2.5; }
  .trend .tip rect { fill: var(--ink); } .trend .tip text { fill: var(--bg); font-size: 11px; font-weight: 600; }
  .legend { display: flex; gap: 14px; margin-top: 10px; color: var(--muted); font-size: 0.76rem; } .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .sw { width: 9px; height: 9px; border-radius: 999px; display: inline-block; } .sw.solid { background: var(--accent); } .sw.dotted { background: transparent; border: 1.5px dashed var(--muted); }
  .sw.k-present { background: var(--m-present); } .sw.k-absent { background: var(--m-absent); } .sw.k-evasion { background: var(--m-evasion); } .sw.k-late { background: var(--m-late); }
  .sw.k-grave { background: var(--g-grave-ink); } .sw.k-medio { background: var(--g-medio-ink); } .sw.k-leve { background: var(--g-leve-ink); }
  .legend.pills { margin-top: 14px; flex-wrap: wrap; gap: 8px; } .legend.pills span { border: 1px solid var(--line); border-radius: 999px; padding: 4px 12px 4px 8px; background: var(--surface-2); }
  .insight { display: flex; gap: 8px; align-items: flex-start; color: var(--ink-soft); font-size: 0.78rem; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
  .ibadge { width: 26px; height: 26px; border-radius: 8px; background: var(--tint); color: var(--ink-soft); display: inline-flex; align-items: center; justify-content: center; flex: none; }
  .ibadge :global(svg) { width: 15px; height: 15px; }

  .donut { width: 170px; height: 170px; border-radius: 999px; margin: 6px auto 4px; position: relative;
    background: conic-gradient(var(--m-present) 0 78%, var(--m-absent) 78% 87%, var(--m-evasion) 87% 92%, var(--m-late) 92% 100%); }
  .donut::after { content: ''; position: absolute; inset: 30px; background: var(--surface); border-radius: 999px; }
  .donut span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 1; font-size: 1.5rem; font-weight: 550; letter-spacing: -0.02em; }

  .bars { display: flex; flex-direction: column; gap: 14px; margin: 8px 0 4px; } .bar-row { display: grid; grid-template-columns: 52px 1fr 24px; gap: 10px; align-items: center; font-size: 0.82rem; color: var(--ink-soft); }
  .track { height: 9px; border-radius: 999px; background: var(--tint); overflow: hidden; } .fill { display: block; height: 100%; border-radius: 999px; }
  .fill.sev-Leve { background: var(--g-leve-ink); } .fill.sev-Medio { background: var(--g-medio-ink); } .fill.sev-Grave { background: var(--g-grave-ink); }
  .salonbars { display: flex; flex-direction: column; gap: 11px; margin-top: 4px; } .srow { display: grid; grid-template-columns: 36px 1fr 44px; gap: 10px; align-items: center; font-size: 0.82rem; }
  .slabel { font-weight: 600; } .srow strong { text-align: right; font-variant-numeric: tabular-nums; font-weight: 550; }
  .fill.ok { background: var(--ink); } .fill.bad { background: var(--accent); }

  .chips { display: flex; gap: 6px; } .chips button { border-radius: 999px; padding: 7px 14px; font-weight: 500; font-size: 0.78rem; background: transparent; border: 1px solid var(--line); color: var(--muted); text-transform: capitalize; }
  .chips button.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
  .prow-head { list-style: none; margin: 0 0 4px; padding: 0; } .prow-head li { display: grid; grid-template-columns: 34px 40px minmax(0, 1fr) 92px 92px 84px 132px 104px; gap: 10px; padding: 0 12px; color: var(--muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; } .prow-head li .widespan { grid-column: span 2; }
  .prows { list-style: none; margin: 0; padding: 0; }
  .prow { width: 100%; display: grid; grid-template-columns: 34px 40px minmax(0, 1fr) 92px 92px 84px 132px 104px; gap: 10px; align-items: center; text-align: left; border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; margin-bottom: 8px; background: var(--surface); box-shadow: var(--shadow); }
  .prow.on { border-color: var(--ink); }
  .rank { background: var(--accent-soft); color: var(--accent); border-radius: 8px; font-size: 0.7rem; font-weight: 700; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
  .prow .avatar { width: 36px; height: 36px; border-radius: 999px; border: 1px solid var(--ink); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.7rem; }
  .who { display: flex; flex-direction: column; min-width: 0; } .who strong { font-size: 0.86rem; } .who small { color: var(--muted); font-size: 0.72rem; }
  .salonpill { background: var(--tint); border-radius: 999px; padding: 5px 12px; font-size: 0.74rem; font-weight: 600; color: var(--ink-soft); white-space: nowrap; }
  .countchip { background: var(--tint); border-radius: 999px; padding: 5px 12px; font-size: 0.74rem; font-weight: 600; color: var(--ink-soft); white-space: nowrap; }
  .countchip.alert { background: var(--g-grave-bg); color: var(--g-grave-ink); }
  .rateblock { display: flex; flex-direction: column; gap: 3px; } .rateblock strong { font-variant-numeric: tabular-nums; font-size: 0.92rem; } .rateblock strong.low { color: var(--g-grave-ink); }
  .rbar { height: 5px; border-radius: 999px; background: var(--tint); overflow: hidden; } .rbar span { display: block; height: 100%; background: var(--ink); border-radius: 999px; } .rbar span.low { background: var(--g-grave-ink); }
  .rateblock small { color: var(--muted); font-size: 0.68rem; white-space: nowrap; }
  .prow .who strong { font-size: 0.86rem; }
  .sev { display: inline-flex; align-items: center; gap: 6px; font-size: 0.7rem; font-weight: 600; text-transform: capitalize; border: 1px solid var(--line); border-radius: 999px; padding: 5px 12px 5px 8px; background: var(--surface-2); white-space: nowrap; }
  .sev.leve { background: var(--g-leve-bg); color: var(--g-leve-ink); } .sev.medio { background: var(--g-medio-bg); color: var(--g-medio-ink); } .sev.grave { background: var(--g-grave-bg); color: var(--g-grave-ink); }
  .sev i { width: 8px; height: 8px; border-radius: 999px; } .sev.leve i { background: var(--g-leve-ink); } .sev.medio i { background: var(--g-medio-ink); } .sev.grave i { background: var(--g-grave-ink); }
  .detail-box { display: flex; gap: 10px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; font-size: 0.8rem; margin: -2px 0 8px; }
  .detail-box .sp { flex: 1; } .detail-box button { border-radius: 9px; padding: 9px 14px; border: 1px solid var(--line); background: var(--surface); font-weight: 600; font-size: 0.78rem; } .detail-box .primary { background: var(--ink); color: var(--bg); border: 0; }

  .weekstrip { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
  .weekstrip span { background: var(--tint); border: 1px solid transparent; border-radius: 10px; padding: 7px 12px; display: flex; flex-direction: column; align-items: center; min-width: 56px; } .weekstrip small { color: var(--muted); font-size: 0.68rem; } .weekstrip strong { font-size: 1rem; font-weight: 600; }
  .weekstrip span.today { background: var(--ink); color: var(--bg); } .weekstrip span.today small { color: var(--bg); opacity: 0.65; }
  .weekstrip .link { margin-left: auto; }
  .timeline { list-style: none; margin: 6px 0 0; padding: 0; }
  .timeline li { display: grid; grid-template-columns: 24px 1fr auto auto; gap: 12px; align-items: center; padding: 13px 4px; border-top: 1px solid var(--line); }
  .trail, .rail { display: flex; justify-content: center; align-self: stretch; position: relative; } .rail::before { content: ''; position: absolute; top: 0; bottom: 0; width: 2px; background: var(--line); }
  .pip { width: 10px; height: 10px; border-radius: 999px; background: var(--surface); border: 2px solid var(--muted); margin-top: 4px; z-index: 1; }
  li.done .pip { background: var(--ink); border-color: var(--ink); } li.now .pip { background: var(--accent); border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
  .tblock { display: flex; flex-direction: column; gap: 5px; min-width: 0; } .tblock strong { font-size: 0.9rem; font-variant-numeric: tabular-nums; } .subj { font-weight: 600; font-size: 0.88rem; margin-left: 8px; }
  .facts { display: flex; flex-wrap: wrap; gap: 6px 8px; color: var(--ink-soft); font-size: 0.74rem; } .facts span { display: inline-flex; align-items: center; gap: 5px; }
  .factpill { background: var(--tint); border-radius: 999px; padding: 4px 11px; font-weight: 600; }
  li.done { opacity: 0.6; }
  .st { font-size: 0.68rem; font-weight: 600; border-radius: 999px; padding: 5px 12px; white-space: nowrap; background: var(--tint); color: var(--ink-soft); }
  .st.done { background: var(--tint); } .st.now { background: var(--ink); color: var(--bg); } .st.next { background: var(--surface-2); border: 1px solid var(--line); }
  .timeline button { border-radius: 9px; padding: 9px 14px; border: 1px solid var(--line); background: var(--surface); font-weight: 600; font-size: 0.78rem; white-space: nowrap; box-shadow: var(--shadow); }

  .railp { position: sticky; top: 16px; background: var(--rail); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); padding: 20px; align-self: start; max-height: calc(100vh - 32px); overflow-y: auto; }
  .rail-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; } .rail-head h2 { font-size: 0.95rem; font-weight: 550; }
  .pill { background: var(--tint); color: var(--ink-soft); font-size: 0.72rem; font-weight: 600; border-radius: 999px; padding: 4px 11px; }
  .todos { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; }
  .todos li { display: flex; gap: 10px; align-items: flex-start; padding: 11px 0; border-top: 1px solid var(--line); }
  .todos li:first-child { border-top: 0; }
  .box { flex: none; width: 21px; height: 21px; margin-top: 1px; border-radius: 999px; border: 1.5px solid var(--muted); background: var(--surface); display: flex; align-items: center; justify-content: center; color: var(--bg); }
  li.done .box { background: var(--ink); border-color: var(--ink); }
  .todo-t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; } .todo-t strong { font-size: 0.8rem; font-weight: 550; } .todo-t small { color: var(--muted); font-size: 0.72rem; }
  li.done .todo-t strong { text-decoration: line-through; color: var(--muted); }
  .todos .sev { margin-top: 1px; }
  .go { flex: none; background: var(--surface-2); border: 1px solid var(--line); color: var(--ink); font-weight: 700; font-size: 0.76rem; white-space: nowrap; border-radius: 9px; padding: 8px 14px; }
  .fine { color: var(--muted); font-size: 0.72rem; margin-top: 10px; }
  .state { color: var(--muted); font-size: 0.72rem; margin-top: 14px; }

  @media (max-width: 1220px) { .content { grid-template-columns: 1fr; } .main { padding-right: 26px; } .railp { position: static; margin: 0 0 110px; max-height: none; } }
  @media (max-width: 1020px) { .e { grid-template-columns: 1fr; } .side { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); } .alerts, .gfx { grid-template-columns: 1fr; } .controlbar { flex-direction: column; align-items: stretch; } .title { font-size: 2rem; } .prow, .prow-head li { grid-template-columns: 30px 36px 1fr auto; } .prow .salonpill, .prow .countchip, .prow .rateblock small, .prow-head li span:nth-child(n+3):nth-child(-n+5), .prow-head li span:nth-child(7) { display: none; } }
</style>
