// Store admin: orders (Bankak receipts), products with per-color images, categories and settings.
import { esc, formatPrice } from '/js/api.js';
import { cutout, isCutout } from '/js/garment-image.js';
import { clothesMask } from '/admin/human-parsing.js';
import { icons } from '/js/icons.js';
import { logo, openPanel, toast } from '/js/ui.js';

const TOKEN_KEY = 'bushra.admin';
const root = document.getElementById('admin');
let token = sessionStorage.getItem(TOKEN_KEY) || '';

const STATUS = {
  pending_payment: ['بانتظار الدفع', 'amber'],
  awaiting_verification: ['إشعار بانتظار المراجعة', 'amber'],
  confirmed: ['مدفوع — جاهز للمورد', 'green'],
  sent_to_supplier: ['عند المورد', 'green'],
  shipped: ['تم الشحن', 'green'],
  delivered: ['تم التسليم', 'green'],
  cancelled: ['ملغي', 'red'],
};
const PAY = { unpaid: 'غير مدفوع', pending_verification: 'قيد المراجعة', paid: 'مدفوع', rejected: 'مرفوض', refunded: 'مسترد' };
const pill = (status) => `<span class="status-pill ${STATUS[status]?.[1] ?? ''}">${STATUS[status]?.[0] ?? esc(status)}</span>`;

async function call(path, options = {}) {
  const headers = { authorization: `Bearer ${token}`, ...(options.body && !(options.body instanceof FormData) ? { 'content-type': 'application/json' } : {}) };
  const res = await fetch(`/api/admin${path}`, { ...options, headers });
  if (res.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    token = '';
    login('انتهت الجلسة، سجّل الدخول مرة أخرى');
    throw new Error('unauthorized');
  }
  if (options.raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'حدث خطأ');
  return data;
}

function login(message = '') {
  root.innerHTML = `<div class="login"><form class="panel">
    ${logo()}<h1 style="margin:0;font-size:1.2rem">لوحة التحكم</h1>
    <input type="password" name="token" placeholder="كلمة مرور الإدارة" autocomplete="current-password" required>
    ${message ? `<p class="notice err">${esc(message)}</p>` : ''}
    <button class="btn primary block">دخول</button></form></div>`;
  root.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    token = new FormData(e.target).get('token').toString();
    try {
      await call('/summary');
      sessionStorage.setItem(TOKEN_KEY, token);
      shell();
    } catch {
      if (token) login('كلمة المرور غير صحيحة');
    }
  });
}

const TABS = [
  ['orders', 'الطلبات', orders],
  ['products', 'المنتجات', products],
  ['categories', 'الأقسام', categories],
  ['settings', 'الإعدادات', settings],
];

function shell(tab = location.hash.slice(1) || 'orders') {
  root.innerHTML = `<header class="admin-bar"><div class="container">${logo()}
    <nav class="tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join('')}</nav>
    <a class="text-link" href="/" target="_blank">عرض المتجر</a></div></header>
    <main class="container admin-main" id="view"></main>`;
  root.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    history.replaceState(null, '', `#${b.dataset.tab}`);
    shell(b.dataset.tab);
  });
  const view = root.querySelector('#view');
  (TABS.find(([k]) => k === tab) ?? TABS[0])[2](view).catch((err) => err.message !== 'unauthorized' && (view.innerHTML = `<p class="notice err">${esc(err.message)}</p>`));
}

// ---------- Orders ----------

