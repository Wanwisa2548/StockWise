// Original, code-native bakery illustrations. Decorative SVGs never contain product data.
const BakeryVisuals = {
  kind(product) {
    const name = (product.name || '').toLowerCase();
    if (/croissant|ครัวซอง/.test(name)) return 'croissant';
    if (/chocolat|โชโก/.test(name)) return 'chocolate';
    if (/cookie|คุกกี้/.test(name)) return 'cookie';
    if (/tart|ทาร์ต/.test(name)) return 'tart';
    if (/cereal|ธัญ/.test(name)) return 'cereal';
    if (/boule|กลม/.test(name)) return 'boule';
    if (/special|พิเศษ/.test(name)) return 'loaf';
    return 'baguette';
  },

  product(product, className = '') {
    const kind = this.kind(product);
    const art = {
      baguette: '<g transform="rotate(38 32 32)"><rect x="22" y="5" width="20" height="54" rx="10" fill="#e2b36e"/><path d="M28 12c-4 7-4 28-1 39" stroke="#f5d6a2" stroke-width="4"/><path d="m29 17 9 4m-9 7 9 4m-9 7 9 4" stroke="#af783d" stroke-width="2.8"/><path d="M41 17v29c0 6-3 10-8 12" stroke="#c18a47" stroke-width="1.6"/></g>',
      cereal: '<g transform="rotate(38 32 32)"><rect x="21" y="6" width="22" height="52" rx="11" fill="#bc915a"/><path d="m28 18 10 4m-10 9 10 4m-10 9 10 4" stroke="#e4cda3" stroke-width="3"/><g fill="#78563a"><ellipse cx="26" cy="12" rx="1" ry="2"/><ellipse cx="38" cy="27" rx="1" ry="2"/><ellipse cx="25" cy="38" rx="1" ry="2"/><ellipse cx="34" cy="52" rx="1" ry="2"/></g></g>',
      croissant: '<path d="M8 28c2-8 11-15 24-15s22 7 24 15c5 2 7 7 4 12-2 4-5 8-10 9l-6-10c-7 5-17 5-24 0l-6 10c-5-1-8-5-10-9-3-5-1-10 4-12Z" fill="#e7b570"/><path d="m21 16-3 21 5 6m20-27 3 21-5 6M30 14l-3 29m7-29 3 29" stroke="#b57f43" stroke-width="2"/><path d="m9 30 7 5m39-5-7 5" stroke="#f6d6a0" stroke-width="3"/><path d="m6 39 8 7m44-7-8 7" stroke="#c68e4e" stroke-width="1.5"/>',
      chocolate: '<rect x="9" y="13" width="46" height="39" rx="10" fill="#dda968"/><path d="M18 14c-6 9-6 26 0 36m12-37c-5 10-5 27 0 39m12-38c-5 10-5 27 0 38" stroke="#b57e43" stroke-width="2"/><path d="M15 19c2-3 4-3 7-3m7 2 5-2m8 3 5-1" stroke="#f4cf96" stroke-width="3"/><rect x="11" y="43" width="13" height="7" rx="3" fill="#73523e"/><rect x="39" y="43" width="13" height="7" rx="3" fill="#73523e"/>',
      cookie: '<path d="M55 28a24 24 0 1 1-19-20c-1 5 3 9 8 9-1 6 4 10 11 11Z" fill="#d7af78"/><path d="M14 27c-4 16 10 30 25 24" stroke="#e8c99e" stroke-width="3"/><g fill="#775944"><path d="m19 17 6 2-2 6-6-2Zm18 17 6 1-2 6-5-2Zm-18 3 6-2 2 6-6 1Z"/><circle cx="34" cy="19" r="2.5"/><circle cx="32" cy="46" r="2.5"/><circle cx="14" cy="31" r="2"/><circle cx="44" cy="27" r="2"/></g>',
      tart: '<path d="m9 27 4-7 7-3 5-6 7 2 7-2 5 6 7 3 4 7-2 8 1 7-7 5-5 6-10-1-10 1-5-6-7-5 1-7Z" fill="#d5aa70"/><circle cx="32" cy="31" r="18" fill="#f0dcb0"/><path d="M20 22c5-5 11-7 18-4" stroke="#fbefd3" stroke-width="3"/><path d="M24 30c-3-7 6-11 8-4 3-8 11-3 8 4l-8 9-8-9Z" fill="#b96e5e"/><path d="m31 22 2-5 4 3" fill="#7f946c"/><circle cx="21" cy="38" r="4" fill="#7e8295"/><circle cx="42" cy="38" r="4" fill="#7e8295"/>',
      boule: '<path d="M7 39c0-19 11-29 25-29s25 10 25 29c0 11-50 11-50 0Z" fill="#d8ad72"/><path d="M9 39c11 5 35 5 46 0" stroke="#b98a54" stroke-width="2"/><path d="m23 18-5 19m15-23-4 25m15-20-3 18" stroke="#f3d8b0" stroke-width="4"/><path d="M14 46c10 4 26 4 36 0" stroke="#b58751" stroke-width="2"/>',
      loaf: '<path d="M10 48V28c-6-8 1-17 10-16 6-7 18-7 24 0 9-1 16 8 10 16v20H10Z" fill="#cc9f66"/><path d="M17 43V28c-4-5 0-10 6-9 5-6 13-6 18 0 6-1 10 4 6 9v15H17Z" fill="#f0d9b1"/><path d="M22 31h1m10-7h1m7 11h1m-13 3h1" stroke="#c6a276" stroke-width="2.5"/>',
    };
    return `<svg class="bakery-product-art ${className}" data-bakery-kind="${kind}" viewBox="0 0 64 64" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${art[kind]}</svg>`;
  },

  scene(key) {
    const shell = '<path d="M10 84h140" stroke="#e3d9c6"/><ellipse cx="81" cy="88" rx="53" ry="4" fill="#e5dfd0" opacity=".5"/>';
    const product = (name, x, y, size) => `<g transform="translate(${x} ${y}) scale(${size / 64})">${this.product({ name }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`;
    const scenes = {
      sales: '<rect x="54" y="12" width="57" height="69" rx="4" fill="#fffdf7" stroke="#d6cdb9"/><path d="M65 23h35m-35 8h23m-23 9h35" stroke="#d8cfba" stroke-width="2"/><path d="M67 68V54m13 14V48m13 20V43" stroke="#8da182" stroke-width="6"/>' + product('croissant', 8, 44, 48) + '<circle cx="123" cy="68" r="15" fill="#ecdbb4"/><path d="M129 60a9 9 0 1 0 0 16m-14-10h11m-11 4h11" stroke="#b59a65"/>',
      forecast: '<rect x="53" y="21" width="87" height="55" rx="5" fill="#fffdf7" stroke="#d9d1bf"/><path d="M62 62h67M62 62V32" stroke="#e4dfd1"/><path d="m65 56 13-13 13 5 15-17" stroke="#8b9e7d" stroke-width="2.5"/><path d="m106 31 12 6 13-14" stroke="#b79a69" stroke-width="2" stroke-dasharray="3 4"/><path d="m125 22 7-1-1 7" stroke="#b79a69"/>' + product('boule', 7, 37, 54),
      order: '<path d="m55 37 29-12 30 12v39L84 87 55 76V37Z" fill="#ead7b4"/><path d="m55 37 29 13 30-13M84 50v37m-14-56 30 13" stroke="#c7ac7e" stroke-width="1.5"/>' + product('baguette', 10, 17, 59) + '<path d="M113 24h25m-25 9h17" stroke="#9aab8c" stroke-width="2"/><circle cx="129" cy="64" r="14" fill="#dfe8d5"/><path d="m122 64 5 5 9-11" stroke="#7a9268" stroke-width="2"/>',
      expiry: '<circle cx="104" cy="43" r="28" fill="#fffdf7" stroke="#d8cdb7"/><path d="M104 25v19l11 8" stroke="#9eaa8a" stroke-width="2"/><path d="M104 19v3m24 21h-3m-21 24v-3M80 43h3" stroke="#d5c8ac"/>' + product('tartelette', 13, 35, 57) + '<path d="M123 84c-7-13 2-25 18-28 0 18-5 27-18 28Zm-5 3 16-22" fill="#d7e1ca" stroke="#9aad87"/>',
      cluster: '<path d="m45 50 36-20 35 28-38 15-33-23Z" stroke="#c6cdb9" stroke-dasharray="3 4"/><circle cx="38" cy="44" r="26" fill="#f0e6d1"/><circle cx="89" cy="26" r="23" fill="#e3eadb"/><circle cx="119" cy="66" r="25" fill="#ede0d9"/>' + product('croissant', 13, 17, 48) + product('cookie', 70, 7, 38) + product('chocolat', 98, 43, 43),
      manage: '<path d="M24 80V24m112 56V24M20 52h120M20 82h120" stroke="#c8b99b" stroke-width="2"/>' + product('baguette', 32, 5, 49) + product('boule', 84, 13, 43) + product('croissant', 30, 45, 43) + product('chocolat', 84, 45, 43),
    };
    return `<svg class="bakery-scene" viewBox="0 0 160 100" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shell}${scenes[key] || scenes.forecast}</svg>`;
  },

  productCell(product, subtitle = '') {
    return `<span class="product-cell"><span class="table-product-art">${this.product(product)}</span><span>${App.esc(product.name)}${subtitle ? `<small>${App.esc(subtitle)}</small>` : ''}</span></span>`;
  },

  sparkline(values) {
    const lo = Math.min(...values), hi = Math.max(...values);
    const points = values.map((v, i) => `${2 + i * 68 / Math.max(1, values.length - 1)},${hi === lo ? 13 : 23 - (v - lo) / (hi - lo) * 20}`).join(' ');
    return `<svg class="metric-sparkline" viewBox="0 0 72 28" fill="none" aria-hidden="true"><polyline points="${points}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  },

  heading(key, title, description) {
    return `<div class="module-heading"><div class="module-heading-copy"><h2>${App.esc(title)}</h2><p>${App.esc(description)}</p></div><div class="module-illustration">${this.scene(key)}</div></div>`;
  },

  empty(icon, title, description) {
    return `<div class="empty-state"><span class="empty-state-icon">${App.icon(icon)}</span><div><b>${App.esc(title)}</b><p>${App.esc(description)}</p></div></div>`;
  }
};
