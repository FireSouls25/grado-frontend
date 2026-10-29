<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/ui/TopBar.svelte';
  import TopActions from '$lib/shell/TopActions.svelte';
  import AdminShell from './AdminShell.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorState from '$lib/ui/ErrorState.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { notify } from '$lib/ui/notice';
  import Icon from '$lib/ui/Icon.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import {
    groupsByYear,
    createStudent,
    createClassGroup,
    classReport,
    warningsRecent,
    teachers,
    listAcademicAlerts,
    type YearGroup,
    type ClassReport,
    type RecentWarning,
    type TeacherSummary
  } from './api';
  import { isMissing, classRoster } from '../teacher/api';
  import type { RosterEntry } from '$lib/api/types';
  import { ApiError } from '$lib/api/types';
  import { guarded, queryParam } from '$lib/nav';
  import { profile } from '$lib/shell/profile';
  import { canManageUsers } from '$lib/access';
  import { mapSettled } from '$lib/async';
  import { exportStudentsWorkbook } from './excel';
  import { foldSearch } from '$lib/search';

  const currentYear = new Date().getFullYear();
  let year = currentYear;
  export let querystring: string = '';

  let groups: YearGroup[] = [];
  let alerted: Set<string> = new Set();
  let alertCounts: Record<string, number> = {};
  let loaded = false;
  let failed = false;
  let loadError: unknown = null;
  let picked: YearGroup | null = null;

  let creating = false;
  let saving = false;
  let feedback = '';
  let form = freshForm();
  let creatingSalon = false;
  let savingSalon = false;
  let salonFeedback = '';
  let salonGrade = '';
  let salonGroup = '';
  let report: ClassReport | null = null;
  let reportLoading = false;
  let warns: RecentWarning[] = [];
  let teacherList: TeacherSummary[] = [];
  let reports: Record<string, ClassReport> = {};
  let rosters: Record<string, RosterEntry[]> = {};
  let reportsDone = false;

  function mergedOf(g: YearGroup) {
    const rep = reports[g.GroupID];
    const known = new Set((rep?.Students ?? []).map((s) => s.StudentID));
    const extra = (rosters[g.GroupID] ?? [])
      .filter((r) => !known.has(r.StudentID))
      .map((r) => ({
        StudentID: r.StudentID,
        Surnames: r.Surnames,
        Names: r.Names,
        Presences: 0,
        Absences: 0,
        Excused: 0,
        Evasions: 0,
        Lates: 0,
        Sessions: 0
      }));
    return [...(rep?.Students ?? []), ...extra];
  }

  function sheetFor(g: YearGroup) {
    return {
      label: g.ClassLabel,
      days: reports[g.GroupID]?.Sessions ?? 0,
      students: mergedOf(g).map((s) => ({
        surnames: s.Surnames,
        names: s.Names,
        presences: s.Presences,
        absences: s.Absences,
        excused: s.Excused,
        evasions: s.Evasions,
        lates: s.Lates,
        sessions: s.Sessions
      }))
    };
  }

  let q2 = '';
  let minAbs = '';
  let minLate = '';
  let fWarn: '' | 'yes' = '';

  function freshGuardian() {
    return { Names: '', DocumentID: '', Phone: '', Occupation: '', Address: '' };
  }

  function freshCondition() {
    return { Has: false, Detail: '' };
  }

  function freshForm() {
    return {
      Names: '',
      Surnames: '',
      ClassID: '',
      DocumentID: '',
      Phone: '',
      Address: '',
      Birthplace: '',
      Birthdate: '',
      Email: '',
      BloodType: '',
      Vision: freshCondition(),
      Hearing: freshCondition(),
      IsNew: false,
      PreviousSchool: '',
      TransferReason: '',
      Mother: freshGuardian(),
      Father: freshGuardian(),
      Caregiver: freshGuardian(),
      LivesWith: '',
      Siblings: [] as { Name: string; ClassID: string }[],
      MedicalReport: '',
      DiversityCondition: '',
      SpecialistReport: freshCondition()
    };
  }

  function addSibling() {
    form.Siblings = [...form.Siblings, { Name: '', ClassID: '' }];
  }

  function removeSibling(i: number) {
    form.Siblings = form.Siblings.filter((_, j) => j !== i);
  }

  function condOf(c: { Has: boolean; Detail: string }) {
    const detail = c.Detail.trim();
    return { Has: c.Has || detail !== '', Detail: detail };
  }

  function guardianOf(g: { Names: string; DocumentID: string; Phone: string; Occupation: string; Address: string }) {
    return {
      Names: g.Names.trim(),
      DocumentID: g.DocumentID.trim(),
      Phone: g.Phone.trim(),
      Occupation: g.Occupation.trim(),
      Address: g.Address.trim()
    };
  }

  async function load() {
    failed = false;
    loadError = null;
    reports = {};
    reportsDone = false;
    try {
      const data = await guarded(() => groupsByYear(year));
      if (data === null) {
        groups = [];
        picked = null;
        loaded = true;
        return;
      }
      groups = [...data].sort((a, b) => a.Grade - b.Grade || a.GroupNo - b.GroupNo);
      picked = null;
      const salon = queryParam(querystring, 'salon');
      if (salon) picked = groups.find((g) => g.GroupID === salon) ?? null;
      loaded = true;
      void loadTeachers();
      void loadReports();
      void loadWarns();
    } catch (err) {
      if (err instanceof ApiError && isMissing(err)) {
        groups = [];
        loaded = true;
      } else {
        loadError = err;
        failed = true;
      }
    }
  }

  async function loadTeachers() {
    try {
      teacherList = (await guarded(() => teachers())) ?? [];
    } catch {
      teacherList = [];
    }
  }

  async function loadReports() {
    const settled = await mapSettled(groups, 5, async (g) => {
      const [rep, ros] = await Promise.all([
        classReport(g.GroupID).catch(() => null),
        classRoster(g.GroupID).catch(() => [] as RosterEntry[])
      ]);
      return { rep, ros };
    });
    const next: Record<string, ClassReport> = {};
    const nextRos: Record<string, RosterEntry[]> = {};
    settled.forEach((result, i) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      if (result.value.rep) next[groups[i].GroupID] = result.value.rep;
      nextRos[groups[i].GroupID] = result.value.ros ?? [];
    });
    reports = next;
    rosters = nextRos;
    reportsDone = true;
  }

  async function loadWarns() {
    try {
      warns = (await warningsRecent(100)) ?? [];
    } catch {
      warns = [];
    }
    try {
      const open = (await guarded(() => listAcademicAlerts())) ?? [];
      alerted = new Set(open.map((a) => a.StudentID));
      const counts: Record<string, number> = {};
      for (const a of open) counts[a.StudentID] = (counts[a.StudentID] ?? 0) + 1;
      alertCounts = counts;
    } catch {
      alerted = new Set();
    }
  }

  function directorOf(label: string): TeacherSummary | null {
    return teacherList.find((t) => t.HomeroomClassID === label) ?? null;
  }

  function changeYear(delta: number) {
    year += delta;
    loaded = false;
    load();
  }

  async function pick(group: YearGroup | null) {
    picked = picked?.GroupID === group?.GroupID ? null : group;
    report = null;
    const current = picked;
    if (!current) return;
    report = reports[current.GroupID] ?? null;
    if (report) {
      reportLoading = false;
      return;
    }
    reportLoading = true;
    try {
      const data = await guarded(() => classReport(current.GroupID));
      report = data ?? null;
      if (report) reports = { ...reports, [current.GroupID]: report };
    } catch {
      report = null;
    } finally {
      reportLoading = false;
    }
  }

  function rateOf(presences: number, sessions: number): number {
    return sessions > 0 ? Math.round((presences / sessions) * 100) : 0;
  }

  $: allRoster = groups.flatMap((g) =>
    mergedOf(g).map((s) => ({
      ...s,
      group: g.ClassLabel,
      rate: rateOf(s.Presences, s.Sessions),
      calls: warns.filter((w) => w.StudentID === s.StudentID).length
    }))
  );
  $: qn = foldSearch(q2.trim());
  $: nAbs = Number(minAbs) || 0;
  $: nLate = Number(minLate) || 0;
  $: visibleRoster = allRoster
    .filter((s) => (picked ? s.group === picked.ClassLabel : true))
    .filter((s) => (qn ? foldSearch(`${s.Surnames} ${s.Names}`).includes(qn) : true))
    .filter((s) => s.Absences >= nAbs && s.Lates >= nLate)
    .filter((s) => (fWarn === 'yes' ? s.calls > 0 : true))
    .sort((a, b) => a.rate - b.rate);
  $: hasAnyStudents = allRoster.length > 0;
  $: loadingReports = groups.length > 0 && !reportsDone;
  $: pickedTotal = (() => {
    const p = picked;
    return p ? allRoster.filter((s) => s.group === p.ClassLabel).length : 0;
  })();
  $: pickedEmpty = picked !== null && !reportLoading && pickedTotal === 0;

  async function saveSalon() {
    salonFeedback = '';
    const grade = Number(salonGrade);
    const groupNo = Number(salonGroup);
    if (!Number.isInteger(grade) || grade < 1 || grade > 11 || !Number.isInteger(groupNo) || groupNo < 1) {
      salonFeedback = $t.admin.formRequired;
      return;
    }
    savingSalon = true;
    try {
      const created = await createClassGroup({ year, grade, groupNo });
      await load();
      picked = groups.find((g) => g.GroupID === created.GroupID) ?? created;
      salonGrade = '';
      salonGroup = '';
      creatingSalon = false;
      notify($t.admin.createdSalon);
    } catch (err) {
      salonFeedback = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      savingSalon = false;
    }
  }

  async function save() {
    feedback = '';
    saving = true;
    try {
      await createStudent({
        Names: form.Names.trim(),
        Surnames: form.Surnames.trim(),
        ClassID: form.ClassID.trim(),
        DocumentID: form.DocumentID.trim(),
        Phone: form.Phone.trim(),
        Address: form.Address.trim(),
        Birthplace: form.Birthplace.trim(),
        Birthdate: form.Birthdate,
        Email: form.Email.trim(),
        BloodType: form.BloodType.trim(),
        Vision: condOf(form.Vision),
        Hearing: condOf(form.Hearing),
        IsNew: form.IsNew,
        PreviousSchool: form.PreviousSchool.trim(),
        TransferReason: form.TransferReason.trim(),
        Mother: guardianOf(form.Mother),
        Father: guardianOf(form.Father),
        Caregiver: guardianOf(form.Caregiver),
        LivesWith: form.LivesWith.trim(),
        Siblings: form.Siblings
          .map((s) => ({ Name: s.Name.trim(), ClassID: s.ClassID.trim() }))
          .filter((s) => s.Name !== '' || s.ClassID !== ''),
        MedicalReport: form.MedicalReport.trim(),
        DiversityCondition: form.DiversityCondition.trim(),
        SpecialistReport: condOf(form.SpecialistReport)
      });
      notify($t.admin.createdStudent);
      form = freshForm();
      creating = false;
      await load();
    } catch (err) {
      feedback = err instanceof ApiError ? err.message : $t.common.loadError;
    } finally {
      saving = false;
    }
  }

  $: roles = $profile.me?.roles ?? [];
  onMount(load);

  let exporting = false;
  let exportOpen = false;
  $: totalExportStudents = groups.reduce((n, g) => n + mergedOf(g).length, 0);
  let exportAll = true;
  let exportPicked: Record<string, boolean> = {};

  function toggleExportGroup(gid: string) {
    exportPicked = { ...exportPicked, [gid]: !exportPicked[gid] };
    if (exportPicked[gid]) exportAll = false;
  }

  function toggleExportAll() {
    exportAll = !exportAll;
    if (exportAll) exportPicked = {};
  }

  async function exportExcel() {
    if (exporting) return;
    const selected = exportAll ? groups : groups.filter((g) => exportPicked[g.GroupID]);
    if (selected.length === 0) {
      notify($t.admin.exportEmpty);
      return;
    }
    exporting = true;
    try {
      const text = {
        daysLabel: $t.admin.daysCalled,
        headers: $t.admin.studentExcelHeaders(),
        totalLabel: $t.admin.exportTotal
      };
      if (exportAll) {
        const sheets = [];
        for (const g of selected) {
          if (mergedOf(g).length === 0) continue;
          sheets.push(sheetFor(g));
        }
        if (sheets.length === 0) {
          notify($t.admin.exportEmpty);
          return;
        }
        await exportStudentsWorkbook(`grado-estudiantes-${year}.xlsx`, sheets, {
          ...text,
          title: $t.admin.studentExcelTitle(year)
        });
      } else {
        for (const g of selected) {
          if (mergedOf(g).length === 0) continue;
          const safe = g.ClassLabel.replace(/[\\/:*?"<>|]/g, '-');
          await exportStudentsWorkbook(`grado-estudiantes-${safe}-${year}.xlsx`, [sheetFor(g)], { ...text, title: `${$t.admin.studentExcelTitle(year)} · ${g.ClassLabel}` });
        }
      }
      exportOpen = false;
      notify($t.admin.exportedOk);
    } finally {
      exporting = false;
    }
  }
</script>

<AdminShell active="estudiantes" {year} onYear={changeYear}>
  <TopBar title={$t.admin.studentsTitle} showBack onBack={() => push('/admin')}>
    <div class="year-stepper">
      <button type="button" class="btn btn-sm" on:click={() => changeYear(-1)} aria-label={$t.a11y.prevYear}><Icon name="back" /></button>
      <strong>{year}</strong>
      <button type="button" class="btn btn-sm" on:click={() => changeYear(1)} aria-label={$t.a11y.nextYear}><Icon name="next" /></button>
    </div>
    <button type="button" class="btn" on:click={() => push('/admin/estudiantes/historial')}>
      {$t.troll.shistory.action}
    </button>
    <button type="button" class="btn" on:click={() => (exportOpen = !exportOpen)} aria-expanded={exportOpen}>
      {$t.admin.exportExcel}
    </button>
    {#if canManageUsers(roles)}
      <button type="button" class="btn" on:click={() => { creatingSalon = true; salonFeedback = ''; }}>
        <Icon name="plus" /> {$t.admin.newSalon}
      </button>
    {/if}
    <button type="button" class="btn btn-primary" on:click={() => { creating = true; feedback = ''; }}>
      <Icon name="plus" /> {$t.admin.newStudent}
    </button>
    <TopActions />
  </TopBar>

  <div class="sheet">
    <Sheet open={exportOpen} title={$t.admin.exportExcel} onClose={() => (exportOpen = false)}>
      <p class="muted">{$t.admin.exportPickHint}</p>
      <ul class="xlist">
        <li>
          <label class="xrow">
            <input type="checkbox" checked={exportAll} on:change={toggleExportAll} />
            <span class="xmain"><strong>{$t.admin.exportGeneral}</strong><small>{$t.admin.exportGeneralHint}</small></span>
            <span class="xcount">{$t.admin.groupStudents(totalExportStudents)}</span>
          </label>
        </li>
        {#each groups as g (g.GroupID)}
          <li>
            <label class="xrow">
              <input type="checkbox" checked={exportAll || !!exportPicked[g.GroupID]} disabled={exportAll} on:change={() => toggleExportGroup(g.GroupID)} />
              <span class="xmain"><strong>{g.ClassLabel}</strong></span>
              <span class="xcount">{$t.admin.groupStudents(mergedOf(g).length)}</span>
            </label>
          </li>
        {/each}
      </ul>
      <div class="form-actions">
        <button type="button" class="btn" on:click={() => (exportOpen = false)}>{$t.common.cancel}</button>
        <button type="button" class="btn btn-primary" disabled={exporting} on:click={exportExcel}>
          {exporting ? $t.common.retrying : $t.admin.exportExcelGo}
        </button>
      </div>
    </Sheet>

    {#if failed}
      <ErrorState error={loadError} onRetry={load} />
    {:else if !loaded}
      <EmptyState icon="list" title={$t.admin.loadingGroups} />
    {:else if groups.length === 0}
      <EmptyState
        icon="users"
        title={$t.admin.noGroupsYear(year)}
        body={$t.admin.noGroupsYearBody}
      />
    {:else}
      <section class="salons-section" aria-label={$t.admin.groupsTitle}>
        <div class="salons-head">
          <h2>{$t.admin.groupsTitle} ({groups.length})</h2>
          {#if picked}
            <button type="button" class="btn btn-sm" on:click={() => (picked = null)}>
              {$t.admin.globalRoster}
            </button>
          {/if}
        </div>
        <div class="salonlist" role="group" aria-label={$t.admin.studentsTitle}>
          {#each groups as g (g.GroupID)}
            {@const dir = directorOf(g.ClassLabel)}
            {@const known = g.GroupID in reports}
            <button
              type="button"
              class="saloncard"
              class:active={picked?.GroupID === g.GroupID}
              aria-pressed={picked?.GroupID === g.GroupID}
              on:click={() => pick(g)}
            >
              <div class="sc-top">
                <strong>{g.ClassLabel}</strong>
                <span class="sc-count">{known ? mergedOf(g).length : '—'}</span>
              </div>
              <small>{dir ? `${dir.Surnames} ${dir.Names}`.trim() : $t.admin.noDirector}</small>
            </button>
          {/each}
        </div>
      </section>

      <div class="filters" role="group" aria-label={$t.admin.reportTitle}>
        <label class="search">
          <span class="cap">{$t.admin.studentSearch}</span>
          <div class="search-box">
            <Icon name="search" />
            <input type="search" placeholder={$t.admin.studentSearch} aria-label={$t.admin.studentSearch} bind:value={q2} />
          </div>
        </label>
        <label>{$t.admin.minAbsences}<input type="number" min="0" inputmode="numeric" bind:value={minAbs} /></label>
        <label>{$t.admin.minLates}<input type="number" min="0" inputmode="numeric" bind:value={minLate} /></label>
        <Dropdown
          label={$t.admin.warnFilter}
          value={fWarn}
          options={[
            { value: '', label: $t.admin.warnAny },
            { value: 'yes', label: $t.admin.warnWith }
          ]}
          on:select={(e) => (fWarn = e.detail === 'yes' ? 'yes' : '')}
        />
        <span class="count" role="status">{$t.admin.rosterCount(visibleRoster.length)}</span>
      </div>

      <section class="card" aria-label={$t.admin.reportTitle}>
        <div class="card-head">
          <h2>{picked ? $t.admin.groupDetailTitle(picked.ClassLabel, picked.SchoolYear) : $t.admin.globalRoster}</h2>
          {#if picked && report}<span class="muted">{$t.admin.reportSessions(report.Sessions)}</span>{/if}
        </div>
        {#if loadingReports}
          <p class="muted">{$t.admin.loadingRoster}</p>
        {:else if picked && reportLoading}
          <p class="muted">{$t.admin.loadingGroups}</p>
        {:else if pickedEmpty}
          <EmptyState icon="users" title={$t.admin.groupEmptyTitle} body={$t.admin.groupEmptyBody} />
        {:else if visibleRoster.length === 0}
          <EmptyState icon="list" title={hasAnyStudents ? $t.admin.rosterEmptySearch : $t.admin.reportEmpty} />
        {:else}
          <div class="table-wrap">
            <div class="colhead" aria-hidden="true">
              <span>{$t.admin.colStudent}</span>
              <span class="num-col">{$t.admin.colAbsences}</span>
              <span class="num-col">{$t.admin.colPermission}</span>
              <span class="num-col">{$t.admin.colEvasions}</span>
              <span class="num-col">{$t.admin.markLate}</span>
              <span class="num-col">{$t.admin.colRate}</span>
              <span class="act-col">{$t.a11y.actions}</span>
            </div>
            <ul class="ledger">
              {#each visibleRoster as s (s.StudentID + s.group)}
                <li class="stu-row">
                  <div class="who">
                    <div class="namerow">
                      <button
                        type="button"
                        class="name-btn"
                        on:click={() => push(`/admin/estudiantes/${encodeURIComponent(s.StudentID)}/resumen`)}
                      >
                        <strong>{s.Surnames}, {s.Names}</strong>
                      </button>
                      {#if !picked}
                        <span class="countchip">{s.group}</span>
                      {/if}
                      {#if s.calls > 0}
                        <span class="countchip warn">{$t.admin.callsCount(s.calls)}</span>
                      {/if}
                      {#if alerted.has(s.StudentID)}
                        <span
                          class="alertbadge"
                          title={$t.academicAlert.hasOpen(alertCounts[s.StudentID] ?? 0)}
                          aria-label={$t.academicAlert.hasOpen(alertCounts[s.StudentID] ?? 0)}
                        >
                          <Icon name="warn" />
                          <strong>{alertCounts[s.StudentID] ?? 0}</strong>
                        </span>
                      {/if}
                    </div>
                  </div>
                  <span class="c-stat"><strong>{s.Absences}</strong></span>
                  <span class="c-stat"><strong>{s.Excused}</strong></span>
                  <span class="c-stat" class:alert={s.Evasions > 0}><strong>{s.Evasions}</strong></span>
                  <span class="c-stat" class:alert={s.Lates > 0}><strong>{s.Lates}</strong></span>
                  <div class="rateblock">
                    <strong class:low={s.rate < 85}>{s.rate}%</strong>
                    <span class="rbar"><span class:low={s.rate < 85} style={`width:${s.rate}%`}></span></span>
                  </div>
                  <div class="row-actions">
                    <button
                      type="button"
                      class="btn btn-sm"
                      on:click={() => push(`/admin/estudiantes/${encodeURIComponent(s.StudentID)}/resumen`)}
                    >
                      {$t.admin.openSummary}
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm"
                      on:click={() => push(`/admin/estudiantes/${encodeURIComponent(s.StudentID)}`)}
                    >
                      {$t.admin.openFile}
                    </button>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </section>
    {/if}
  </div>
</AdminShell>

<Sheet open={creatingSalon} title={$t.admin.newSalonTitle} onClose={() => (creatingSalon = false)}>
  <form class="form" on:submit|preventDefault={saveSalon}>
    <p class="muted">{$t.admin.yearLabel}: <strong>{year}</strong></p>
    <div class="row2">
      <label>{$t.admin.salonGradeLabel}<input bind:value={salonGrade} inputmode="numeric" pattern="[0-9]*" autocomplete="off" /></label>
      <label>{$t.admin.salonGroupLabel}<input bind:value={salonGroup} inputmode="numeric" pattern="[0-9]*" autocomplete="off" /></label>
    </div>
    {#if salonFeedback}<p class="flash error" role="alert">{salonFeedback}</p>{/if}
    <div class="form-actions">
      <button class="btn" type="button" on:click={() => (creatingSalon = false)}>{$t.common.cancel}</button>
      <button class="btn btn-primary" type="submit" disabled={savingSalon}>
        {savingSalon ? '…' : $t.admin.formCreate}
      </button>
    </div>
  </form>
</Sheet>

<Sheet open={creating} wide title={$t.admin.newStudent} onClose={() => (creating = false)}>
  <form class="form" on:submit|preventDefault={save}>
    <p class="req-note">{$t.admin.formRequiredNote}</p>
    <h3 class="formsub">{$t.admin.formSectionBasic}</h3>
    <div class="row2">
      <label><span>{$t.admin.formNames} <span class="req" aria-hidden="true">*</span></span><input required bind:value={form.Names} autocomplete="off" /></label>
      <label><span>{$t.admin.formSurnames} <span class="req" aria-hidden="true">*</span></span><input required bind:value={form.Surnames} autocomplete="off" /></label>
    </div>
    <div class="row2">
      <label><span>{$t.admin.formDocument} <span class="req" aria-hidden="true">*</span></span><input required bind:value={form.DocumentID} placeholder={$t.admin.formDocumentPlaceholder} inputmode="numeric" pattern="[0-9]*" autocomplete="off" /></label>
      <label><span>{$t.admin.formClass} <span class="req" aria-hidden="true">*</span></span><input required bind:value={form.ClassID} placeholder={$t.admin.formClassPlaceholder} autocomplete="off" /></label>
    </div>
    <div class="row2">
      <label>{$t.admin.formBirthdate}<input type="date" lang="es-CO" bind:value={form.Birthdate} /></label>
      <label>{$t.admin.formBloodType}<input bind:value={form.BloodType} placeholder={$t.admin.formBloodPlaceholder} autocomplete="off" /></label>
    </div>
    <label>{$t.admin.formBirthplace}<input bind:value={form.Birthplace} autocomplete="off" /></label>
    <label class="check"><input type="checkbox" bind:checked={form.IsNew} /><span>{$t.admin.formIsNew}</span></label>
    <h3 class="formsub">{$t.admin.formSectionContact}</h3>
    <div class="row2">
      <label>{$t.admin.formPhone}<input bind:value={form.Phone} inputmode="tel" autocomplete="off" /></label>
      <label>{$t.admin.formEmail}<input bind:value={form.Email} type="email" inputmode="email" autocapitalize="none" autocomplete="off" /></label>
    </div>
    <label>{$t.admin.formAddress}<input bind:value={form.Address} autocomplete="off" /></label>
    <h3 class="formsub">{$t.admin.formSectionHealth}</h3>
    <div class="row2">
      <label class="check"><input type="checkbox" bind:checked={form.Vision.Has} /><span>{$t.admin.formVision}: {$t.admin.formConditionHas}</span></label>
      <label>{$t.admin.formConditionDetail}<input bind:value={form.Vision.Detail} disabled={!form.Vision.Has && !form.Vision.Detail} autocomplete="off" /></label>
    </div>
    <div class="row2">
      <label class="check"><input type="checkbox" bind:checked={form.Hearing.Has} /><span>{$t.admin.formHearing}: {$t.admin.formConditionHas}</span></label>
      <label>{$t.admin.formConditionDetail}<input bind:value={form.Hearing.Detail} disabled={!form.Hearing.Has && !form.Hearing.Detail} autocomplete="off" /></label>
    </div>
    <div class="row2">
      <label class="check"><input type="checkbox" bind:checked={form.SpecialistReport.Has} /><span>{$t.admin.formSpecialist}</span></label>
      <label>{$t.admin.formConditionDetail}<input bind:value={form.SpecialistReport.Detail} disabled={!form.SpecialistReport.Has && !form.SpecialistReport.Detail} autocomplete="off" /></label>
    </div>
    <label>{$t.admin.formMedical}<input bind:value={form.MedicalReport} autocomplete="off" /></label>
    <label>{$t.admin.formDiversity}<input bind:value={form.DiversityCondition} autocomplete="off" /></label>
    <h3 class="formsub">{$t.admin.formSectionGuardian}</h3>
    <div class="row2">
      <label><span>{$t.admin.formCaregiverName} <span class="req" aria-hidden="true">*</span></span><input required bind:value={form.Caregiver.Names} autocomplete="off" /></label>
      <label>{$t.admin.formCaregiverPhone}<input bind:value={form.Caregiver.Phone} inputmode="tel" autocomplete="off" /></label>
    </div>
    <div class="row2">
      <label>{$t.admin.formGuardianDocument}<input bind:value={form.Caregiver.DocumentID} inputmode="numeric" autocomplete="off" /></label>
      <label>{$t.admin.formGuardianOccupation}<input bind:value={form.Caregiver.Occupation} autocomplete="off" /></label>
    </div>
    <label>{$t.admin.formGuardianAddress}<input bind:value={form.Caregiver.Address} autocomplete="off" /></label>
    <h3 class="formsub">{$t.admin.formSectionMother}</h3>
    <div class="row2">
      <label>{$t.admin.formGuardianName}<input bind:value={form.Mother.Names} autocomplete="off" /></label>
      <label>{$t.admin.formCaregiverPhone}<input bind:value={form.Mother.Phone} inputmode="tel" autocomplete="off" /></label>
    </div>
    <div class="row2">
      <label>{$t.admin.formGuardianDocument}<input bind:value={form.Mother.DocumentID} inputmode="numeric" autocomplete="off" /></label>
      <label>{$t.admin.formGuardianOccupation}<input bind:value={form.Mother.Occupation} autocomplete="off" /></label>
    </div>
    <label>{$t.admin.formGuardianAddress}<input bind:value={form.Mother.Address} autocomplete="off" /></label>
    <h3 class="formsub">{$t.admin.formSectionFather}</h3>
    <div class="row2">
      <label>{$t.admin.formGuardianName}<input bind:value={form.Father.Names} autocomplete="off" /></label>
      <label>{$t.admin.formCaregiverPhone}<input bind:value={form.Father.Phone} inputmode="tel" autocomplete="off" /></label>
    </div>
    <div class="row2">
      <label>{$t.admin.formGuardianDocument}<input bind:value={form.Father.DocumentID} inputmode="numeric" autocomplete="off" /></label>
      <label>{$t.admin.formGuardianOccupation}<input bind:value={form.Father.Occupation} autocomplete="off" /></label>
    </div>
    <label>{$t.admin.formGuardianAddress}<input bind:value={form.Father.Address} autocomplete="off" /></label>
    <h3 class="formsub">{$t.admin.formSectionOrigin}</h3>
    <div class="row2">
      <label>{$t.admin.formPreviousSchool}<input bind:value={form.PreviousSchool} autocomplete="off" /></label>
      <label>{$t.admin.formTransferReason}<input bind:value={form.TransferReason} autocomplete="off" /></label>
    </div>
    <label>{$t.admin.formLivesWith}<input bind:value={form.LivesWith} autocomplete="off" /></label>
    <h3 class="formsub">{$t.admin.formSectionSiblings}</h3>
    {#each form.Siblings as sib, i (i)}
      <div class="row2">
        <label>{$t.admin.formSiblingName}<input bind:value={sib.Name} autocomplete="off" /></label>
        <label>{$t.admin.formSiblingClass}<input bind:value={sib.ClassID} placeholder={$t.admin.formClassPlaceholder} autocomplete="off" /></label>
      </div>
    {/each}
    <div class="rowbtns">
      <button type="button" class="btn btn-sm" on:click={addSibling}>{$t.admin.formAddSibling}</button>
      {#if form.Siblings.length > 0}
        <button type="button" class="btn btn-sm" on:click={() => removeSibling(form.Siblings.length - 1)}>{$t.admin.formRemoveSibling}</button>
      {/if}
    </div>
    {#if feedback}<p class="flash error" role="alert">{feedback}</p>{/if}
    <div class="form-actions">
      <button class="btn" type="button" on:click={() => (creating = false)}>{$t.common.cancel}</button>
      <button class="btn btn-primary" type="submit" disabled={saving}>
        {saving ? '…' : $t.admin.formCreate}
      </button>
    </div>
  </form>
</Sheet>

<style>
  .year-stepper {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .year-stepper strong {
    font-size: 0.9rem;
    font-weight: 600;
    min-width: 42px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sheet);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .salons-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .salons-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .salons-head h2 {
    font-size: 0.92rem;
    font-weight: 600;
  }
  .salonlist {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
    gap: 8px;
  }
  .saloncard {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 10px 12px;
  }
  .saloncard:hover {
    background: var(--surface-2);
    border-color: var(--control);
  }
  .saloncard.active {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .sc-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .sc-top strong {
    font-size: 0.95rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .sc-count {
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--ink-soft);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 1px 8px;
    font-variant-numeric: tabular-nums;
  }
  .saloncard small {
    color: var(--muted);
    font-size: 0.75rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    align-items: end;
  }
  @media (min-width: 780px) {
    .filters {
      grid-template-columns: 1.8fr 1fr 1fr 1fr auto;
    }
  }
  .filters > label.search {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .filters .cap {
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
    min-height: var(--control-height);
    color: var(--muted);
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
  .filters label:not(.search) {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: var(--fs-small);
    font-weight: 500;
    color: var(--muted);
  }
  .filters input:not([type='search']) {
    min-height: var(--control-height);
    border: 1px solid var(--control);
    border-radius: var(--radius-control);
    background: var(--surface);
    padding: 0 12px;
    font-weight: 500;
    font-size: 0.84rem;
    color: var(--ink);
    width: 100%;
    font-variant-numeric: tabular-nums;
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
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    padding: 18px;
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .card-head h2 {
    font-size: 0.98rem;
    font-weight: 600;
  }
  .muted {
    color: var(--muted);
    font-size: 0.84rem;
  }
  /* Table */
  .table-wrap {
    overflow-x: auto;
  }
  .colhead {
    display: none;
  }
  .ledger {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .stu-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(4, 48px) 84px;
    gap: 8px;
    align-items: center;
    padding: 10px 4px;
    border-top: 1px solid var(--line);
  }
  .stu-row:first-child {
    border-top: 0;
  }
  @media (min-width: 820px) {
    .colhead {
      display: grid;
      grid-template-columns: minmax(200px, 1.6fr) repeat(4, 76px) 120px auto;
      gap: 12px;
      padding: 0 4px 8px;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 500;
    }
    .colhead .num-col {
      text-align: right;
    }
    .colhead .act-col {
      text-align: right;
    }
    .stu-row {
      grid-template-columns: minmax(200px, 1.6fr) repeat(4, 76px) 120px auto;
      gap: 12px;
    }
  }
  .who {
    min-width: 0;
  }
  .namerow {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .name-btn {
    text-align: left;
    min-width: 0;
  }
  .name-btn strong {
    font-size: 0.88rem;
    font-weight: 600;
  }
  .name-btn:hover strong {
    color: var(--accent);
  }
  .countchip {
    background: var(--tint);
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--ink-soft);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .countchip.warn {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .alertbadge {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--chip-pink-bg);
    color: var(--g-grave-ink);
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
  }
  .alertbadge :global(svg) {
    width: 13px;
    height: 13px;
  }
  .c-stat {
    text-align: right;
  }
  .c-stat strong {
    font-variant-numeric: tabular-nums;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .c-stat.alert strong {
    color: var(--g-grave-ink);
  }
  .rateblock {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    min-width: 0;
  }
  .rateblock strong {
    font-variant-numeric: tabular-nums;
    font-size: 0.86rem;
    text-align: right;
  }
  .rateblock strong.low {
    color: var(--g-grave-ink);
  }
  .rbar {
    height: 4px;
    border-radius: 999px;
    background: var(--tint);
    overflow: hidden;
  }
  .rbar span {
    display: block;
    height: 100%;
    background: var(--m-present);
    border-radius: 999px;
  }
  .rbar span.low {
    background: var(--g-grave-ink);
  }
  .row-actions {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  @media (min-width: 820px) {
    .row-actions {
      grid-column: auto;
    }
  }
  /* Export & Create forms */
  .xlist {
    list-style: none;
    margin: 10px 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .xrow {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: 10px 12px;
    cursor: pointer;
  }
  .xrow input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    flex: none;
  }
  .xmain {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .xmain small {
    color: var(--muted);
    font-size: 0.76rem;
  }
  .xcount {
    margin-left: auto;
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
    font-size: 0.76rem;
    border-radius: 999px;
    padding: 2px 10px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .form label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-weight: 500;
    font-size: 0.82rem;
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }
  @media (min-width: 480px) {
    .row2 {
      grid-template-columns: 1fr 1fr;
    }
  }
  .form input:not([type='checkbox']) {
    background: var(--surface);
    border: 1px solid var(--control);
    border-radius: var(--radius-control);
    padding: 0 12px;
    min-height: var(--control-height);
    width: 100%;
    font-size: 0.85rem;
  }
  .form input:not([type='checkbox']):focus {
    outline: none;
    border-color: var(--accent);
  }
  .formsub {
    margin: 6px 0 0;
    padding-top: 8px;
    border-top: 1px solid var(--line);
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .req-note {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .req {
    color: var(--danger);
    font-weight: 700;
  }
  .check {
    flex-direction: row !important;
    align-items: center;
    gap: 8px !important;
    min-height: var(--control-height);
  }
  .check input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }
  .rowbtns {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .flash {
    background: var(--chip-green-bg);
    color: var(--chip-green-ink);
    font-weight: 600;
    font-size: 0.84rem;
    border-radius: var(--radius-control);
    padding: 8px 12px;
  }
  .flash.error {
    background: var(--g-grave-bg);
    color: var(--g-grave-ink);
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
</style>