async function orders(view, filter = { status: 'awaiting_verification', q: '' }) {
  const [summary, list] = await Promise.all([
    call('/summary'),
    call(`/orders?limit=100${filter.status ? `&status=${filter.status}` : ''}${filter.q ? `&q=${encodeURIComponent(filter.q)}` : ''}`),
  ]);
  const n = (s) => summary.byStatus[s] ?? 0;
  view.innerHTML = `
    <div class="stats">
      <div class="stat alert"><b>${n('awaiting_verification')}</b><span>إشعارات بنكك للمراجعة</span></div>
      <div class="stat"><b>${n('confirmed')}</b><span>مدفوعة وجاهزة للمورد</span></div>
      <div class="stat"><b>${n('pending_payment')}</b><span>بانتظار الدفع</span></div>
      <div class="stat"><b>${n('sent_to_supplier') + n('shipped')}</b><span>قيد التوصيل</span></div>
      <div class="stat"><b>${n('delivered')}</b><span>تم التسليم</span></div>
    </div>
    <div class="toolbar"><h1>الطلبات</h1>
      <input type="search" placeholder="رقم الطلب أو الهاتف" value="${esc(filter.q)}" data-q>
      <select data-status><option value="">كل الحالات</option>${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${k === filter.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="table-wrap"><table><thead><tr><th>رقم الطلب</th><th>العميل</th><th>المدينة</th><th>الدفع</th><th>الإجمالي</th><th>الحالة</th><th>التاريخ</th></tr></thead>
      <tbody>${list.orders.map((o) => `<tr data-number="${esc(o.number)}"><td dir="ltr">${esc(o.number)}</td><td>${esc(o.customer_name)}<br><small dir="ltr">${esc(o.customer_phone)}</small></td><td>${esc(o.city)}، ${esc(o.country)}</td><td>${o.payment_method === 'bankak' ? 'بنكك' : 'بطاقة'} · ${PAY[o.payment_status] ?? ''}</td><td>${formatPrice(o.total, o.currency)}</td><td>${pill(o.status)}</td><td>${esc(o.created_at.slice(0, 16))}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">لا توجد طلبات</td></tr>'}</tbody></table></div>`;
  const reload = () => orders(view, { status: view.querySelector('[data-status]').value, q: view.querySelector('[data-q]').value.trim() });
  view.querySelector('[data-status]').addEventListener('change', reload);
  view.querySelector('[data-q]').addEventListener('change', reload);
  view.querySelector('tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('[data-number]');
    if (tr) orderDetail(tr.dataset.number, reload);
  });
}

