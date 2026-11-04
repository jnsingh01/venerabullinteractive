/* Venerabull Interactive: navigation, the motion setting and the app dialogs.
   Plain browser JavaScript, no dependencies and no network requests. */
(() => {
  'use strict';

  const root = document.documentElement;

  /* ---------- Motion: follows the system setting until the visitor chooses, then remembers the choice. ---------- */

  const KEY = 'vi-motion';
  const reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const readPref = () => { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } };
  const writePref = (v) => { try { window.localStorage.setItem(KEY, v); } catch (e) { /* storage unavailable */ } };
  let pref = readPref();
  const motionBtn = document.getElementById('motion-btn');

  function motionOn() {
    if (pref === 'on') return true;
    if (pref === 'off') return false;
    return !(reduceQuery && reduceQuery.matches);
  }

  function applyMotion() {
    const on = motionOn();
    root.classList.toggle('still', !on);
    root.classList.toggle('moving', on);
    if (motionBtn) {
      motionBtn.setAttribute('aria-pressed', String(on));
      motionBtn.title = on ? 'Motion is on. Turn it off.' : 'Motion is off. Turn it on.';
    }
    document.dispatchEvent(new CustomEvent('vi:motion', { detail: { on } }));
  }

  if (motionBtn) {
    motionBtn.addEventListener('click', () => {
      pref = motionOn() ? 'off' : 'on';
      writePref(pref);
      applyMotion();
    });
  }
  if (reduceQuery) {
    const onChange = () => { if (pref !== 'on' && pref !== 'off') applyMotion(); };
    if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', onChange);
    else if (reduceQuery.addListener) reduceQuery.addListener(onChange);
  }
  applyMotion();
  window.VIMotion = { on: motionOn };

  /* ---------- Masthead: a quiet ground appears once the page moves. ---------- */

  const mast = document.getElementById('mast');
  let mastTick = false;
  function updateMast() {
    mastTick = false;
    mast.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', () => {
    if (!mastTick) { mastTick = true; requestAnimationFrame(updateMast); }
  }, { passive: true });
  updateMast();

  /* ---------- The narrow-screen menu: a sheet that closes on Escape, on a press outside the masthead, when focus
     leaves the masthead, and once the page scrolls away from where it opened. ---------- */

  const menuBtn = document.getElementById('menu-btn');
  const nav = document.getElementById('primary-nav');
  const menuOpen = () => menuBtn.getAttribute('aria-expanded') === 'true';
  let menuY = 0;
  function setMenu(open, returnFocus) {
    nav.classList.toggle('is-open', open);
    mast.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.textContent = open ? 'Close' : 'Menu';
    if (open) menuY = window.scrollY;
    if (!open && returnFocus) menuBtn.focus();
  }
  menuBtn.addEventListener('click', () => setMenu(!menuOpen()));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen()) setMenu(false, true);
  });
  document.addEventListener('pointerdown', (e) => { if (menuOpen() && !mast.contains(e.target)) setMenu(false); }, { passive: true });
  mast.addEventListener('focusout', (e) => { if (menuOpen() && e.relatedTarget && !mast.contains(e.relatedTarget)) setMenu(false); });
  window.addEventListener('scroll', () => { if (menuOpen() && Math.abs(window.scrollY - menuY) > 24) setMenu(false); }, { passive: true });
  const wideQuery = window.matchMedia('(min-width: 761px)');
  const closeOnWide = (e) => { if (e.matches) setMenu(false); };
  if (wideQuery.addEventListener) wideQuery.addEventListener('change', closeOnWide);

  /* ---------- Where you are: the header marks the world in view. ---------- */

  const navLinks = Array.from(document.querySelectorAll('[data-nav]'));
  function setCurrent(name) {
    navLinks.forEach((a) => {
      if (name && a.dataset.nav === name) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) setCurrent(en.target.dataset.navSection || ''); });
    }, { rootMargin: '-49% 0px -50% 0px', threshold: 0 });
    document.querySelectorAll('main > .sec').forEach((s) => io.observe(s));
  }

  /* ---------- App dialogs: each app file opens in its own register. ---------- */

  const dlg = document.getElementById('project-dialog');
  const files = document.getElementById('files');
  const panel = document.getElementById('dlg-panel');
  const body = document.getElementById('dlg-body');
  const closeBtn = document.getElementById('dlg-close');
  const prevBtn = document.getElementById('dlg-prev');
  const nextBtn = document.getElementById('dlg-next');
  const prevName = document.getElementById('dlg-prev-name');
  const nextName = document.getElementById('dlg-next-name');
  const live = document.getElementById('dlg-live');
  const ORDER = ['forever', 'red-button'];
  const fileOf = (id) => document.getElementById('work-' + id);
  const nameOf = (id) => { const f = fileOf(id); return f ? f.querySelector('.file__title').textContent.trim() : ''; };

  let current = null;
  let trigger = null;
  let hashBefore = '';
  let leftByHistory = false;

  // While more of the file lies below the panel's foot, a quiet fade there says so.
  function updateMore() {
    dlg.classList.toggle('has-more', dlg.open && panel.scrollHeight - panel.clientHeight - panel.scrollTop > 2);
  }

  function render(id) {
    const src = fileOf(id);
    body.replaceChildren();
    Array.from(src.children).forEach((child) => body.appendChild(child.cloneNode(true)));
    body.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    const title = body.querySelector('.file__title');
    if (title) title.id = 'dlg-title';
    panel.dataset.brand = src.dataset.brand || '';
    dlg.dataset.brand = panel.dataset.brand;
    const i = ORDER.indexOf(id);
    const prev = ORDER[(i + ORDER.length - 1) % ORDER.length];
    const next = ORDER[(i + 1) % ORDER.length];
    prevBtn.dataset.target = prev;
    nextBtn.dataset.target = next;
    prevBtn.hidden = prev === next;
    prevName.textContent = nameOf(prev);
    nextName.textContent = nameOf(next);
    panel.scrollTop = 0;
    updateMore();
    current = id;
    try { history.replaceState(history.state, '', '#work-' + id); } catch (e) { /* a page opened from disk may refuse */ }
  }

  function openProject(id, from) {
    if (!fileOf(id)) return;
    trigger = from || document.querySelector('.explore[data-open="' + id + '"]');
    if (!dlg.open) hashBefore = location.hash.indexOf('#work-') === 0 ? '' : location.hash;
    render(id);
    if (!dlg.open) {
      dlg.showModal();
      root.classList.add('dlg-open');
      // A closed dialog keeps the scroll it was left at; a file always opens at its top.
      panel.scrollTop = 0;
      updateMore();
    }
    live.textContent = '';
    closeBtn.focus();
    // A page still finishing its load (a deep link) can take focus back; settle it once more.
    requestAnimationFrame(() => { if (dlg.open && !dlg.contains(document.activeElement)) closeBtn.focus(); });
  }

  function step(btn) {
    const id = btn.dataset.target;
    if (!id) return;
    render(id);
    live.textContent = 'Showing ' + nameOf(id) + '.';
    btn.focus();
  }

  const canDialog = dlg && typeof dlg.showModal === 'function';
  if (canDialog) {
    files.hidden = true;

    document.addEventListener('click', (e) => {
      const opener = e.target.closest('[data-open]');
      if (!opener) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      openProject(opener.dataset.open, opener);
    });

    closeBtn.addEventListener('click', () => dlg.close());
    panel.addEventListener('scroll', updateMore, { passive: true });
    window.addEventListener('resize', () => { if (dlg.open) updateMore(); });
    prevBtn.addEventListener('click', () => step(prevBtn));
    nextBtn.addEventListener('click', () => step(nextBtn));

    // A press on the dimmed backdrop (outside the panel) closes it.
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

    dlg.addEventListener('close', () => {
      root.classList.remove('dlg-open');
      dlg.classList.remove('has-more');
      current = null;
      // Closed by the browser's Back or Forward: the address is already where the browser put it.
      if (!leftByHistory) {
        try { history.replaceState(history.state, '', hashBefore || (location.pathname + location.search)); } catch (e) { /* ignore */ }
      }
      leftByHistory = false;
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
      trigger = null;
    });

    // The address decides: a project's address opens that project, and any other address closes an open one,
    // so the browser's Back from an open project closes it rather than leaving it open over another place.
    const fromHash = () => {
      const m = /^#work-([a-z-]+)$/.exec(location.hash);
      if (m && ORDER.indexOf(m[1]) !== -1) {
        if (current !== m[1]) openProject(m[1]);
      } else if (dlg.open) {
        leftByHistory = true;
        dlg.close();
      }
    };
    window.addEventListener('hashchange', fromHash);
    window.addEventListener('popstate', fromHash);
    if (document.readyState === 'complete') fromHash();
    else window.addEventListener('load', fromHash, { once: true });
  }
})();
