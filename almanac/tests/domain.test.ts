// Domain tests run against a throwaway data directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'almanac-test-'));
process.env.ALMANAC_DATA_DIR = TMP;

const conn = await import('../server/db/connection.ts');
const work = await import('../server/domain/work.ts');
const fit = await import('../server/domain/fitness.ts');
const body = await import('../server/domain/body.ts');
const days = await import('../server/domain/days.ts');
const goals = await import('../server/domain/goals.ts');
const stats = await import('../server/domain/stats.ts');
const settings = await import('../server/domain/settings.ts');
const sum = await import('../server/domain/summaries.ts');
const reviews = await import('../server/domain/reviews.ts');
const search = await import('../server/domain/search.ts');
const dates = await import('../shared/dates.ts');
const { estimate1RM } = await import('../shared/fitness.ts');

const TODAY = '2026-09-23';
const lb = (v: number) => v / 2.2046226218;

beforeAll(() => {
  conn.initStore();
  settings.updateSettings({ defaultRateCents: 3000, weekStart: 1, onboarded: true });
});

describe('dates', () => {
  it('handles leap years', () => {
    expect(dates.isLeapYear(2028)).toBe(true);
    expect(dates.isLeapYear(2026)).toBe(false);
    expect(dates.isLeapYear(2100)).toBe(false);
    expect(dates.isLeapYear(2000)).toBe(true);
    expect(dates.daysInYear(2028)).toBe(366);
    expect(dates.eachDay('2028-01-01', '2028-12-31')).toHaveLength(366);
    expect(dates.daysInMonth(2028, 2)).toBe(29);
  });
  it('computes weeks for either start day', () => {
    expect(dates.weekRange('2026-09-23', 1)).toEqual({ start: '2026-09-21', end: '2026-09-27' });
    expect(dates.weekRange('2026-09-23', 0)).toEqual({ start: '2026-09-20', end: '2026-09-26' });
  });
  it('clamps month arithmetic', () => {
    expect(dates.addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(dates.addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });
  it('spans midnight', () => {
    expect(dates.spanMinutes('22:00', '01:30')).toBe(210);
  });
});

describe('work sessions & money', () => {
  it('calculates time, earnings and effective rate', () => {
    const s = work.createSession({ date: TODAY, startTime: '09:00', endTime: '13:30', breakMinutes: 30, payType: 'hourly', projectName: 'HVAC website', categoryName: 'Design', description: 'Homepage' }, TODAY);
    expect(s.minutes).toBe(240);
    expect(s.hourlyRateCents).toBe(3000);
    expect(s.earnedCents).toBe(12000);
    expect(s.projectName).toBe('HVAC website');
  });
  it('uses the project rate, and entry overrides win', () => {
    const p = work.listProjects().find((x) => x.name === 'HVAC website')!;
    work.updateProject(p.id, { hourlyRateCents: 4500 }, TODAY);
    const a = work.createSession({ date: TODAY, minutes: 60, payType: 'hourly', projectId: p.id }, TODAY);
    expect(a.earnedCents).toBe(4500);
    const b = work.createSession({ date: TODAY, minutes: 60, payType: 'hourly', projectId: p.id, hourlyRateCents: 6000 }, TODAY);
    expect(b.earnedCents).toBe(6000);
  });
  it('snapshots the rate so changing the default never rewrites history', () => {
    const s = work.createSession({ date: '2026-09-01', minutes: 120, payType: 'hourly' }, TODAY);
    settings.updateSettings({ defaultRateCents: 9900 });
    expect(work.getSession(s.id).earnedCents).toBe(6000);
    settings.updateSettings({ defaultRateCents: 3000 });
  });
  it('supports flat-rate and unpaid work', () => {
    const f = work.createSession({ date: TODAY, minutes: 90, payType: 'flat', flatAmountCents: 35000 }, TODAY);
    expect(f.earnedCents).toBe(35000);
    const u = work.createSession({ date: TODAY, minutes: 30, payType: 'unpaid' }, TODAY);
    expect(u.earnedCents).toBe(0);
  });
  it('rejects impossible sessions', () => {
    expect(() => work.createSession({ date: TODAY, startTime: '09:00', endTime: '09:30', breakMinutes: 60, payType: 'hourly' }, TODAY)).toThrow();
    expect(() => work.createSession({ date: TODAY, payType: 'hourly' }, TODAY)).toThrow();
  });
  it('rolls every entry into daily, weekly, monthly and yearly totals', () => {
    work.createIncome({ date: TODAY, amountCents: 50000, source: 'Retainer', kind: 'project' }, TODAY);
    const day = stats.totals({ start: TODAY, end: TODAY });
    // 120 + 45 + 60 + 350 (flat) + 0 + 500 income
    expect(day.earnedCents).toBe(12000 + 4500 + 6000 + 35000 + 50000);
    const month = stats.totals(dates.monthRange('2026-09'));
    expect(month.earnedCents).toBe(day.earnedCents + 6000);
    const m = sum.moneySummary(TODAY);
    expect(m.month).toBe(month.earnedCents);
    expect(m.year).toBe(month.earnedCents);
  });
  it('edits, soft-deletes and restores (undo)', () => {
    const s = work.createSession({ date: TODAY, minutes: 60, payType: 'hourly' }, TODAY);
    const before = stats.totals({ start: TODAY, end: TODAY }).minutes;
    work.updateSession(s.id, { date: TODAY, minutes: 90, payType: 'hourly' }, TODAY);
    expect(stats.totals({ start: TODAY, end: TODAY }).minutes).toBe(before + 30);
    search.softDelete('work_sessions', s.id);
    expect(stats.totals({ start: TODAY, end: TODAY }).minutes).toBe(before - 60);
    expect(search.trash().some((t) => t.table === 'work_sessions' && t.id === s.id)).toBe(true);
    search.restore('work_sessions', s.id);
    expect(stats.totals({ start: TODAY, end: TODAY }).minutes).toBe(before + 30);
  });
});

describe('timer', () => {
  it('starts, pauses and stops into a work session', async () => {
    const t = work.startTimer({}, TODAY, '10:00');
    expect(t.date).toBe(TODAY);
    // Pretend it started 95 minutes ago.
    settings.setTimer({ ...t, startedAt: new Date(Date.now() - 95 * 60000).toISOString() });
    const s = work.stopTimer({ payType: 'hourly', description: 'Timer test', projectName: 'Timer project' }, '11:35');
    expect(s.minutes).toBeGreaterThanOrEqual(94);
    expect(s.minutes).toBeLessThanOrEqual(96);
    expect(s.startTime).toBe('10:00');
    expect(settings.getTimer()).toBeNull();
  });
});

describe('workouts & PR detection', () => {
  let bench = 0;
  it('stores a baseline without PRs', () => {
    const w = fit.createWorkout({
      date: '2026-09-01',
      name: 'Push Day',
      exercises: [{ exerciseName: 'Bench Press', sets: [{ weightKg: lb(135), reps: 10 }, { weightKg: lb(155), reps: 8 }, { weightKg: lb(165), reps: 6 }] }],
    });
    bench = w.exercises[0].exerciseId;
    expect(w.prs).toHaveLength(0);
  });
  it('detects weight, rep and estimated-1RM PRs automatically', () => {
    const w = fit.createWorkout({
      date: '2026-09-08',
      name: 'Push Day',
      exercises: [{ exerciseId: bench, exerciseName: 'Bench Press', sets: [{ weightKg: lb(185), reps: 5 }, { weightKg: lb(155), reps: 10 }] }],
    });
    const types = w.prs.map((p) => p.type).sort();
    expect(types).toEqual(['e1rm', 'reps', 'weight']);
    const weight = w.prs.find((p) => p.type === 'weight')!;
    expect(Math.round(weight.value * 2.2046226218)).toBe(185);
    expect(weight.reps).toBe(5);
    const reps = w.prs.find((p) => p.type === 'reps')!;
    expect(reps.reps).toBe(10);
    expect(reps.previousValue).toBe(8);
  });
  it('does not fake a PR on equal lifts, and ignores warm-ups', () => {
    const w = fit.createWorkout({
      date: '2026-09-10',
      name: 'Push Day',
      exercises: [{ exerciseId: bench, exerciseName: 'Bench Press', sets: [{ weightKg: lb(225), reps: 1, isWarmup: true }, { weightKg: lb(185), reps: 5 }] }],
    });
    expect(w.prs).toHaveLength(0);
  });
  it('recomputes PR history when a workout is edited or deleted', () => {
    const w = fit.createWorkout({ date: '2026-09-15', name: 'Push Day', exercises: [{ exerciseId: bench, exerciseName: 'Bench Press', sets: [{ weightKg: lb(195), reps: 3 }] }] });
    expect(w.prs.some((p) => p.type === 'weight')).toBe(true);
    fit.softDeleteWorkout(w.id);
    expect(fit.listPRs({ exerciseId: bench }).some((p) => p.workoutId === w.id)).toBe(false);
    fit.restoreWorkout(w.id);
    expect(fit.listPRs({ exerciseId: bench }).some((p) => p.workoutId === w.id)).toBe(true);
  });
  it('reports exercise history and last performance', () => {
    const h = fit.exerciseHistory(bench);
    expect(h.stats.sessions).toBe(4);
    expect(Math.round(h.stats.bestWeight!.kg * 2.2046226218)).toBe(195);
    const last = fit.lastPerformance(bench);
    expect(last?.date).toBe('2026-09-15');
    expect(estimate1RM(100, 1)).toBe(100);
    expect(Math.round(estimate1RM(100, 10)!)).toBe(133);
  });
});

describe('body & photos', () => {
  it('logs weight and measurements and reports change', () => {
    body.createBody({ date: '2026-06-01', weightKg: lb(180), waistCm: 34.5 * 2.54 });
    body.createBody({ date: '2026-09-20', weightKg: lb(172), waistCm: 33 * 2.54 });
    const c = body.bodyChanges('2026-06-01', TODAY);
    const w = c.find((x) => x.field === 'weightKg')!;
    expect(Math.round(w.change! * 2.2046226218)).toBe(-8);
    const waist = c.find((x) => x.field === 'waistCm')!;
    expect(Math.round((waist.change! / 2.54) * 10) / 10).toBe(-1.5);
  });
  it('determines monthly photo completion from front, side and back', () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5590000000049454e44ae426082', 'hex');
    body.savePhoto({ month: '2026-09', date: '2026-09-01', angle: 'front', data: png, mime: 'image/png' });
    body.savePhoto({ month: '2026-09', date: '2026-09-01', angle: 'side', data: png, mime: 'image/png' });
    expect(body.monthPhotoStatus('2026-09').complete).toBe(false);
    const s = body.savePhoto({ month: '2026-09', date: '2026-09-01', angle: 'back', data: png, mime: 'image/png' });
    expect(s.complete).toBe(true);
    // The original bytes are stored untouched.
    const file = body.resolveMedia(s.photos[0].url.replace(/^\/media\//, '').replace(/\?.*$/, ''));
    expect(fs.readFileSync(file!).equals(png)).toBe(true);
  });
});

describe('ratings, year grid & streaks', () => {
  it('rates days and changes ratings', () => {
    days.setDay('2026-09-20', { rating: 3 }, TODAY);
    days.setDay('2026-09-21', { rating: 2 }, TODAY);
    days.setDay('2026-09-22', { rating: 1 }, TODAY);
    days.setDay('2026-09-22', { rating: 3 }, TODAY);
    expect(days.dayView('2026-09-22', TODAY, 1).rating).toBe(3);
  });
  it('refuses to rate the future', () => {
    expect(() => days.setDay('2026-09-24', { rating: 3 }, TODAY)).toThrow();
  });
  it('computes percentages from rated days only, never counting the future', () => {
    const s = days.ratingStats(dates.yearRange(2026), TODAY);
    expect(s.rated).toBe(3);
    expect(s.pctGood).toBeCloseTo(2 / 3);
    const elapsed = dates.diffDays('2026-01-01', TODAY) + 1;
    expect(s.unrated).toBe(elapsed - 3);
  });
  it('renders a full grid, including leap years', () => {
    expect(days.yearGrid(2026, TODAY).days).toHaveLength(365);
    expect(days.yearGrid(2028, TODAY).days).toHaveLength(366);
  });
  it('counts the current good-day streak without penalising an unrated today', () => {
    expect(days.currentGoodStreak(TODAY)).toBe(1); // 22nd good, 21st okay
    days.setDay('2026-09-21', { rating: 3 }, TODAY);
    expect(days.currentGoodStreak(TODAY)).toBe(3);
    expect(days.longestGoodStreak(dates.yearRange(2026)).length).toBe(3);
  });
});

describe('goals update themselves', () => {
  it('tracks monthly income as entries are added', () => {
    const probe = goals.createGoal({ title: 'probe', metric: 'earnings', period: 'month', target: 1 }, TODAY, 1);
    // A target just out of reach: one more income entry should complete it.
    const g = goals.createGoal({ title: 'Earn this month', metric: 'earnings', period: 'month', target: probe.current + 10000 }, TODAY, 1);
    const before = g.current;
    expect(g.done).toBe(false);
    work.createIncome({ date: TODAY, amountCents: 12345, source: 'Test', kind: 'other' }, TODAY);
    const after = goals.goalsWithProgress(TODAY, 1).find((x) => x.id === g.id)!;
    expect(after.current).toBe(before + 12345);
    expect(after.done).toBe(true);
  });
  it('tracks weekly workouts and strength targets', () => {
    const w = goals.createGoal({ title: 'Work out 4 times', metric: 'workouts', period: 'week', target: 4 }, '2026-09-10', 1);
    expect(w.current).toBe(2); // Sep 8 and Sep 10 fall within Sep 7–13
    const bench = fit.listExercises().find((e) => e.name === 'Bench Press')!;
    const t = goals.createGoal({ title: 'Bench 225', metric: 'exercise_weight', period: 'target', target: lb(225), exerciseId: bench.id }, TODAY, 1);
    expect(t.done).toBe(false);
    fit.createWorkout({ date: TODAY, name: 'Test', exercises: [{ exerciseId: bench.id, exerciseName: 'Bench Press', sets: [{ weightKg: lb(225), reps: 1 }] }] });
    const t2 = goals.goalsWithProgress(TODAY, 1).find((x) => x.id === t.id)!;
    expect(t2.done).toBe(true);
    expect(t2.completedOn).toBe(TODAY);
  });
  it('checks off manual daily goals', () => {
    const g = goals.createGoal({ title: 'Read', metric: 'manual', period: 'day', target: 1 }, TODAY, 1);
    goals.checkIn(g.id, TODAY, null);
    expect(goals.goalsForDay(TODAY, TODAY, 1).find((x) => x.id === g.id)!.done).toBe(true);
    goals.checkIn(g.id, TODAY, null);
    expect(goals.goalsForDay(TODAY, TODAY, 1).find((x) => x.id === g.id)!.done).toBe(false);
  });
  it('completes photo goals from photo sets', () => {
    const g = goals.createGoal({ title: 'Photos', metric: 'photos', period: 'month', target: 1 }, TODAY, 1);
    expect(g.done).toBe(true);
  });
});

describe('reviews & search', () => {
  it('generates weekly, monthly and yearly reviews from live data', () => {
    const w = reviews.weeklyReview(TODAY, TODAY);
    expect(w.range).toEqual({ start: '2026-09-21', end: '2026-09-27' });
    expect(w.totals.earnedCents).toBeGreaterThan(0);
    reviews.saveAnswers('week', w.range.start, { well: 'Shipped the homepage' });
    expect(reviews.weeklyReview(TODAY, TODAY).answers.well).toBe('Shipped the homepage');
    const m = reviews.monthlyReview('2026-09', TODAY);
    expect(m.photos?.complete).toBe(true);
    expect(m.prs.length).toBeGreaterThan(0);
    const y = reviews.yearInReview(2026, TODAY);
    expect(y.grid.days).toHaveLength(365);
    expect(y.totals.workouts).toBeGreaterThan(0);
  });
  it('finds months, projects, amounts and exercises', () => {
    expect(search.search('September', TODAY).some((r) => r.kind === 'month')).toBe(true);
    expect(search.search('HVAC', TODAY).some((r) => r.kind === 'project')).toBe(true);
    expect(search.search('$500', TODAY).some((r) => r.title.includes('$500'))).toBe(true);
    expect(search.search('Bench Press', TODAY).some((r) => r.kind === 'exercise')).toBe(true);
  });
});

describe('backup, restore & datasets', () => {
  it('round-trips a full backup', async () => {
    const data = await import('../server/domain/data.ts');
    const { stream } = data.backupStream();
    const zip = path.join(TMP, 'test-backup.zip');
    await new Promise<void>((res, rej) => stream.pipe(fs.createWriteStream(zip)).on('finish', () => res()).on('error', rej));
    const before = stats.totals(dates.yearRange(2026));
    // Change data, then restore the backup and confirm we're back.
    work.createIncome({ date: TODAY, amountCents: 999999, source: 'After backup', kind: 'other' }, TODAY);
    expect(stats.totals(dates.yearRange(2026)).earnedCents).toBe(before.earnedCents + 999999);
    const r = await data.restoreBackup(zip);
    expect(r.restored).toBe(true);
    expect(stats.totals(dates.yearRange(2026))).toEqual(before);
    expect(body.monthPhotoStatus('2026-09').complete).toBe(true);
  });
  it('keeps sample data completely separate from real data', async () => {
    const data = await import('../server/domain/data.ts');
    const realEarned = stats.totals(dates.yearRange(2026)).earnedCents;
    data.loadSample(TODAY);
    expect(conn.getStore().mode).toBe('sample');
    expect(stats.totals(dates.yearRange(2026)).earnedCents).not.toBe(realEarned);
    data.deleteSample();
    expect(conn.getStore().mode).toBe('real');
    expect(stats.totals(dates.yearRange(2026)).earnedCents).toBe(realEarned);
    expect(fs.existsSync(path.join(TMP, 'sample'))).toBe(false);
  });
  it('exports and re-imports JSON losslessly', async () => {
    const data = await import('../server/domain/data.ts');
    const before = stats.totals(dates.yearRange(2026));
    const exp = data.exportJSON();
    data.importJSON(JSON.parse(JSON.stringify(exp)));
    expect(stats.totals(dates.yearRange(2026))).toEqual(before);
  });
});