async function orderDetail(number, onChange) {
  const { order: o, items, events, allowedTransitions } = await call(`/orders/${encodeURIComponent(number)}`);
  const { panel, close } = openPanel(
    `<div class="drawer-head"><h2 dir="ltr">${esc(o.number)}</h2><button class="icon-btn" data-close aria-label="إغلاق">${icons.close}</button></div>
     <div class="drawer-body stack">
       <div>${pill(o.status)} <span class="status-pill">${PAY[o.payment_status] ?? ''}</span></div>
       <dl class="kv"><dt>العميل</dt><dd>${esc(o.customer_name)}</dd><dt>الهاتف</dt><dd dir="ltr" style="text-align:end"><a href="https://wa.me/${esc(o.customer_phone.replace(/\D/g, ''))}" target="_blank">${esc(o.customer_phone)}</a></dd>
         ${o.customer_email ? `<dt>البريد</dt><dd>${esc(o.customer_email)}</dd>` : ''}
         <dt>العنوان</dt><dd>${esc(o.country)} · ${esc(o.city)} · ${esc(o.address)}</dd>${o.notes ? `<dt>ملاحظات</dt><dd>${esc(o.notes)}</dd>` : ''}
         <dt>الدفع</dt><dd>${o.payment_method === 'bankak' ? 'بنكك' : 'بطاقة'}${o.payment_ref ? ` · <span dir="ltr">${esc(o.payment_ref)}</span>` : ''}</dd></dl>
       <div class="panel" style="padding:12px">${items.map((i) => `<div class="summary-line" style="grid-template-columns:1fr auto"><div><b>${esc(i.product_name)}</b><div class="sub">${[i.color, i.size, i.sku, `× ${i.quantity}`].filter(Boolean).map(esc).join(' · ')}${i.supplier_order_ref ? ` · مورد: ${esc(i.supplier_order_ref)}` : ''}${i.tracking_number ? ` · تتبع: ${esc(i.tracking_number)}` : ''}</div></div><b>${formatPrice(i.unit_price * i.quantity, o.currency)}</b></div>`).join('')}
         <div class="totals"><div class="grand"><span>الإجمالي (مع الشحن)</span><span>${formatPrice(o.total, o.currency)}</span></div></div></div>
       ${o.receipt_key ? '<div class="receipt"><b>إشعار التحويل</b><div data-receipt><div class="spinner"></div></div></div>' : ''}
       ${o.payment_method === 'bankak' && ['pending_payment', 'awaiting_verification'].includes(o.status)
         ? `<div class="row-actions"><button class="btn primary" data-verify="1">${icons.check} قبول الدفع</button><button class="btn" data-verify="0">رفض الإشعار</button></div>` : ''}
       ${o.status === 'confirmed' ? '<button class="btn dark" data-forward>إرسال الطلب للمورد</button>' : ''}
       ${allowedTransitions.length ? `<div class="row-actions"><select data-next>${allowedTransitions.map((s) => `<option value="${s}">${STATUS[s][0]}</option>`).join('')}</select><button class="btn small" data-move>تغيير الحالة</button></div>` : ''}
       <div class="field"><label>ملاحظة داخلية</label><textarea data-note>${esc(o.admin_note ?? '')}</textarea><button class="btn small" data-save-note style="justify-self:start">حفظ الملاحظة</button></div>
       <div><b>السجل</b><ul class="events">${events.map((e) => `<li>${esc(e.created_at)} — ${esc(e.type)} ${esc(e.message)}</li>`).join('')}</ul></div>
     </div>`,
    'drawer admin-drawer',
  );
  if (o.receipt_key) {
    const res = await call(`/orders/${encodeURIComponent(number)}/receipt`, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    panel.querySelector('[data-receipt]').innerHTML = blob.type === 'application/pdf' ? `<a class="btn small" href="${url}" target="_blank">فتح ملف PDF</a>` : `<a href="${url}" target="_blank"><img src="${url}" alt="إشعار التحويل"></a>`;
  }
  const done = (msg) => {
    toast(msg);
    close();
    onChange();
  };
  panel.addEventListener('click', async (e) => {
    try {
      const v = e.target.closest('[data-verify]');
      if (v) {
        const approve = v.dataset.verify === '1';
        const note = approve ? '' : prompt('سبب الرفض (يظهر في السجل):') ?? '';
        await call(`/orders/${encodeURIComponent(number)}/verify-payment`, { method: 'POST', body: JSON.stringify({ approve, note }) });
        return done(approve ? 'تم قبول الدفع' : 'تم رفض الإشعار');
      }
      if (e.target.closest('[data-forward]')) {
        const r = await call(`/orders/${encodeURIComponent(number)}/forward`, { method: 'POST' });
        return done(r.failed ? 'فشل الإرسال لبعض الموردين، راجع السجل' : r.manual ? 'المورد يدوي: أرسل الطلب له ثم غيّر الحالة' : 'تم الإرسال للمورد');
      }
      if (e.target.closest('[data-move]')) {
        await call(`/orders/${encodeURIComponent(number)}/status`, { method: 'POST', body: JSON.stringify({ status: panel.querySelector('[data-next]').value }) });
        return done('تم تحديث الحالة');
      }
      if (e.target.closest('[data-save-note]')) {
        await call(`/orders/${encodeURIComponent(number)}/note`, { method: 'POST', body: JSON.stringify({ note: panel.querySelector('[data-note]').value }) });
        toast('تم الحفظ');
      }
    } catch (err) {
      if (err.message !== 'unauthorized') alert(err.message);
    }
  });
}

// ---------- Products ----------

async function products(view) {
  const [{ products: list }, { categories: cats }] = await Promise.all([call('/products?limit=200'), fetch('/api/categories').then((r) => r.json())]);
  view.innerHTML = `<div class="toolbar"><h1>المنتجات</h1><button class="btn primary" data-new>+ منتج جديد</button></div>
    <div class="admin-products">${list
      .map((p) => {
        const img = JSON.parse(p.images)[0];
        return `<button class="admin-product ${p.active ? '' : 'off'}" data-id="${p.id}">${img ? `<img src="${esc(img)}" alt="">` : '<div class="img-pick" style="width:100%;height:150px">بدون صورة</div>'}
          <b>${esc(p.name)}</b><small>${esc(cats.find((c) => c.id === p.category_id)?.name ?? 'بدون قسم')} · ${p.variant_count} خيار${p.active ? '' : ' · مخفي'}</small></button>`;
      })
      .join('')}</div>`;
  const reload = () => products(view);
  view.querySelector('[data-new]').addEventListener('click', () => productForm(null, cats, reload));
  view.querySelector('.admin-products').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-id]');
    if (b) productForm((await call(`/products/${b.dataset.id}`)).product, cats, reload);
  });
}

async function upload(file) {
  const fd = new FormData();
  fd.set('file', file);
  return (await call('/media', { method: 'POST', body: fd })).url;
}

/**
 * Background removal before upload, so garments hang on the 3D rack without a white box.
 * Shows the photo before/after with a sensitivity slider; AI removal (Workers AI) is offered for
 * hard cases such as white clothes on a white background. Resolves to the uploaded image URL.
 */
