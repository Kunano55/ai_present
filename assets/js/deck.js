/* ═══════════════════════════════════════════════════════════
   deck.js — นำทางสไลด์: คีย์บอร์ด / คลิก / จุด / swipe / wheel / hash
   ═══════════════════════════════════════════════════════════ */

export class Deck {
  /**
   * @param {{onActivate?:Function, onDeactivate?:Function}} hooks
   */
  constructor(hooks = {}) {
    this.slides = [...document.querySelectorAll('.slide')];
    this.hooks = hooks;
    this.i = 0;
    this.locked = false;
    this.dots = [];
  }

  init() {
    const dotsHost = document.getElementById('navDots');
    const menuList = document.getElementById('menuList');
    const menu = document.getElementById('menu');

    this.slides.forEach((s, i) => {
      const d = document.createElement('button');
      d.className = 'dot';
      d.title = `${i + 1}. ${s.dataset.title || ''}`;
      d.addEventListener('click', () => this.goto(i));
      dotsHost.appendChild(d);
      this.dots.push(d);

      const li = document.createElement('li');
      li.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b><span>${s.dataset.title || `สไลด์ ${i + 1}`}</span>`;
      li.addEventListener('click', () => { this.closeMenu(); this.goto(i); });
      menuList.appendChild(li);
    });
    this.menuItems = [...menuList.children];

    document.getElementById('btnPrev').addEventListener('click', () => this.prev());
    document.getElementById('btnNext').addEventListener('click', () => this.next());
    document.getElementById('btnMenu').addEventListener('click', () => this.toggleMenu());
    document.getElementById('menuClose').addEventListener('click', () => this.closeMenu());
    menu.addEventListener('click', e => { if (e.target === menu) this.closeMenu(); });

    document.getElementById('btnFull').addEventListener('click', () => this.toggleFull());

    window.addEventListener('keydown', e => this.onKey(e));

    // touch swipe
    let sx = 0, sy = 0, st = 0;
    window.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
    }, { passive: true });
    window.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Date.now() - st > 700) return;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) { dx < 0 ? this.next() : this.prev(); }
      else if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx) * 1.4) { dy < 0 ? this.next() : this.prev(); }
    }, { passive: true });

    // wheel (ข้ามถ้ากำลัง scroll อยู่ในกล่องที่เลื่อนได้)
    let lastWheel = 0;
    window.addEventListener('wheel', e => {
      if (this.scrollableAncestor(e.target)) return;
      const now = Date.now();
      if (now - lastWheel < 750) return;
      if (Math.abs(e.deltaY) < 24 && Math.abs(e.deltaX) < 24) return;
      lastWheel = now;
      (e.deltaY > 0 || e.deltaX > 0) ? this.next() : this.prev();
    }, { passive: true });

    // เริ่มจาก hash
    const h = parseInt(location.hash.replace('#', ''), 10);
    this.goto(Number.isFinite(h) && h >= 1 && h <= this.slides.length ? h - 1 : 0, true);

    window.addEventListener('hashchange', () => {
      const n = parseInt(location.hash.replace('#', ''), 10);
      if (Number.isFinite(n) && n - 1 !== this.i && n >= 1 && n <= this.slides.length) this.goto(n - 1);
    });
  }

  scrollableAncestor(node) {
    let n = node;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 4) return true;
      n = n.parentElement;
    }
    return false;
  }

  onKey(e) {
    if (e.target.matches('input, textarea')) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': case 'Enter':
        e.preventDefault(); this.next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); this.prev(); break;
      case 'Home': e.preventDefault(); this.goto(0); break;
      case 'End': e.preventDefault(); this.goto(this.slides.length - 1); break;
      case 'o': case 'O': case 'ม': this.toggleMenu(); break;
      case 'f': case 'F': case 'ฟ': this.toggleFull(); break;
      case 'Escape': this.closeMenu(); break;
      default:
        if (/^[1-9]$/.test(e.key)) this.goto(parseInt(e.key, 10) - 1);
    }
  }

  toggleMenu() {
    const m = document.getElementById('menu');
    m.hidden ? (m.hidden = false) : (m.hidden = true);
  }
  closeMenu() { document.getElementById('menu').hidden = true; }

  toggleFull() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }

  goto(i, silent) {
    const n = Math.max(0, Math.min(this.slides.length - 1, i));
    if (n === this.i && !silent) return;
    if (this.locked && !silent) return;
    this.locked = true;
    setTimeout(() => { this.locked = false; }, 480);

    const from = this.i;
    this.i = n;
    this.slides.forEach((s, k) => {
      const on = k === n;
      s.classList.toggle('is-active', on);
      s.classList.toggle('is-exit-up', !on && k < n);
    });
    this.dots.forEach((d, k) => d.classList.toggle('is-on', k === n));
    this.menuItems.forEach((d, k) => d.classList.toggle('is-on', k === n));

    document.getElementById('navCount').textContent = `${n + 1} / ${this.slides.length}`;
    document.getElementById('progressBar').style.width = `${((n + 1) / this.slides.length) * 100}%`;
    document.getElementById('btnPrev').disabled = n === 0;
    document.getElementById('btnNext').disabled = n === this.slides.length - 1;
    if (!silent && history.replaceState) history.replaceState(null, '', `#${n + 1}`);

    if (from !== n) this.hooks.onDeactivate?.(this.slides[from], from);
    this.hooks.onActivate?.(this.slides[n], n);
  }

  next() { this.goto(this.i + 1); }
  prev() { this.goto(this.i - 1); }
}
