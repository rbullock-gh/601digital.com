// Realistic sample data for exploring Almanac. It is written to a separate
// database in its own directory, so it can never mix with real history.

import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import {
  addDays,
  addMonths,
  diffDays,
  eachDay,
  make,
  monthKey,
  parts,
  pad2,
  startOfMonth,
  weekday,
  MONTHS,
  type ISODate,
} from '../../shared/dates.ts';
import { LB_PER_KG, CM_PER_IN } from '../../shared/units.ts';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lb = (v: number) => v / LB_PER_KG;
const inch = (v: number) => v * CM_PER_IN;

export function generateSample(db: Database.Database, photosDir: string, root: string, today: ISODate) {
  const R = rng(601);
  const rand = (a: number, b: number) => a + (b - a) * R();
  const chance = (p: number) => R() < p;
  const pick = <T,>(xs: T[]): T => xs[Math.floor(R() * xs.length)];
  const START = make(parts(today).y - 1, 3, 1);
  const totalDays = diffDays(START, today);
  const progress = (d: ISODate) => Math.max(0, Math.min(1, diffDays(START, d) / totalDays));

  const ins = (sql: string, ...args: unknown[]) => Number(db.prepare(sql).run(...(args as never[])).lastInsertRowid);

  db.transaction(() => {
    // ── Settings ──
    const settings: Record<string, unknown> = {
      name: 'Chris', defaultRateCents: 3500, currency: 'USD', weekStart: 1, dateFormat: 'MDY', timeFormat: '12',
      weightUnit: 'lb', lengthUnit: 'in', photoDay: 1, onboarded: true, weeklyWorkoutTarget: 4,
    };
    for (const [k, v] of Object.entries(settings)) ins('INSERT INTO settings (key, value) VALUES (?, ?)', k, JSON.stringify(v));

    // ── Categories ──
    const cat: Record<string, number> = {};
    for (const c of ['Design', 'Development', 'SEO', 'Client calls', 'Content', 'Admin']) cat[c] = ins('INSERT INTO categories (name) VALUES (?)', c);

    // ── Projects: [name, client, color, rate $/h, start offset (days from START), end offset or null, final status] ──
    const y0 = parts(START).y;
    const projDefs: [string, string, string, number | null, ISODate, ISODate | null, string][] = [
      ['Pine Belt Dental redesign', 'Pine Belt Dental', '#2a78d6', 40, make(y0, 3, 3), make(y0, 5, 28), 'completed'],
      ['Magnolia Bakery website', 'Magnolia Bakery', '#e87ba4', null, make(y0, 5, 12), make(y0, 8, 22), 'completed'],
      ['Hattiesburg Roofing SEO', 'Hattiesburg Roofing Co.', '#eb6834', null, make(y0, 4, 1), null, 'active'],
      ['Delta Law Group website', 'Delta Law Group', '#7f6fd8', 45, make(y0, 9, 2), make(y0 + 1, 2, 13), 'completed'],
      ['Southern Auto Repair site', 'Southern Auto Repair', '#8a8f3c', 35, make(y0, 11, 10), make(y0 + 1, 1, 20), 'paused'],
      ['Coastal Realty local SEO', 'Coastal Realty', '#4a9bb0', null, make(y0 + 1, 1, 5), null, 'active'],
      ['Leaf River Outfitters shop', 'Leaf River Outfitters', '#c98500', 40, make(y0 + 1, 3, 2), make(y0 + 1, 6, 30), 'completed'],
      ['Gulf Coast HVAC website', 'Gulf Coast Heating & Air', '#1baf7a', 45, make(y0 + 1, 7, 7), null, 'active'],
      ['601 Digital', null as unknown as string, '#52514e', null, START, null, 'active'],
    ];
    const projects = projDefs.map(([name, client, color, rate, start, end, status]) => ({
      id: ins(
        'INSERT INTO projects (name, client, status, color, hourly_rate_cents, completed_on, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        name, client, status, color, rate ? rate * 100 : null, status === 'completed' && end ? end : null, `${start} 09:00:00`,
      ),
      name, rate, start, end: end && end <= today ? end : null, status,
    }));
    const own = projects[projects.length - 1];
    db.prepare("UPDATE projects SET notes = ? WHERE id = ?").run(
      'Five-page site with online booking. Client wants a spring launch; photography from their team.',
      projects[0].id,
    );
    db.prepare("UPDATE projects SET notes = ? WHERE id = ?").run(
      'Service-area pages for Hattiesburg, Petal, Laurel. Monthly retainer covers reporting + two posts.',
      projects[2].id,
    );
    db.prepare("UPDATE projects SET notes = ? WHERE id = ?").run(
      'New site with seasonal tune-up booking, service area map, reviews. Launch target before first cold snap.',
      projects[7].id,
    );

    const tasks: Record<string, string[]> = {
      Design: ['homepage layout', 'mobile nav and header', 'service page templates', 'brand color exploration', 'contact form design', 'gallery grid', 'pricing section'],
      Development: ['booking integration', 'responsive fixes', 'page speed pass', 'CMS setup', 'form handling', 'launch checklist', 'image optimization'],
      SEO: ['Google Business Profile updates', 'keyword research', 'service-area pages', 'monthly ranking report', 'citation cleanup', 'schema markup'],
      'Client calls': ['kickoff call', 'feedback review call', 'weekly check-in', 'content walkthrough'],
      Content: ['about page copy', 'service descriptions', 'blog post draft', 'FAQ section'],
      Admin: ['invoicing', 'proposal writing', 'bookkeeping', 'portfolio update'],
    };

    // ── Strength model: estimated 1RM (lb) at start and end ──
    const lifts: Record<string, { start: number; end: number; reps: [number, number]; step: number; group: string; bw?: boolean }> = {
      'Bench Press': { start: 178, end: 232, reps: [5, 8], step: 5, group: 'Chest' },
      'Overhead Press': { start: 112, end: 142, reps: [5, 8], step: 5, group: 'Shoulders' },
      'Incline Dumbbell Press': { start: 120, end: 150, reps: [8, 10], step: 5, group: 'Chest' },
      'Lateral Raise': { start: 34, end: 44, reps: [12, 15], step: 2.5, group: 'Shoulders' },
      'Tricep Pushdown': { start: 78, end: 100, reps: [10, 12], step: 5, group: 'Arms' },
      'Barbell Row': { start: 170, end: 212, reps: [6, 8], step: 5, group: 'Back' },
      'Pull-Up': { start: 0, end: 0, reps: [6, 12], step: 1, group: 'Back', bw: true },
      'Lat Pulldown': { start: 165, end: 198, reps: [8, 10], step: 5, group: 'Back' },
      'Dumbbell Curl': { start: 44, end: 58, reps: [8, 12], step: 2.5, group: 'Arms' },
      'Face Pull': { start: 58, end: 74, reps: [12, 15], step: 5, group: 'Shoulders' },
      Squat: { start: 238, end: 305, reps: [5, 6], step: 5, group: 'Legs' },
      'Romanian Deadlift': { start: 205, end: 262, reps: [6, 8], step: 5, group: 'Legs' },
      'Leg Press': { start: 420, end: 540, reps: [8, 10], step: 10, group: 'Legs' },
      'Leg Curl': { start: 118, end: 140, reps: [10, 12], step: 5, group: 'Legs' },
      'Calf Raise': { start: 190, end: 240, reps: [12, 15], step: 10, group: 'Legs' },
      Deadlift: { start: 300, end: 375, reps: [3, 5], step: 5, group: 'Back' },
    };
    const exId: Record<string, number> = {};
    for (const [name, l] of Object.entries(lifts))
      exId[name] = ins('INSERT INTO exercises (name, muscle_group, kind) VALUES (?, ?, ?)', name, l.group, l.bw ? 'bodyweight' : 'weighted');
    const split: Record<string, string[]> = {
      'Push Day': ['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Lateral Raise', 'Tricep Pushdown'],
      'Pull Day': ['Barbell Row', 'Pull-Up', 'Lat Pulldown', 'Dumbbell Curl', 'Face Pull'],
      'Leg Day': ['Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Calf Raise'],
      'Upper Body': ['Bench Press', 'Barbell Row', 'Overhead Press', 'Lat Pulldown', 'Dumbbell Curl'],
      'Lower Body': ['Deadlift', 'Leg Press', 'Leg Curl', 'Calf Raise'],
    };
    const rotation = ['Push Day', 'Pull Day', 'Leg Day', 'Upper Body', 'Push Day', 'Pull Day', 'Lower Body'];
    let rot = 0;

    const e1rmOn = (name: string, d: ISODate) => {
      const l = lifts[name];
      const p = progress(d);
      // Diminishing returns plus a mid-period plateau.
      const curve = Math.sqrt(p) * 0.6 + p * 0.4;
      return l.start + (l.end - l.start) * curve * (1 + rand(-0.035, 0.03));
    };

    // ── Body model ──
    const weightOn = (d: ISODate) => {
      const p = progress(d);
      return 186.5 - 15 * (p * 0.85 + Math.sin(p * Math.PI) * 0.1) + Math.sin(diffDays(START, d) / 5) * 0.8 + rand(-0.9, 0.9);
    };
    const measure = (d: ISODate) => {
      const p = progress(d);
      const j = () => rand(-0.15, 0.15);
      return {
        waist: 36.5 - 3.25 * p + j(), chest: 41 + 1.2 * p + j(), arms: 14.1 + 1.0 * p + j() * 0.5, forearms: 11.6 + 0.4 * p + j() * 0.3,
        shoulders: 47 + 1.8 * p + j(), thighs: 23.5 + 0.2 * p + j(), calves: 15 + 0.2 * p + j() * 0.3, neck: 15.6 + 0.1 * p + j() * 0.3,
      };
    };

    const journalOpeners = [
      'Solid day.', 'Long one today.', 'Quiet morning, busy afternoon.', 'Felt locked in.', 'Slow start but got there.',
      'Good energy today.', 'Tired, but made progress.', 'Kept it simple today.',
    ];
    const goodFeel = ['felt productive today', 'really happy with how today went', 'good momentum', 'one of the better days lately'];
    const okFeel = ['decent day overall', 'not my sharpest, but fine', 'average day', 'a bit scattered'];
    const badFeel = ['rough day — couldn’t focus', 'slept badly and it showed', 'got pulled in too many directions', 'frustrating day'];

    for (const d of eachDay(START, today)) {
      const wd = weekday(d);
      const isWeekend = wd === 0 || wd === 6;
      const isToday = d === today;
      const p = progress(d);
      const vacation = (d >= make(y0, 7, 3) && d <= make(y0, 7, 7)) || (d >= make(y0, 12, 24) && d <= make(y0, 12, 28));

      // ── Work ──
      let dayMinutes = 0;
      const workedOn: string[] = [];
      const active = projects.filter((pr) => pr.start <= d && (!pr.end || pr.end >= d));
      const works = !vacation && (isWeekend ? chance(0.18) : chance(0.9));
      if (works && active.length) {
        const n = isToday ? 1 : isWeekend ? 1 : chance(0.55) ? 2 : chance(0.5) ? 3 : 1;
        let clock = isToday ? 8 * 60 + 30 : Math.round(rand(7.5, 10) * 4) * 15;
        for (let i = 0; i < n; i++) {
          const pr = chance(0.12) ? own : pick(active.filter((x) => x !== own).length ? active.filter((x) => x !== own) : [own]);
          const catName = pr.name.includes('SEO') ? (chance(0.7) ? 'SEO' : pick(['Content', 'Client calls'])) : pr === own ? pick(['Admin', 'Design', 'Content']) : pick(['Design', 'Design', 'Development', 'Development', 'Client calls', 'Content']);
          const len = catName === 'Client calls' ? Math.round(rand(2, 4)) * 15 : Math.round(rand(isToday ? 8 : 5, 16)) * 15;
          const brk = len > 150 && chance(0.4) ? 15 : 0;
          const start = clock;
          const end = start + len + brk;
          if (end >= 23 * 60) break;
          const minutes = len;
          const task = pick(tasks[catName]);
          const rateCents = pr === own ? null : (pr.rate ?? (p > 0.55 ? 40 : 35)) * 100;
          const payType = pr === own ? 'unpaid' : 'hourly';
          const earned = rateCents ? Math.round((minutes * rateCents) / 60) : 0;
          const desc = `${task[0].toUpperCase()}${task.slice(1)}`;
          ins(
            `INSERT INTO work_sessions (date, start_time, end_time, break_minutes, minutes, project_id, category_id, description,
               pay_type, hourly_rate_cents, earned_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            d, `${pad2(Math.floor(start / 60))}:${pad2(start % 60)}`, `${pad2(Math.floor(end / 60) % 24)}:${pad2(end % 60)}`,
            brk, minutes, pr.id, cat[catName], desc, payType, rateCents, earned, `${d} 12:00:00`,
          );
          dayMinutes += minutes;
          workedOn.push(`${task} for ${pr.name.replace(/ (website|redesign|site|shop)$/i, '')}`);
          clock = end + Math.round(rand(2, 6)) * 15;
        }
      }
      // Flat-rate jobs now and then.
      if (!isToday && !vacation && !isWeekend && chance(0.025)) {
        const job = pick([
          ['Logo refresh', 350_00], ['Landing page build', 600_00], ['Email template', 180_00], ['Google Ads setup', 250_00], ['Website audit', 200_00],
        ] as [string, number][]);
        const minutes = Math.round(rand(8, 20)) * 15;
        ins(
          `INSERT INTO work_sessions (date, minutes, category_id, description, pay_type, flat_amount_cents, earned_cents)
           VALUES (?, ?, ?, ?, 'flat', ?, ?)`,
          d, minutes, cat[job[0].includes('Ads') ? 'SEO' : 'Design'], job[0], job[1], job[1],
        );
        dayMinutes += minutes;
      }
      // Retainers and other income.
      if (parts(d).d === 1 && d >= projects[2].start) ins("INSERT INTO income (date, amount_cents, source, kind, project_id, category_id) VALUES (?, 45000, 'Monthly SEO retainer', 'project', ?, ?)", d, projects[2].id, cat.SEO);
      if (parts(d).d === 1 && d >= projects[5].start) ins("INSERT INTO income (date, amount_cents, source, kind, project_id, category_id) VALUES (?, 60000, 'Local SEO retainer', 'project', ?, ?)", d, projects[5].id, cat.SEO);
      for (const pr of projects) {
        if (pr.end === d && pr.status === 'completed') {
          ins("INSERT INTO income (date, amount_cents, source, kind, project_id) VALUES (?, ?, 'Launch milestone payment', 'project', ?)", d, Math.round(rand(8, 15)) * 10000, pr.id);
          ins('INSERT INTO accomplishments (date, text, is_milestone) VALUES (?, ?, 1)', d, `Launched ${pr.name.replace(/ (redesign|website|site|shop)$/i, '')}’s new site`);
        }
      }
      if (chance(0.012) && !isToday) ins("INSERT INTO income (date, amount_cents, source, kind) VALUES (?, ?, ?, 'other')", d, Math.round(rand(5, 30)) * 1000, pick(['Sold old camera lens', 'Referral bonus', 'Stock photo sales', 'Tutoring session']));

      // ── Workout ──
      let workedOut = false;
      const gymChance = vacation ? 0.1 : isWeekend ? 0.35 : 0.58;
      if (!isToday && chance(gymChance)) {
        workedOut = true;
        const name = rotation[rot++ % rotation.length];
        const morning = chance(0.4);
        const dur = Math.round(rand(52, 82));
        const wid = ins('INSERT INTO workouts (date, name, start_time, duration_minutes, notes) VALUES (?, ?, ?, ?, ?)', d, name, morning ? '06:15' : '17:45', dur, chance(0.08) ? pick(['Felt strong today.', 'Shoulder a little tight, kept it light.', 'Short on time — superset the accessories.', 'Great pump.']) : null);
        split[name].forEach((exName, pos) => {
          const l = lifts[exName];
          const weId = ins('INSERT INTO workout_exercises (workout_id, exercise_id, position) VALUES (?, ?, ?)', wid, exId[exName], pos);
          if (l.bw) {
            const base = Math.round(6 + 5 * p + rand(-1, 1));
            for (let s = 0; s < 3; s++) ins('INSERT INTO sets (workout_exercise_id, position, weight_kg, reps) VALUES (?, ?, NULL, ?)', weId, s, Math.max(3, base - s));
            return;
          }
          const e1 = e1rmOn(exName, d);
          const reps = Math.round(rand(l.reps[0], l.reps[1]));
          const w = Math.max(l.step, Math.round(e1 / (1 + reps / 30) / l.step) * l.step);
          if (pos === 0) ins('INSERT INTO sets (workout_exercise_id, position, weight_kg, reps, is_warmup) VALUES (?, 0, ?, 10, 1)', weId, lb(Math.round((w * 0.55) / 5) * 5));
          const setsN = pos < 2 ? 3 : chance(0.5) ? 3 : 2;
          for (let s = 0; s < setsN; s++) {
            const r = Math.max(1, reps - (s === setsN - 1 && chance(0.4) ? 1 : 0));
            ins('INSERT INTO sets (workout_exercise_id, position, weight_kg, reps, rpe) VALUES (?, ?, ?, ?, ?)', weId, s + 1, lb(w), r, s === setsN - 1 && chance(0.5) ? Math.round(rand(7.5, 9.5) * 2) / 2 : null);
          }
        });
      }

      // ── Body ──
      if (!isToday && (wd === 1 || wd === 4 || (wd === 6 && chance(0.5)))) {
        if (parts(d).d <= 7 && wd === 1) {
          const m = measure(d);
          ins(
            `INSERT INTO body_metrics (date, weight_kg, waist_cm, chest_cm, arms_cm, forearms_cm, shoulders_cm, thighs_cm, calves_cm, neck_cm)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            d, lb(Math.round(weightOn(d) * 10) / 10), inch(Math.round(m.waist * 4) / 4), inch(Math.round(m.chest * 4) / 4), inch(Math.round(m.arms * 4) / 4),
            inch(Math.round(m.forearms * 4) / 4), inch(Math.round(m.shoulders * 4) / 4), inch(Math.round(m.thighs * 4) / 4), inch(Math.round(m.calves * 4) / 4), inch(Math.round(m.neck * 4) / 4),
          );
        } else ins('INSERT INTO body_metrics (date, weight_kg) VALUES (?, ?)', d, lb(Math.round(weightOn(d) * 10) / 10));
      }

      // ── Rating & journal ──
      if (!isToday && chance(vacation ? 0.7 : 0.9)) {
        let pg = 0.42 + (workedOut ? 0.2 : 0) + (dayMinutes >= 180 && dayMinutes <= 480 ? 0.12 : 0) + (dayMinutes > 540 ? -0.15 : 0) + p * 0.08;
        if (vacation) pg = 0.75;
        const pb = dayMinutes === 0 && !isWeekend && !vacation ? 0.28 : 0.08;
        const x = R();
        const rating = x < pg ? 3 : x < pg + pb ? 1 : 2;
        let journal: string | null = null;
        if (chance(0.38) || (d >= addDays(today, -6))) {
          const bits: string[] = [];
          if (workedOn.length) bits.push(`Worked on ${workedOn.slice(0, 2).join(' and ')}`);
          if (dayMinutes >= 60) bits.push(`${Math.round(dayMinutes / 30) / 2} hours total`);
          if (workedOut) bits.push(pick(['had a good workout', 'got a lift in', 'gym after work', 'trained early']));
          if (vacation) bits.push(pick(['Beach day with family', 'Took the day completely off', 'Road trip day']));
          const feel = rating === 3 ? pick(goodFeel) : rating === 2 ? pick(okFeel) : pick(badFeel);
          journal = `${pick(journalOpeners)} ${bits.length ? bits.join(', ') + ', and ' : ''}${feel}.`.replace(/^(.)/, (c) => c.toUpperCase());
        }
        ins('INSERT INTO days (date, rating, rated_at, journal) VALUES (?, ?, ?, ?)', d, rating, `${d}T22:00:00.000Z`, journal);
      }

      // ── Notes & wins ──
      if (!isToday && chance(0.05))
        ins('INSERT INTO notes (date, time, body) VALUES (?, ?, ?)', d, `${pad2(Math.round(rand(9, 20)))}:${pad2(Math.round(rand(0, 5)) * 10)}`, pick([
          'Idea: offer a maintenance plan for past clients.', 'Call back about the gallery photos.', 'Try the new invoicing template next month.',
          'Remember to renew the domain for the portfolio.', 'Read 30 pages tonight.', 'Client loved the mobile header.', 'Look into schema for local services.',
        ]));
      if (!isToday && workedOn.length && chance(0.07)) {
        ins('INSERT INTO accomplishments (date, text) VALUES (?, ?)', d, pick([
          'Shipped the homepage draft', 'Got sign-off on the design', 'Fixed the mobile menu bug', 'Page speed score to 98', 'Sent all invoices on time',
          'First page of Google for a target keyword', 'Finished the service page templates', 'Wrapped the content walkthrough',
        ]));
      }
    }

    // A few hand-picked milestones.
    ins('INSERT INTO accomplishments (date, text, is_milestone) VALUES (?, ?, 1)', make(y0 + 1, 2, 17), 'Benched 225 for the first time');
    ins('INSERT INTO accomplishments (date, text, is_milestone) VALUES (?, ?, 1)', make(y0, 10, 31), 'First $5,000 month');
    ins('INSERT INTO accomplishments (date, text, is_milestone) VALUES (?, ?, 1)', make(y0 + 1, 5, 6), 'Hit 175 lb bodyweight');
    // Today: work in progress for the HVAC site.
    ins('INSERT INTO accomplishments (date, text) VALUES (?, ?)', today, 'Finished the HVAC homepage hero section');

    // ── Progress photos: one set on the 1st of most months; the current month is still to do ──
    const firstMonth = monthKey(START);
    let m = firstMonth;
    let idx = 0;
    while (m < monthKey(today)) {
      const skip = idx === 4 || idx === 9;
      if (!skip) {
        const date = `${m}-01`;
        const setId = ins('INSERT INTO photo_sets (month, date, note) VALUES (?, ?, ?)', m, date, idx === 0 ? 'Starting point. Bathroom mirror, morning light.' : null);
        const p = progress(date);
        const [y, mm] = m.split('-');
        const dir = path.join(photosDir, y, mm);
        fs.mkdirSync(dir, { recursive: true });
        for (const angle of ['front', 'side', 'back'] as const) {
          const file = path.join(dir, `${date}-${angle}-sample.svg`);
          fs.writeFileSync(file, silhouette(angle, p, `${MONTHS[Number(mm) - 1].slice(0, 3).toUpperCase()} ${y}`));
          ins(
            'INSERT INTO photos (set_id, angle, file, thumb, mime, width, height, bytes) VALUES (?, ?, ?, NULL, ?, 600, 800, ?)',
            setId, angle, path.relative(root, file), 'image/svg+xml', fs.statSync(file).size,
          );
        }
      }
      m = monthKey(addMonths(`${m}-01`, 1));
      idx++;
    }

    // ── Goals ──
    const thisMonday = addDays(today, -((weekday(today) + 6) % 7));
    const gs: [string, string, string, number, number, ISODate | null, ISODate | null, number | null, number | null][] = [
      // title, metric, period, recurring, target, start, end, baseline, exercise
      ['Earn $5,000 this month', 'earnings', 'month', 1, 500000, START, null, null, null],
      ['Work 25 hours a week', 'hours', 'week', 1, 25 * 60, addDays(START, -((weekday(START) + 6) % 7)), null, null, null],
      ['Work out 4 times a week', 'workouts', 'week', 1, 4, addDays(START, -((weekday(START) + 6) % 7)), null, null, null],
      ['Bench 250 lb', 'exercise_weight', 'target', 0, lb(250), make(y0 + 1, 1, 1), null, lb(205), exId['Bench Press']],
      ['Reach 170 lb', 'weight', 'target', 0, lb(170), make(y0 + 1, 1, 1), null, lb(178.4), null],
      ['Monthly progress photos', 'photos', 'month', 1, 1, START, null, null, null],
      [`Earn $55,000 in ${y0 + 1}`, 'earnings', 'year', 1, 5500000, make(y0, 1, 1), null, null, null],
      [`150 workouts in ${y0 + 1}`, 'workouts', 'year', 1, 150, make(y0, 1, 1), null, null, null],
      ['Complete 4 client projects', 'projects_completed', 'year', 1, 4, make(y0, 1, 1), null, null, null],
      ['Work 3+ hours', 'hours', 'day', 1, 180, addDays(today, -120), null, null, null],
      ['Read 20 pages', 'manual', 'day', 1, 1, addDays(today, -120), null, null, null],
      ['Waist under 33 in', 'waist', 'target', 0, inch(33), make(y0 + 1, 1, 1), null, inch(34.4), null],
    ];
    gs.forEach(([title, metric, period, rec, target, start, end, base, ex], i) => {
      const gid = ins(
        'INSERT INTO goals (title, metric, period, recurring, start_date, end_date, target, baseline, exercise_id, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        title, metric, period, rec, start, end, target, base, ex, i,
      );
      if (metric === 'manual') for (const d of eachDay(start!, addDays(today, -1))) if (chance(0.62)) ins('INSERT INTO goal_checkins (goal_id, date, value) VALUES (?, ?, 1)', gid, d);
    });

    // ── Written reviews for a few past periods ──
    const reviewMonth = (ym: string, a: Record<string, string>) => ins('INSERT INTO reviews (kind, period_start, answers) VALUES (\'month\', ?, ?)', `${ym}-01`, JSON.stringify(a));
    reviewMonth(monthKey(addMonths(startOfMonth(today), -1)), {
      well: 'HVAC project kicked off smoothly and I kept a steady four-day gym rhythm. Evenings were calmer.',
      improve: 'Too many small context switches between clients. Batch calls on Tuesdays and Thursdays.',
      biggest: 'Leaf River Outfitters launch went live without a hitch.',
      next: 'Finish HVAC design, keep weight trending down, fewer late nights.',
    });
    reviewMonth(monthKey(addMonths(startOfMonth(today), -2)), {
      well: 'Best month for the gym in a while — squat finally moving again.',
      improve: 'Proposal writing dragged. Build a template.',
      biggest: 'Signed the Gulf Coast HVAC project.',
      next: 'Launch Leaf River, start HVAC discovery.',
    });
    ins("INSERT INTO reviews (kind, period_start, answers) VALUES ('week', ?, ?)", addDays(thisMonday, -7), JSON.stringify({
      well: 'Homepage direction approved. Four workouts.',
      improve: 'Went to bed too late Wednesday and Thursday.',
      focus: 'Service page templates and the booking flow.',
    }));
    ins("INSERT INTO reviews (kind, period_start, answers) VALUES ('year', ?, ?)", make(y0, 1, 1), JSON.stringify({
      well: 'Went full-time on 601 Digital and it held up.',
      improve: 'Charge more, sooner.',
      biggest: 'Five launches and a stronger, lighter me.',
      next: 'Raise rates, keep training four days a week, fewer but better clients.',
    }));
  })();
}