async function processPhoto(file) {
  const src = URL.createObjectURL(file);
  if (await isCutout(src).catch(() => false)) return upload(file);
  return new Promise((resolve, reject) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'bg-dialog';
    dlg.innerHTML = `<h2>تجهيز صورة القطعة</h2>
      <p class="hint">نزيل الخلفية لتظهر القطعة معلّقة على الرف ثلاثي الأبعاد. تأكد أن القطعة كاملة وواضحة في النتيجة.</p>
      <div class="bg-compare"><figure><img src="${src}" alt=""><figcaption>الصورة الأصلية</figcaption></figure>
        <figure class="checker" data-result><div class="spinner"></div><figcaption>بعد إزالة الخلفية</figcaption></figure></div>
      <label class="field"><span>حساسية الإزالة: <b data-tol-val>26</b></span><input type="range" min="6" max="70" value="26" data-tol></label>
      <label class="check"><input type="checkbox" data-mannequin> الملابس فقط: إزالة الموديل أو المانيكان (الوجه، الشعر، اليدين، الرجلين)</label>
      <p class="hint" data-ai-note hidden></p>
      <p class="notice err" data-err hidden></p>
      <div class="row-actions"><button class="btn primary" data-use>${icons.check} استخدام النتيجة</button>
        <button class="btn dark" data-ai>إزالة بالذكاء الاصطناعي (أدق للملابس البيضاء)</button>
        <button class="btn small" data-raw>الصورة كما هي</button><button class="btn small" data-cancel>إلغاء</button></div>`;
    document.body.append(dlg);
    dlg.showModal();
    let result = null;
    const box = dlg.querySelector('[data-result]');
    const render = async () => {
      const tol = Number(dlg.querySelector('[data-tol]').value);
      dlg.querySelector('[data-tol-val]').textContent = tol;
      const onlyClothes = dlg.querySelector('[data-mannequin]').checked;
      const note = dlg.querySelector('[data-ai-note]');
      let options = {};
      if (onlyClothes) {
        // AI human parsing keeps only garments; if the model can't load, fall back to removing a white mannequin by colour.
        note.hidden = false;
        note.textContent = 'جاري تحميل نموذج الذكاء الاصطناعي (مرة واحدة فقط، حوالي 27 ميجابايت)…';
        let mask = null;
        try {
          const probe = await cutout(src, tol, {
            keep: async (canvas) => (mask = await clothesMask(canvas, (p) => (note.textContent = `جاري تحميل النموذج… ${Math.round(p * 100)}%`))),
          });
          note.textContent = 'تم تحديد الملابس بالذكاء الاصطناعي وإزالة ما سواها.';
          result = probe;
        } catch (err) {
          console.warn('human parsing unavailable', err);
          note.textContent = 'تعذّر تحميل نموذج الذكاء الاصطناعي، فاستُخدمت الطريقة البسيطة (تزيل المانيكان الأبيض فقط).';
          options = { mannequin: true };
        }
        if (mask) {
          box.querySelector('canvas, .spinner')?.remove();
          box.prepend(result);
          return;
        }
      } else {
        note.hidden = true;
      }
      result = await cutout(src, tol, options);
      box.querySelector('canvas, .spinner')?.remove();
      box.prepend(result);
    };
    render();
    let timer;
    dlg.querySelector('[data-mannequin]').addEventListener('change', render);
    dlg.querySelector('[data-tol]').addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(render, 150);
    });
    const done = (fn) => async () => {
      const err = dlg.querySelector('[data-err]');
      dlg.querySelectorAll('button').forEach((b) => (b.disabled = true));
      try {
        resolve(await fn());
        dlg.remove();
      } catch (e) {
        err.textContent = e.message === 'ai_not_configured' || /غير مفعّلة/.test(e.message) ? 'الذكاء الاصطناعي غير مفعّل بعد على Cloudflare. استخدم النتيجة أو جرّب تغيير الحساسية.' : e.message;
        err.hidden = false;
        dlg.querySelectorAll('button').forEach((b) => (b.disabled = false));
      }
    };
    dlg.querySelector('[data-use]').addEventListener('click', done(async () => {
      const blob = await new Promise((r) => result.toBlob(r, 'image/png'));
      return upload(new File([blob], 'garment.png', { type: 'image/png' }));
    }));
    dlg.querySelector('[data-ai]').addEventListener('click', done(async () => {
      const url = await upload(file);
      return (await call('/media/remove-background', { method: 'POST', body: JSON.stringify({ url }) })).url;
    }));
    dlg.querySelector('[data-raw]').addEventListener('click', done(() => upload(file)));
    dlg.querySelector('[data-cancel]').addEventListener('click', () => {
      dlg.remove();
      reject(new Error('cancelled'));
    });
  });
}

