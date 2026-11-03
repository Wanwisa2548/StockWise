// app.js — โหลดข้อมูลและสลับหน้าการทำงาน/เครื่องมือวิเคราะห์
// แต่ละหน้าลงทะเบียนตัวเองที่ Pages.<key> = { render(root) }
const Pages = {};

const App = {
  data: null,          // ผลจาก /api/data
  // ค่าที่ผู้ใช้ปรับได้ และใช้ร่วมกันหลายหน้า (พยากรณ์ → แผนสั่งซื้อ → ภาพรวม)
  settings: { method: 'ma', n: 7, alpha: 0.30, confidenceLevel: 0.95, serviceLevel: 0.95, holdRate: 0.25 },
  tabs: [
    { key: 'overview', label: 'ภาพรวมร้าน', icon: 'overview' },
    { key: 'sales',    label: 'วิเคราะห์ยอดขาย', icon: 'sales' },
    { key: 'forecast', label: 'พยากรณ์ยอดขาย', icon: 'forecast' },
    { key: 'order',    label: 'แผนสั่งซื้อ', icon: 'order', badge: true },
    { key: 'expiry',   label: 'สินค้าใกล้หมดอายุ', icon: 'expiry', badge: true },
    { key: 'manage',   label: 'สินค้าและสต็อก', icon: 'manage' },
    { key: 'cluster',  label: 'จัดกลุ่มสินค้า', icon: 'cluster', section: 'วิเคราะห์และนำเสนอ' },
    { key: 'evaluation', label: 'เปรียบเทียบแผนสต็อก', icon: 'forecast' },
    { key: 'presentation', label: 'สไลด์นำเสนอ', icon: 'receipt' }
  ],
  current: 'overview',

  // เรียก API แบบ JSON: สำเร็จคืนผลลัพธ์ ไม่สำเร็จโยน Error พร้อมข้อความจากเซิร์ฟเวอร์
  async api(method, url, body) {
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || res.statusText);
    return json;
  },

  // ใบสั่งซื้อที่ยังรอของของสินค้านั้น (ถ้ามี)
  lockWrites(root) {
    if (!this.data.source?.readOnly) return;
    root.querySelectorAll('#f-save,#c-save,[data-po],[data-recv],[data-cancel],[data-del-po],[data-promo-lot],[data-del-promo],[data-save-product],[data-save-lot],[data-del-lot],#m-add-btn').forEach(button => { button.disabled = true; button.title = 'โหมดสาธิตไม่บันทึกฐานข้อมูล'; });
  },
  pendingOrder(pid) { return (this.data.orders || []).find(o => o.product_id === pid && o.status === 'ordered'); },
  // โปรโมชั่นที่ตั้งไว้ของล็อตนั้น (ถ้ามี)
  promoOfLot(lotId) { return (this.data.promotions || []).find(p => p.lot_id === lotId); },

  // แจ้งผลมุมขวาล่าง (ok = สำเร็จ, ไม่ใช่ = ผิดพลาด)
  toast(text, ok = true) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.className = 'toast ' + (ok ? 'ok' : 'bad');
    el.textContent = text; el.hidden = false;
    clearTimeout(this._tt); this._tt = setTimeout(() => { el.hidden = true; }, 4500);
  },

  // กดปุ่มแล้วเรียก API → โหลดข้อมูลใหม่ → วาดหน้าเดิมโดยคงตำแหน่งการเลื่อน; ผิดพลาดแจ้งข้อความจากเซิร์ฟเวอร์
  async act(btn, call, okText) {
    if (btn) btn.disabled = true;
    try {
      await call();
      await this.loadData();
      const y = window.scrollY;
      this.refresh();
      window.scrollTo(0, y);
      this.toast(okText, true);
    } catch (err) {
      if (btn) btn.disabled = false;
      this.toast(err.message, false);
    }
  },

  async loadData() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let json;
    try {
      const res = await fetch('/api/data', { signal: controller.signal });
      json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('ฐานข้อมูลตอบกลับช้าเกิน 30 วินาที กรุณาตรวจสอบ Tailscale แล้วโหลดหน้าใหม่');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
    this.data = json;
    document.getElementById('data-source-banner')?.remove();
    document.querySelector('.dataset-pill').innerHTML = json.source?.mode === 'demo' ? 'DEMO · SYNTHETIC DATA' : '<i></i> French Bakery Daily Sales';
    if (json.source?.mode === 'demo') {
      const banner = document.createElement('div'); banner.id = 'data-source-banner'; banner.className = 'dss-callout demo-banner';
      banner.textContent = 'โหมดสาธิต · ใช้ข้อมูลจำลองและไม่บันทึกฐานข้อมูล';
      document.querySelector('.topbar').insertAdjacentElement('afterend', banner);
    }
    this.updateBadges();
  },

  selProduct: null,    // สินค้าที่เลือกอยู่ (ใช้ร่วมกันหน้าพยากรณ์/ล็อต)

  esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  // จัดรูปแบบตัวเลขมีจุลภาค เช่น 1361 → "1,361", 42.3 → "42.3"
  fmt(n, dec = 0) { return n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); },
  money(n, dec = 2) { return '€' + this.fmt(n, dec); },
  downloadCSV(filename, rows) {
    const cell = value => {
      if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
      let text = String(value ?? '');
      if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const csv = rows.map(row => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  icon(name, className = '') {
    const paths = {
      overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
      sales: '<path d="M4 4v16h17M8 15V9m5 6V5m5 10v-4"/>',
      forecast: '<path d="M3 17 8 11l4 3 8-10M15 4h5v5M4 21h16"/>',
      order: '<path d="M3 3h2l3 13h11l2-10H6M10 20h.01M18 20h.01"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
      expiry: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      cluster: '<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="15" y="15" width="6" height="6" rx="1.5"/><path d="M18 3v6M15 6h6M6 15v6M3 18h6"/>',
      manage: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5m-9 5v9M7 5.8 16 11"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h2m4 0h2m-8 3h2"/>',
      download: '<path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/>',
      arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
      sparkle: '<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z"/>',
      revenue: '<path d="M17 5a7 7 0 1 0 0 14M4 10h10M4 14h10"/>',
      bread: '<path d="M6 18 4 11a4 4 0 0 1 4-5h8a4 4 0 0 1 4 5l-2 7H6Z"/><path d="m8 7 2 6m2-7 2 7m2-7 2 6M7 21h10"/>',
      receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6m-6 4h3"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      leaf: '<path d="M20 4C11 2 4 6 5 13s12 9 15-9ZM5 20 15 10"/>',
      wheat: '<path d="M12 21V5m0 5C8 10 5 7 6 4c4 0 6 2 6 6Zm0 5c-4 0-7-2-7-5 4 0 7 2 7 5Zm0-5c4 0 7-3 6-6-4 0-6 2-6 6Zm0 5c4 0 7-2 7-5-4 0-7 2-7 5Zm0 5c-4 0-6-2-6-4 3 0 6 1 6 4Zm0 0c4 0 6-2 6-4-3 0-6 1-6 4Z"/>',
      oven: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18m-13-2h.01M7 13h10v5H7zM11 2v2m5-2v2"/>',
      tag: '<path d="m3 3 8 0 10 10-8 8L3 11V3Z"/><circle cx="7.5" cy="7.5" r="1"/>',
      bag: '<path d="M5 7h14l2 14H3L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
      bell: '<path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4l-2 4Zm5 3h4"/>',
      shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>'
    };
    return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.overview}</svg>`;
  },
  product(id) { return this.data.products.find(p => p.id === id); },
  productOptions(sel) {
    return this.data.products.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${this.esc(p.name)}</option>`).join('');
  },

  // yyyy-mm-dd → "26 ก.ย. 2569"
  thaiDate(s) {
    const m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const [y, mo, d] = s.split('-').map(Number);
    return `${d} ${m[mo - 1]} ${y + 543}`;
  },
  // yyyy-mm-dd → "26 ก.ย."
  shortDate(s) { return this.thaiDate(s).split(' ').slice(0, 2).join(' '); },
  // บวกวันให้สตริงวันที่
  addDays(s, n) { return Calc.addDays(s, n); },

  buildTabs() {
    const nav = document.getElementById('tabs');
    nav.setAttribute('aria-orientation', window.innerWidth <= 760 ? 'horizontal' : 'vertical');
    nav.innerHTML = this.tabs.map((t, i) => `${t.section ? `<span class="nav-section" role="presentation">${t.section}</span>` : ''}<button id="tab-${t.key}" data-key="${t.key}" role="tab" aria-controls="page" aria-selected="false" tabindex="${i ? -1 : 0}">${this.icon(t.icon, 'nav-icon')}<span>${t.label}</span>${t.badge ? ` <span class="cnt" id="cnt-${t.key}" hidden></span>` : ''}</button>`).join('');
    nav.addEventListener('click', e => {
      const b = e.target.closest('button'); if (b) this.show(b.dataset.key);
    });
    nav.addEventListener('keydown', e => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const buttons = [...nav.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      let next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
        : (index + (['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus(); this.show(buttons[next].dataset.key);
    });
  },

  show(key) {
    if (!this.data) return;
    if (!this.tabs.some(t => t.key === key)) key = 'overview';
    this.current = key;
    history.replaceState(null, '', '#' + key);
    document.querySelectorAll('#tabs button').forEach(b => {
      b.classList.toggle('active', b.dataset.key === key);
      b.setAttribute('aria-selected', b.dataset.key === key);
      b.tabIndex = b.dataset.key === key ? 0 : -1;
    });
    const root = document.getElementById('page');
    root.setAttribute('aria-labelledby', 'tab-' + key);
    root.setAttribute('aria-busy', 'false');
    document.getElementById('page-breadcrumb').textContent = this.tabs.find(t => t.key === key).label;
    document.title = this.tabs.find(t => t.key === key).label + ' · StockWise French Bakery';
    root.innerHTML = '';
    root.onclick = null;   // ตัวจัดการคลิกของหน้าก่อนหน้าต้องไม่ค้างมา
    const page = Pages[key];
    if (page) page.render(root);
    else root.innerHTML = '<div class="card muted">หน้านี้กำลังพัฒนา</div>';
    this.lockWrites(root);
    if (this.data) this.updateBadges();
    window.scrollTo(0, 0);
  },

  // ตัวเลขแจ้งเตือนบนแท็บ: จำนวนสินค้าที่ต้องสั่งวันนี้ และจำนวนล็อตที่ควรจัดโปร/นำออก
  updateBadges() {
    const d = this.data, fcs = Calc.forecastAll(d, this.settings);
    const order = d.products.filter(p => { const plan = Calc.planFor(d, p, fcs[p.id], this.settings); return plan.dueToday || plan.review; }).length;
    const expiry = Calc.analyzeLots(d, fcs).filter(r => r.atRisk && !this.promoOfLot(r.lot.id)).length;
    [['order', order], ['expiry', expiry]].forEach(([k, n]) => {
      const el = document.getElementById('cnt-' + k);
      if (el) { el.textContent = n; el.hidden = n === 0; }
    });
  },

  // วาดหน้าปัจจุบันใหม่ (ใช้หลังบันทึกข้อมูล)
  refresh() { this.show(this.current); },

  onResize() {
    document.getElementById('tabs').setAttribute('aria-orientation', window.innerWidth <= 760 ? 'horizontal' : 'vertical');
    if (!this.data || this.current === 'manage') return;
    clearTimeout(this._rt);
    this._rt = setTimeout(() => {
      if (window.innerWidth !== this._w) { this._w = window.innerWidth; const y = window.scrollY; this.refresh(); window.scrollTo(0, y); }
    }, 200);
  },

  async start() {
    this._w = window.innerWidth;
    window.addEventListener('resize', () => this.onResize());
    this.buildTabs();
    document.querySelector('.brand-mark').innerHTML = BakeryVisuals.product({ name: 'croissant' });
    document.querySelector('.leaf-icon').innerHTML = this.icon('leaf');
    document.getElementById('brand-home').onclick = e => { e.preventDefault(); this.show('overview'); };
    window.addEventListener('hashchange', () => this.show(location.hash.slice(1)));
    document.getElementById('refresh-data').onclick = async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try { await this.loadData(); this.show(this.current); this.toast('อัปเดตข้อมูลจากฐานข้อมูลแล้ว'); }
      catch (err) { this.toast(err.message, false); }
      finally { btn.disabled = false; }
    };
    const root = document.getElementById('page');
    root.innerHTML = '<div class="loading">กำลังโหลดข้อมูลจากฐานข้อมูล…</div>';
    try {
      await this.loadData();
    } catch (err) {
      root.innerHTML = `<div class="error">โหลดข้อมูลไม่สำเร็จ: ${this.esc(err.message)}</div>`;
      root.setAttribute('aria-busy', 'false');
      return;
    }
    const hash = location.hash.slice(1);
    this.show(this.tabs.some(t => t.key === hash) ? hash : 'overview');
  }
};