/**
 * A tasteful placeholder "progress photo": a neutral figure on a studio backdrop,
 * visibly marked as sample. Its build narrows slightly over time.
 */
function silhouette(angle: 'front' | 'side' | 'back', p: number, label: string): string {
  const waist = 58 - 9 * p;
  const shoulder = 102 + 6 * p;
  const cx = 300;
  let body: string;
  if (angle === 'side') {
    const belly = 34 - 10 * p;
    body = `
      <ellipse cx="${cx}" cy="185" rx="34" ry="42"/>
      <rect x="${cx - 14}" y="222" width="28" height="30" rx="10"/>
      <path d="M${cx - 30} 250 C ${cx - 44} 300, ${cx - 42} 360, ${cx - 30} 420 L ${cx - 26} 470
               C ${cx - 30} 540, ${cx - 26} 640, ${cx - 20} 730 L ${cx + 18} 730
               C ${cx + 24} 640, ${cx + 26} 540, ${cx + 24} 470
               C ${cx + belly} 430, ${cx + belly + 8} 360, ${cx + 30} 300 C ${cx + 34} 272, ${cx + 28} 256, ${cx + 20} 250 Z"/>
      <path d="M${cx - 10} 262 C ${cx - 2} 330, ${cx + 4} 390, ${cx - 4} 450 L ${cx + 8} 452 C ${cx + 16} 390, ${cx + 12} 330, ${cx + 8} 262 Z" opacity=".35"/>`;
  } else {
    body = `
      <ellipse cx="${cx}" cy="185" rx="36" ry="44"/>
      <rect x="${cx - 16}" y="224" width="32" height="28" rx="10"/>
      <path d="M${cx - shoulder} 262 C ${cx - shoulder - 10} 300, ${cx - shoulder - 14} 400, ${cx - shoulder + 6} 470
               L ${cx - shoulder + 26} 468 C ${cx - shoulder + 22} 400, ${cx - shoulder + 30} 330, ${cx - shoulder + 40} 300
               C ${cx - waist - 6} 360, ${cx - waist} 420, ${cx - waist - 4} 460
               C ${cx - 64} 560, ${cx - 52} 650, ${cx - 44} 730 L ${cx - 8} 730 L ${cx} 520 L ${cx + 8} 730 L ${cx + 44} 730
               C ${cx + 52} 650, ${cx + 64} 560, ${cx + waist + 4} 460
               C ${cx + waist} 420, ${cx + waist + 6} 360, ${cx + shoulder - 40} 300
               C ${cx + shoulder - 30} 330, ${cx + shoulder - 22} 400, ${cx + shoulder - 26} 468 L ${cx + shoulder - 6} 470
               C ${cx + shoulder + 14} 400, ${cx + shoulder + 10} 300, ${cx + shoulder} 262
               C ${cx + 60} 246, ${cx - 60} 246, ${cx - shoulder} 262 Z"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d4ca"/><stop offset="1" stop-color="#bdb6aa"/></linearGradient>
    <radialGradient id="light" cx=".35" cy=".25" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="600" height="800" fill="url(#bg)"/>
  <rect y="690" width="600" height="110" fill="#a8a195"/>
  <rect width="600" height="800" fill="url(#light)"/>
  <g fill="#6e675d">${body}</g>
  <text x="28" y="48" font-family="system-ui, sans-serif" font-size="20" font-weight="600" letter-spacing="2" fill="#4f4a42">${angle.toUpperCase()}</text>
  <text x="28" y="74" font-family="system-ui, sans-serif" font-size="16" letter-spacing="1.5" fill="#4f4a42" opacity=".7">${label}</text>
  <text x="572" y="772" text-anchor="end" font-family="system-ui, sans-serif" font-size="14" letter-spacing="3" fill="#4f4a42" opacity=".6">SAMPLE PHOTO</text>
</svg>`;
}