function productForm(product, cats, onSaved) {
  // Group existing variants by color so the form edits "colors × sizes".
  const colors = [];
  for (const v of product?.variants ?? []) {
    let c = colors.find((x) => x.name === (v.color ?? ''));
    if (!c) colors.push((c = { name: v.color ?? '', front: v.images[0] ?? product.images[0] ?? '', back: v.images[1] ?? product.images[1] ?? '' }));
  }
  if (!colors.length) colors.push({ name: '', front: '', back: '' });
  const active = (product?.variants ?? []).filter((v) => v.active);
  const sizes = [...new Set(active.map((v) => v.size).filter(Boolean))];
  const first = product?.variants?.[0];

  const colorRow = (c, i) => `<div class="color-row" data-color="${i}">
      <div class="field"><label>اللون</label><input type="text" data-cname value="${esc(c.name)}" placeholder="مثال: أسود"></div>
      <label class="img-pick" title="صورة أمامية">${c.front ? `<img src="${esc(c.front)}" alt="">` : 'صورة<br>أمامية'}<input type="file" accept="image/*" class="sr-only" data-img="front"></label>
      <label class="img-pick" title="صورة خلفية">${c.back ? `<img src="${esc(c.back)}" alt="">` : 'صورة<br>خلفية'}<input type="file" accept="image/*" class="sr-only" data-img="back"></label>
      <button type="button" class="icon-btn" data-remove-color aria-label="حذف اللون">${icons.close}</button></div>`;

  const { panel, close } = openPanel(
    `<div class="drawer-head"><h2>${product ? 'تعديل منتج' : 'منتج جديد'}</h2><button class="icon-btn" data-close aria-label="إغلاق">${icons.close}</button></div>
     <form class="drawer-body stack" novalidate>
       <div class="field"><label>اسم المنتج</label><input name="name" type="text" required value="${esc(product?.name ?? '')}" placeholder="مثال: عباية كريب مطرزة"></div>
       <div class="form-grid">
         <div class="field"><label>القسم</label><select name="category"><option value="">بدون قسم</option>${cats.map((c) => `<option value="${c.id}" ${c.id === product?.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
         <div class="field"><label>المقاسات</label><input name="sizes" type="text" value="${esc(sizes.join(', ') || 'S, M, L, XL')}"><span class="hint">افصل بينها بفاصلة. اتركها فارغة لمقاس واحد.</span></div>
         <div class="field"><label>السعر بالدولار</label><input name="price" type="number" min="0.5" step="0.5" dir="ltr" value="${first ? first.price_usd / 100 : ''}" required></div>
         <div class="field"><label>سعر ثابت بالجنيه <span class="hint">(اختياري)</span></label><input name="sdg" type="number" min="0" step="500" dir="ltr" value="${first?.price_sdg ?? ''}"><span class="hint">إن تُرك فارغاً يُحسب من سعر الصرف.</span></div>
       </div>
       <div class="field"><label>الوصف</label><textarea name="description">${esc(product?.description ?? '')}</textarea></div>
       <div class="stack"><b>الألوان والصور</b><span class="hint" style="color:var(--muted);font-size:.85rem">صوّر القطعة من الأمام والخلف على خلفية بيضاء أو فاتحة بإضاءة متساوية، وسنزيل الخلفية ونحوّلها لقطعة ثلاثية الأبعاد على الرف.</span>
         <div class="stack" data-colors>${colors.map(colorRow).join('')}</div>
         <button type="button" class="btn small" data-add-color style="justify-self:start">+ إضافة لون</button></div>
       <label class="check"><input type="checkbox" name="active" ${product?.active === 0 ? '' : 'checked'}> ظاهر في المتجر</label>
       <p class="notice err" data-error hidden></p>
       <button class="btn primary block" type="submit">حفظ المنتج</button>
     </form>`,
    'drawer admin-drawer',
  );

  const list = panel.querySelector('[data-colors]');
  const sync = () => list.querySelectorAll('[data-color]').forEach((row, i) => (colors[i].name = row.querySelector('[data-cname]').value.trim()));
  panel.querySelector('[data-add-color]').addEventListener('click', () => {
    sync();
    colors.push({ name: '', front: '', back: '' });
    list.innerHTML = colors.map(colorRow).join('');
  });
  list.addEventListener('click', (e) => {
    if (!e.target.closest('[data-remove-color]') || colors.length === 1) return;
    sync();
    colors.splice(Number(e.target.closest('[data-color]').dataset.color), 1);
    list.innerHTML = colors.map(colorRow).join('');
  });
  list.addEventListener('change', async (e) => {
    const input = e.target.closest('[data-img]');
    if (!input?.files[0]) return;
    const row = input.closest('[data-color]');
    const pick = input.closest('.img-pick');
    pick.firstChild.replaceWith(Object.assign(document.createElement('span'), { textContent: 'جاري الرفع…' }));
    try {
      const url = await processPhoto(input.files[0]);
      colors[Number(row.dataset.color)][input.dataset.img] = url;
      sync();
      list.innerHTML = colors.map(colorRow).join('');
    } catch (err) {
      if (err.message !== 'unauthorized' && err.message !== 'cancelled') alert(`تعذّر رفع الصورة: ${err.message === 'invalid_file_type' ? 'استخدم PNG أو JPG أو WEBP' : err.message}`);
      list.innerHTML = colors.map(colorRow).join('');
    }
  });

  panel.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    sync();
    const fd = new FormData(e.target);
    const err = panel.querySelector('[data-error]');
    const priceUsd = Math.round(Number(fd.get('price')) * 100);
    const sizeList = fd.get('sizes').toString().split(/[,،]/).map((s) => s.trim()).filter(Boolean);
    const usable = colors.filter((c) => c.front);
    if (!fd.get('name').toString().trim() || !(priceUsd > 0) || !usable.length) {
      err.textContent = 'أكمل الاسم والسعر وارفع صورة أمامية للون واحد على الأقل';
      err.hidden = false;
      return;
    }
    const body = {
      name: fd.get('name').toString().trim(),
      description: fd.get('description').toString(),
      categoryId: fd.get('category') ? Number(fd.get('category')) : null,
      images: [usable[0].front, usable[0].back].filter(Boolean),
      active: fd.get('active') === 'on',
    };
    if (product) Object.assign(body, { slug: product.slug, supplierId: product.supplier_id, supplierProductRef: product.supplier_product_ref });
    const priceSdg = fd.get('sdg') ? Number(fd.get('sdg')) : null;
    const base = (body.slug || `p${Date.now().toString(36)}`).replace(/[^A-Za-z0-9-]/g, '').slice(0, 24) || `p${Date.now().toString(36)}`;
    const wanted = usable.flatMap((c, ci) =>
      (sizeList.length ? sizeList : [null]).map((size) => ({
        color: c.name || null,
        size,
        priceUsd,
        priceSdg,
        images: [c.front, c.back].filter(Boolean),
        active: true,
        sku: `${base}-${ci}-${size ?? 'one'}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase(),
      })),
    );
    const submit = e.target.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      if (!product) {
        await call('/products', { method: 'POST', body: JSON.stringify({ ...body, variants: wanted }) });
      } else {
        await call(`/products/${product.id}`, { method: 'PUT', body: JSON.stringify(body) });
        const key = (v) => `${v.color ?? ''}|${v.size ?? ''}`;
        const existing = new Map(product.variants.map((v) => [key(v), v]));
        for (const w of wanted) {
          const old = existing.get(key(w));
          if (old) {
            existing.delete(key(w));
            await call(`/variants/${old.id}`, { method: 'PUT', body: JSON.stringify({ ...w, sku: old.sku, costUsd: old.cost_usd, stock: old.stock, supplierVariantRef: old.supplier_variant_ref }) });
          } else {
            await call(`/products/${product.id}/variants`, { method: 'POST', body: JSON.stringify(w) });
          }
        }
        // Colors/sizes removed from the form are hidden, not deleted, so old orders keep their details.
        for (const old of existing.values()) {
          if (old.active) await call(`/variants/${old.id}`, { method: 'PUT', body: JSON.stringify({ sku: old.sku, color: old.color, size: old.size, priceUsd: old.price_usd, priceSdg: old.price_sdg, costUsd: old.cost_usd, stock: old.stock, images: old.images, supplierVariantRef: old.supplier_variant_ref, active: false }) });
        }
      }
      toast('تم حفظ المنتج');
      close();
      onSaved();
    } catch (error) {
      if (error.message === 'unauthorized') return;
      err.textContent = error.message;
      err.hidden = false;
      submit.disabled = false;
    }
  });
}

