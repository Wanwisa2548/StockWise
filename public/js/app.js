// app.js — โหลดข้อมูลจาก /api/data แล้วสลับแท็บทั้ง 7 หน้า
// แต่ละหน้าลงทะเบียนตัวเองที่ Pages.<key> = { render(root) }
const Pages = {};

const App = {
  data: null,          // ผลจาก /api/data
  // ค่าที่ผู้ใช้ปรับได้ และใช้ร่วมกันหลายหน้า (พยากรณ์ → แผนสั่งซื้อ → ภาพรวม)
  settings: { method: 'ma', n: 7, alpha: 0.30, serviceLevel: 0.95, holdRate: 0.25 },
  tabs: [
    { key: 'overview', label: 'ภาพรวมวันนี้' },
    { key: 'forecast', label: 'พยากรณ์ยอดขาย' },
    { key: 'order',    label: 'แผนการสั่งซื้อ' },
    { key: 'expiry',   label: 'ใกล้หมดอายุ' },
    { key: 'sales',    label: 'รายการขาย' },
    { key: 'cluster',  label: 'จัดกลุ่มสินค้า' },
    { key: 'manage',   label: 'ข้อมูลสินค้า' }
  ],
  current: 'overview',

  async loadData() {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    this.data = await res.json();
    document.getElementById('today-badge').textContent = 'วันนี้ (จำลอง) ' + this.thaiDate(this.data.today);
  },

  selProduct: null,    // สินค้าที่เลือกอยู่ (ใช้ร่วมกันหน้าพยากรณ์/ล็อต)

  esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  // จัดรูปแบบตัวเลขมีจุลภาค เช่น 1361 → "1,361", 42.3 → "42.3"
  fmt(n, dec = 0) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); },
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
    nav.innerHTML = this.tabs.map(t => `<button data-key="${t.key}" role="tab">${t.label}</button>`).join('');
    nav.addEventListener('click', e => {
      const b = e.target.closest('button'); if (b) this.show(b.dataset.key);
    });
  },

  show(key) {
    this.current = key;
    history.replaceState(null, '', '#' + key);
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.key === key));
    const root = document.getElementById('page');
    root.innerHTML = '';
    const page = Pages[key];
    if (page) page.render(root);
    else root.innerHTML = '<div class="card muted">หน้านี้กำลังพัฒนา</div>';
    window.scrollTo(0, 0);
  },

  // วาดหน้าปัจจุบันใหม่ (ใช้หลังบันทึกข้อมูล)
  refresh() { this.show(this.current); },

  async start() {
    this.buildTabs();
    const root = document.getElementById('page');
    root.innerHTML = '<div class="loading">กำลังโหลดข้อมูลจากฐานข้อมูล…</div>';
    try {
      await this.loadData();
    } catch (err) {
      root.innerHTML = `<div class="error">โหลดข้อมูลไม่สำเร็จ: ${err.message}</div>`;
      return;
    }
    const hash = location.hash.slice(1);
    this.show(this.tabs.some(t => t.key === hash) ? hash : 'overview');
  }
};
