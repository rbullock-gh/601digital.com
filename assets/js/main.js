/* =============================================================
   601 DIGITAL — interaction layer
   Vanilla, dependency-free, GPU-friendly, reduced-motion aware.
   ============================================================= */
(() => {
  'use strict';

  const rmq = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = () => rmq.matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* rAF scroll bus — one listener, many subscribers */
  const onScroll = (() => {
    const subs = new Set();
    let ticking = false;
    const run = () => { ticking = false; subs.forEach(fn => fn()); };
    const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(run); } };
    addEventListener('scroll', req, { passive: true });
    addEventListener('resize', req, { passive: true });
    return fn => { subs.add(fn); fn(); return () => subs.delete(fn); };
  })();

  /* ---------------------------------------------------------
     1. Scroll reveals
     --------------------------------------------------------- */
  const revealables = $$('[data-reveal], .proc__step');
  if (revealables.length) {
    if (reduced()) {
      revealables.forEach(el => el.classList.add('is-in'));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
      revealables.forEach(el => io.observe(el));
    }
  }

  /* ---------------------------------------------------------
     2. Nav — pin, auto-hide, and light/dark surface matching
     --------------------------------------------------------- */
  const nav = $('#nav');
  if (nav) {
    let lastY = scrollY;
    let surfaces = [];
    const measure = () => {
      surfaces = $$('.surface').map(el => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top + scrollY, bottom: r.bottom + scrollY,
          dark: el.classList.contains('inverted'),
          charcoal: el.classList.contains('inverted--charcoal'),
        };
      });
    };
    measure();
    addEventListener('resize', measure, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

    onScroll(() => {
      const y = scrollY;
      nav.classList.toggle('nav--pinned', y > 24);

      // hide on scroll down, reveal on scroll up (never while menu is open)
      const down = y > lastY && y > 320;
      if (!document.body.classList.contains('menu-open')) {
        nav.classList.toggle('nav--hidden', down && !reduced());
      }
      lastY = y;

      // match the surface sitting under the bar
      const probe = y + nav.offsetHeight * 0.55;
      const hit = surfaces.find(s => probe >= s.top && probe < s.bottom);
      nav.classList.toggle('nav--dark', !!(hit && hit.dark));
      nav.classList.toggle('nav--charcoal', !!(hit && hit.charcoal));
    });
  }

  /* ---------------------------------------------------------
     3. Mobile menu
     --------------------------------------------------------- */
  const burger = $('#burger');
  const menu = $('#menu');
  if (burger && menu) {
    let open = false;
    const focusables = () => $$('a[href], button', menu);

    const setOpen = (next) => {
      open = next;
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('menu-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) {
        menu.hidden = false;
        requestAnimationFrame(() => menu.classList.add('is-open'));
        nav && nav.classList.remove('nav--hidden');
      } else {
        menu.classList.remove('is-open');
        const done = () => { if (!open) menu.hidden = true; };
        reduced() ? done() : setTimeout(done, 760);
      }
    };

    burger.addEventListener('click', () => setOpen(!open));
    menu.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
    addEventListener('keydown', e => {
      if (!open) return;
      if (e.key === 'Escape') { setOpen(false); burger.focus(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ---------------------------------------------------------
     4. Hero stack — cursor tilt (desktop only)
     --------------------------------------------------------- */
  const stack = $('[data-tilt]');
  if (stack && finePointer.matches && !reduced()) {
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let raf = null, alive = false;

    const tick = () => {
      cur.x = lerp(cur.x, target.x, 0.07);
      cur.y = lerp(cur.y, target.y, 0.07);
      stack.style.transform =
        `rotateX(${(-cur.y * 4.5).toFixed(3)}deg) rotateY(${(cur.x * 6).toFixed(3)}deg) translate3d(${(cur.x * 10).toFixed(2)}px, ${(cur.y * 6).toFixed(2)}px, 0)`;
      const back = stack.querySelector('.stack__item--back');
      const mid  = stack.querySelector('.stack__item--mid');
      if (back) back.style.transform = `translate3d(${(cur.x * -26).toFixed(2)}px, ${(cur.y * -16).toFixed(2)}px, 60px)`;
      if (mid)  mid.style.transform  = `translate3d(${(cur.x * 22).toFixed(2)}px, ${(cur.y * 14).toFixed(2)}px, 90px)`;
      if (Math.abs(cur.x - target.x) > 0.0005 || Math.abs(cur.y - target.y) > 0.0005) raf = requestAnimationFrame(tick);
      else { raf = null; alive = false; }
    };
    const wake = () => { if (!raf) { alive = true; raf = requestAnimationFrame(tick); } };

    addEventListener('pointermove', e => {
      const r = stack.getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) return;
      target.x = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
      target.y = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1);
      wake();
    }, { passive: true });
  }

  /* ---------------------------------------------------------
     5. Device toggle — animated resize between breakpoints
     --------------------------------------------------------- */
  $$('[data-devtoggle]').forEach(group => {
    const stage = group.closest('.devbar')?.parentElement?.querySelector('[data-stage]')
               || group.closest('.work-item')?.querySelector('[data-stage]');
    const pill = group.querySelector('.devtoggle__pill');
    const btns = $$('.devtoggle__btn', group);

    const movePill = (btn) => {
      if (!pill || !btn) return;
      pill.style.width = btn.offsetWidth + 'px';
      pill.style.transform = `translate3d(${btn.offsetLeft - 3}px,0,0)`;
    };

    const select = (btn) => {
      btns.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      if (stage) stage.dataset.device = btn.dataset.device;
      movePill(btn);
    };

    btns.forEach(btn => btn.addEventListener('click', () => select(btn)));
    // arrow-key navigation within the group
    group.addEventListener('keydown', e => {
      const i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      let n = null;
      if (e.key === 'ArrowRight') n = btns[(i + 1) % btns.length];
      if (e.key === 'ArrowLeft')  n = btns[(i - 1 + btns.length) % btns.length];
      if (n) { e.preventDefault(); n.focus(); select(n); }
    });

    const init = () => movePill(btns.find(b => b.getAttribute('aria-pressed') === 'true') || btns[0]);
    init();
    addEventListener('resize', init, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(init);
  });

  /* ---------------------------------------------------------
     6. Before → After slider
     --------------------------------------------------------- */
  $$('[data-ba]').forEach(frame => {
    const range = frame.querySelector('[data-ba-range]');
    let pos = 50, dragging = false, raf = null;

    const paint = () => { raf = null; frame.style.setProperty('--ba-pos', pos + '%'); };
    const set = (p, syncRange = true) => {
      pos = clamp(p, 0, 100);
      if (syncRange && range) range.value = String(pos);
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const fromEvent = (e) => {
      const r = frame.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    };

    frame.addEventListener('pointerdown', e => {
      if (e.target === range) return;
      dragging = true;
      frame.setPointerCapture?.(e.pointerId);
      fromEvent(e);
    });
    frame.addEventListener('pointermove', e => { if (dragging) fromEvent(e); });
    const stop = e => { dragging = false; frame.releasePointerCapture?.(e.pointerId); };
    frame.addEventListener('pointerup', stop);
    frame.addEventListener('pointercancel', stop);
    frame.addEventListener('lostpointercapture', () => { dragging = false; });

    if (range) {
      range.addEventListener('input', () => set(parseFloat(range.value), false));
      range.addEventListener('focus', () => frame.classList.add('is-focus'));
      range.addEventListener('blur', () => frame.classList.remove('is-focus'));
    }

    // a gentle one-time nudge so visitors notice it's draggable
    if (!reduced()) {
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          obs.disconnect();
          const start = performance.now(), dur = 2200;
          const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;
          const step = (now) => {
            if (dragging) return;
            const t = clamp((now - start) / dur, 0, 1);
            const e = ease(t);
            set(50 + Math.sin(e * Math.PI * 2) * 26);
            if (t < 1) requestAnimationFrame(step); else set(50);
          };
          setTimeout(() => requestAnimationFrame(step), 420);
        });
      }, { threshold: 0.5 });
      io.observe(frame);
    }
    set(50);
  });

  /* ---------------------------------------------------------
     7. The 601 Transformation — scroll-driven morph
     --------------------------------------------------------- */
  const xform = $('[data-xform]');
  if (xform) {
    const stage = $('[data-xform-stage]', xform);
    const rows = $$('[data-xform-row]', xform);
    const badge = $('[data-xform-badge]', xform);

    if (reduced()) {
      stage && stage.style.setProperty('--xf', '100%');
      rows.forEach(r => r.classList.add('is-lit'));
      if (badge) badge.textContent = 'After 601';
    } else {
      onScroll(() => {
        const r = xform.getBoundingClientRect();
        // 0 when the block's top reaches 70% of viewport, 1 when its bottom passes 55%
        const span = r.height + innerHeight * 0.15;
        const p = clamp((innerHeight * 0.72 - r.top) / span, 0, 1);
        const eased = p * p * (3 - 2 * p);           // smoothstep
        const pct = (eased * 100);
        if (stage) {
          stage.style.setProperty('--xf', pct.toFixed(2) + '%');
          stage.style.setProperty('--xf-op', (pct > 1 && pct < 99 ? 1 : 0).toFixed(2));
        }
        rows.forEach((row, i) => row.classList.toggle('is-lit', eased >= (i + 0.55) / rows.length));
        if (badge) badge.textContent = pct > 55 ? 'After 601' : 'Before 601';
      });
    }
  }

  /* ---------------------------------------------------------
     8. Spotlight-following cards
     --------------------------------------------------------- */
  if (finePointer.matches && !reduced()) {
    $$('[data-spotlight]').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      }, { passive: true });
    });
  }

  /* ---------------------------------------------------------
     9. Magnetic buttons
     --------------------------------------------------------- */
  if (finePointer.matches && !reduced()) {
    $$('.btn').forEach(btn => {
      let raf = null, tx = 0, ty = 0;
      const apply = () => { raf = null; btn.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`; };
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        tx = ((e.clientX - (r.left + r.width / 2)) / r.width) * 16;
        ty = ((e.clientY - (r.top + r.height / 2)) / r.height) * 14;
        if (!raf) raf = requestAnimationFrame(apply);
      }, { passive: true });
      const reset = () => {
        tx = ty = 0;
        btn.style.transition = 'transform .55s cubic-bezier(0.16,1,0.3,1)';
        if (!raf) raf = requestAnimationFrame(apply);
        setTimeout(() => { btn.style.transition = ''; }, 560);
      };
      btn.addEventListener('pointerleave', reset);
      btn.addEventListener('blur', reset);
    });
  }

  /* ---------------------------------------------------------
     10. Number counters
     --------------------------------------------------------- */
  const counters = $$('.counter[data-count]');
  if (counters.length) {
    if (reduced()) {
      counters.forEach(el => { el.textContent = el.dataset.count; });
    } else {
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          obs.unobserve(en.target);
          const el = en.target;
          const to = parseInt(el.dataset.count, 10) || 0;
          const pad = el.dataset.count.length;
          const dur = 1400, start = performance.now();
          const ease = t => 1 - Math.pow(1 - t, 4);
          const step = now => {
            const t = clamp((now - start) / dur, 0, 1);
            el.textContent = String(Math.round(to * ease(t))).padStart(to === 0 ? 1 : pad, '0');
            if (t < 1) requestAnimationFrame(step); else el.textContent = el.dataset.count;
          };
          requestAnimationFrame(step);
        });
      }, { threshold: 0.6 });
      counters.forEach(el => { el.textContent = '0'; io.observe(el); });
    }
  }

  /* ---------------------------------------------------------
     11. 601 dial — ticks + ring draw
     --------------------------------------------------------- */
  const dial = $('[data-dial]');
  if (dial) {
    const ticks = $('[data-dial-ticks]', dial);
    if (ticks) {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const long = i % 5 === 0;
        const r1 = long ? 138 : 146, r2 = 152;
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', (200 + Math.cos(a) * r1).toFixed(2));
        l.setAttribute('y1', (200 + Math.sin(a) * r1).toFixed(2));
        l.setAttribute('x2', (200 + Math.cos(a) * r2).toFixed(2));
        l.setAttribute('y2', (200 + Math.sin(a) * r2).toFixed(2));
        l.setAttribute('stroke-width', long ? '1.6' : '0.8');
        l.setAttribute('opacity', long ? '0.85' : '0.4');
        frag.appendChild(l);
      }
      ticks.appendChild(frag);
    }
    const ring = $('[data-dial-ring]', dial);
    if (ring) {
      const LEN = 2 * Math.PI * 178;
      ring.setAttribute('stroke-dasharray', LEN.toFixed(1));
      if (reduced()) {
        ring.setAttribute('stroke-dashoffset', (LEN * 0.22).toFixed(1));
      } else {
        ring.setAttribute('stroke-dashoffset', LEN.toFixed(1));
        const io = new IntersectionObserver((entries, obs) => {
          entries.forEach(en => {
            if (!en.isIntersecting) return;
            obs.disconnect();
            ring.style.transition = 'stroke-dashoffset 2.2s cubic-bezier(0.16,1,0.3,1)';
            requestAnimationFrame(() => ring.setAttribute('stroke-dashoffset', (LEN * 0.22).toFixed(1)));
          });
        }, { threshold: 0.35 });
        io.observe(dial);
      }
    }
    if (!reduced()) {
      onScroll(() => {
        const r = dial.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        const p = (innerHeight / 2 - (r.top + r.height / 2)) / innerHeight;
        dial.style.transform = `rotate(${(p * 16).toFixed(2)}deg)`;
      });
    }
  }

  /* ---------------------------------------------------------
     12. CTA glow parallax
     --------------------------------------------------------- */
  const glow = $('[data-glow]');
  if (glow && !reduced()) {
    const host = glow.parentElement;
    onScroll(() => {
      const r = host.getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) return;
      const p = (innerHeight - r.top) / (innerHeight + r.height);
      glow.style.transform = `translate3d(-50%, calc(-50% + ${((p - 0.5) * 140).toFixed(1)}px), 0)`;
    });
  }

  /* ---------------------------------------------------------
     13. Scroll-spy on nav + misc
     --------------------------------------------------------- */
  const spyTargets = $$('main section[id]');
  const navLinks = $$('.nav__link');
  if (spyTargets.length && navLinks.length) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const id = '#' + en.target.id;
        navLinks.forEach(a => {
          const on = a.getAttribute('href') === id;
          on ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    spyTargets.forEach(s => io.observe(s));
  }

  /* ---------------------------------------------------------
     14. Real before/after screenshots, when they exist.
         Each layer ships a CSS recreation plus an <img> slot. Drop a file at
         the slot's path and it takes over; if the file is absent the image
         removes itself and the recreation shows through. No build step.
     --------------------------------------------------------- */
  $$('[data-shot]').forEach(img => {
    const reveal = () => img.classList.add('is-loaded');
    img.addEventListener('error', () => img.remove(), { once: true });
    img.addEventListener('load', reveal, { once: true });
    if (img.complete) { img.naturalWidth ? reveal() : img.remove(); }
  });

  /* ---------------------------------------------------------
     14. Contact form — posts to an endpoint if one is configured,
         otherwise composes a pre-filled mail draft so the demo works.
     --------------------------------------------------------- */
  $$('[data-contact]').forEach(form => {
    const status = $('[data-form-status]', form);
    const say = (msg, state) => {
      if (!status) return;
      status.textContent = msg;
      if (state) status.dataset.state = state; else delete status.dataset.state;
    };

    const fieldOf = el => el.closest('.field');
    form.addEventListener('input', e => {
      const f = fieldOf(e.target);
      if (f && f.hasAttribute('data-invalid') && e.target.checkValidity()) f.removeAttribute('data-invalid');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const required = $$('[required]', form);
      let firstBad = null;
      required.forEach(el => {
        const f = fieldOf(el);
        if (!el.checkValidity()) { f && f.setAttribute('data-invalid', ''); firstBad = firstBad || el; }
        else f && f.removeAttribute('data-invalid');
      });
      if (firstBad) { say('Please check the highlighted fields.', 'error'); firstBad.focus(); return; }

      const data = Object.fromEntries(new FormData(form).entries());
      const endpoint = form.dataset.endpoint;

      if (endpoint) {
        say('Sending…');
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Accept': 'application/json' },
            body: new FormData(form),
          });
          if (!res.ok) throw new Error(res.status);
          form.reset();
          say('Thank you — we\u2019ll be in touch shortly.', 'ok');
        } catch (err) {
          say('That didn\u2019t send. Please email us directly.', 'error');
        }
        return;
      }

      // No endpoint wired yet: hand the visitor a pre-filled draft.
      const body = [
        `Name: ${data.name || ''}`,
        `Business: ${data.business || ''}`,
        `Email: ${data.email || ''}`,
        `Telephone: ${data.phone || ''}`,
        `Needs: ${data.kind || ''}`,
        '',
        data.message || '',
      ].join('\n');
      const href = `mailto:601digital@gmail.com?subject=${encodeURIComponent('New project enquiry — ' + (data.business || data.name || ''))}&body=${encodeURIComponent(body)}`;
      // Status first: the mail handoff can take a moment, or be blocked entirely.
      say('Opening your email app…', 'ok');
      form.dataset.lastDraft = href;
      location.href = href;
    });
  });

  const year = $('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
})();