// ---------- Categories ----------

async function categories(view) {
  const { categories: cats } = await fetch('/api/categories').then((r) => r.json());
  view.innerHTML = `<div class="toolbar"><h1>الأقسام</h1></div>
    <div class="panel stack">
      ${cats.map((c, i) => `<div class="buy-row" data-id="${c.id}"><input type="text" value="${esc(c.name)}" data-name><input type="text" value="${esc(c.slug)}" data-slug dir="ltr" style="max-width:180px"><button class="btn small" data-save data-order="${i}">حفظ</button><button class="btn small" data-del>حذف</button></div>`).join('')}
      <form class="buy-row" data-add><input type="text" name="name" placeholder="قسم جديد، مثال: فساتين سهرة" required><input type="text" name="slug" placeholder="dresses" dir="ltr" style="max-width:180px"><button class="btn primary small">إضافة</button></form>
      <p class="hint" style="color:var(--muted);font-size:.85rem">الاسم اللاتيني يظهر في رابط القسم (مثل /c/dresses).</p>
    </div>`;
  const reload = () => categories(view);
  view.onclick = async (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    try {
      if (e.target.closest('[data-save]')) {
        await call(`/categories/${row.dataset.id}`, { method: 'PUT', body: JSON.stringify({ name: row.querySelector('[data-name]').value, slug: row.querySelector('[data-slug]').value, sortOrder: Number(e.target.dataset.order) + 1 }) });
        toast('تم الحفظ');
      }
      if (e.target.closest('[data-del]') && confirm('حذف القسم؟ المنتجات تبقى بدون قسم.')) {
        await call(`/categories/${row.dataset.id}`, { method: 'DELETE' });
        reload();
      }
    } catch (err) {
      if (err.message !== 'unauthorized') alert(err.message);
    }
  };
  view.querySelector('[data-add]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await call('/categories', { method: 'POST', body: JSON.stringify({ name: fd.get('name'), slug: fd.get('slug') || undefined, sortOrder: cats.length + 1 }) });
      toast('تمت إضافة القسم');
      reload();
    } catch (err) {
      if (err.message !== 'unauthorized') alert(err.message);
    }
  });
}

// ---------- Settings ----------

const SETTINGS = [
  ['bankak_account_name', 'اسم حساب بنكك', 'text'],
  ['bankak_account_number', 'رقم حساب بنكك', 'text'],
  ['whatsapp_number', 'رقم واتساب المتجر', 'text'],
  ['usd_to_sdg', 'سعر الدولار بالجنيه', 'number'],
  ['sdg_rounding', 'تقريب أسعار الجنيه لأقرب', 'number'],
  ['shipping_sd_sdg', 'رسوم التوصيل داخل السودان (جنيه)', 'number'],
  ['shipping_intl_usd', 'رسوم الشحن خارج السودان (سنت دولار، 1500 = 15$)', 'number'],
  ['unpaid_order_ttl_hours', 'إلغاء الطلب غير المدفوع بعد (ساعة)', 'number'],
];

async function settings(view) {
  const { settings: s } = await call('/settings');
  view.innerHTML = `<div class="toolbar"><h1>الإعدادات</h1></div>
    <form class="panel form-grid">${SETTINGS.map(([k, l, t]) => `<div class="field"><label for="${k}">${l}</label><input id="${k}" name="${k}" type="${t}" value="${esc(s[k] ?? '')}" ${t === 'number' ? 'dir="ltr" min="0"' : ''}></div>`).join('')}
      <div class="full"><button class="btn primary">حفظ الإعدادات</button></div></form>`;
  view.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(SETTINGS.map(([k, , t]) => [k, t === 'number' ? Number(fd.get(k)) : fd.get(k).toString()]));
    try {
      await call('/settings', { method: 'PUT', body: JSON.stringify(body) });
      toast('تم حفظ الإعدادات');
    } catch (err) {
      if (err.message !== 'unauthorized') alert(err.message);
    }
  });
}

if (token) shell();
else login();
