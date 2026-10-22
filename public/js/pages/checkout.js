import { api, currentRegion, esc, formatPrice, getConfig, setRegion } from '../api.js';
import { cart } from '../cart.js';
import { icons } from '../icons.js';
import { navigate, toast } from '../ui.js';

const COUNTRIES = [
  ['SA', 'السعودية'], ['AE', 'الإمارات'], ['QA', 'قطر'], ['KW', 'الكويت'], ['BH', 'البحرين'], ['OM', 'عُمان'],
  ['EG', 'مصر'], ['JO', 'الأردن'], ['LY', 'ليبيا'], ['TD', 'تشاد'], ['SS', 'جنوب السودان'], ['ET', 'إثيوبيا'],
  ['GB', 'المملكة المتحدة'], ['IE', 'أيرلندا'], ['DE', 'ألمانيا'], ['NL', 'هولندا'], ['FR', 'فرنسا'], ['US', 'الولايات المتحدة'], ['CA', 'كندا'], ['AU', 'أستراليا'],
];

const ORDERS_KEY = 'bushra.orders';
function rememberOrder(number, token) {
  try {
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]').filter((o) => o.number !== number);
    list.unshift({ number, token, at: Date.now() });
    localStorage.setItem(ORDERS_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {}
}

export default async function checkout(main) {
  document.title = 'إتمام الطلب | متجر البشرى';
  if (!cart.items().length) {
    main.innerHTML = `<div class="container"><div class="empty">${icons.bag}<p>السلة فارغة</p><a class="btn" href="/products" data-link>تصفح المنتجات</a></div></div>`;
    return;
  }
  const config = await getConfig();
  let region = await currentRegion();
  const cardEnabled = config.regions.intl.paymentMethods.includes('card');

  main.innerHTML = `
    <div class="container page-head"><h1>إتمام الطلب</h1><p>أكمل بياناتك وسنقوم بتجهيز طلبك فور تأكيد الدفع.</p></div>
    <form class="container checkout" novalidate>
      <div>
        <section class="panel"><h2><span class="step">1</span>مكان التوصيل</h2>
          <div class="region-cards">
            <button type="button" class="region-card" data-r="sd"><b>داخل السودان</b><span>الدفع عبر تطبيق بنكك</span></button>
            <button type="button" class="region-card" data-r="intl"><b>خارج السودان</b><span>الدفع الإلكتروني بالبطاقة</span></button>
          </div>
        </section>
        <section class="panel"><h2><span class="step">2</span>بيانات المستلم</h2>
          <div class="form-grid">
            <div class="field"><label for="name">الاسم الكامل</label><input id="name" name="name" type="text" autocomplete="name" required minlength="2"></div>
            <div class="field"><label for="phone">رقم الهاتف (واتساب)</label><input id="phone" name="phone" type="tel" dir="ltr" autocomplete="tel" required placeholder="+249 9xx xxx xxx"></div>
            <div class="field full" data-email><label for="email">البريد الإلكتروني <span class="hint" data-email-hint>(اختياري)</span></label><input id="email" name="email" type="email" dir="ltr" autocomplete="email"></div>
            <div class="field" data-country hidden><label for="country">الدولة</label><select id="country" name="country">${COUNTRIES.map(([c, n]) => `<option value="${c}">${n}</option>`).join('')}</select></div>
            <div class="field"><label for="city">المدينة</label><input id="city" name="city" type="text" autocomplete="address-level2" required></div>
            <div class="field full"><label for="address">العنوان بالتفصيل</label><input id="address" name="address" type="text" autocomplete="street-address" required placeholder="الحي، الشارع، أقرب معلم"></div>
            <div class="field full"><label for="notes">ملاحظات <span class="hint">(اختياري)</span></label><textarea id="notes" name="notes" maxlength="500"></textarea></div>
          </div>
        </section>
        <section class="panel"><h2><span class="step">3</span>طريقة الدفع</h2><div data-pay></div></section>
      </div>
      <aside class="panel" style="position:sticky;top:calc(var(--header-h) + 16px)">
        <h2>ملخص الطلب</h2>
        <div data-summary><div class="spinner" style="margin:20px auto"></div></div>
        <p class="notice err" data-error hidden style="margin-top:12px"></p>
        <button class="btn primary block" type="submit" style="margin-top:14px" data-submit>تأكيد الطلب</button>
        <p style="color:var(--muted);font-size:.8rem;margin:10px 0 0;text-align:center">بالضغط على تأكيد الطلب أنت توافق على سياسة الاستبدال والشحن.</p>
      </aside>
    </form>`;

  const form = main.querySelector('form');
  const syncRegion = async () => {
    main.querySelectorAll('.region-card').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.r === region)));
    main.querySelector('[data-country]').hidden = region === 'sd';
    main.querySelector('[data-email-hint]').textContent = region === 'sd' ? '(اختياري)' : '(مطلوب لإرسال الإيصال)';
    main.querySelector('#phone').placeholder = region === 'sd' ? '+249 9xx xxx xxx' : '+966 5xx xxx xxx';
    main.querySelector('[data-pay]').innerHTML =
      region === 'sd'
        ? `<div class="pay-method">${icons.bank}<div><b>تحويل عبر بنكك</b><p>بعد تأكيد الطلب ستظهر لك بيانات الحساب. حوّل المبلغ ثم ارفع صورة الإشعار، وسنؤكد طلبك بعد مراجعته.</p></div></div>`
        : cardEnabled
          ? `<div class="pay-method">${icons.card}<div><b>بطاقة Visa / Mastercard</b><p>سيتم تحويلك لصفحة دفع آمنة لإكمال الدفع.</p></div></div>`
          : `<p class="notice">الدفع الإلكتروني لعملاء خارج السودان سيتوفر قريباً. تواصل معنا عبر واتساب لإتمام طلبك.</p>`;
    main.querySelector('[data-submit]').disabled = region === 'intl' && !cardEnabled;
    await renderSummary();
  };

  const renderSummary = async () => {
    const items = cart.items();
    const data = await api(`/variants?region=${region}&ids=${items.map((i) => i.variantId).join(',')}`).catch(() => ({ variants: [], currency: 'SDG' }));
    const byId = new Map(data.variants.map((v) => [v.id, v]));
    let subtotal = 0;
    const lines = items
      .map((i) => {
        const v = byId.get(i.variantId);
        if (!v) return '';
        subtotal += v.price * i.quantity;
        return `<div class="summary-line"><img src="${esc(v.image)}" alt=""><div><b>${esc(v.name)}</b><div class="sub">${[v.color, v.size, `× ${i.quantity}`].filter(Boolean).map(esc).join(' · ')}</div></div><b>${formatPrice(v.price * i.quantity, data.currency)}</b></div>`;
      })
      .join('');
    const shipping = config.regions[region].shipping ?? 0;
    main.querySelector('[data-summary]').innerHTML = `${lines}
      <div class="totals" style="margin-top:10px">
        <div><span>المجموع الفرعي</span><span>${formatPrice(subtotal, data.currency)}</span></div>
        <div><span>الشحن</span><span>${formatPrice(shipping, data.currency)}</span></div>
        <div class="grand"><span>الإجمالي</span><span>${formatPrice(subtotal + shipping, data.currency)}</span></div>
      </div>`;
  };

  main.querySelector('.region-cards').addEventListener('click', (e) => {
    const card = e.target.closest('[data-r]');
    if (!card) return;
    region = card.dataset.r;
    setRegion(region);
    syncRegion();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const err = main.querySelector('[data-error]');
    err.hidden = true;
    let firstInvalid = null;
    form.querySelectorAll('.field').forEach((f) => f.classList.remove('invalid'));
    for (const id of ['name', 'phone', 'city', 'address', ...(region === 'intl' ? ['email'] : [])]) {
      const input = form.querySelector(`#${id}`);
      const ok = input.value.trim() && input.checkValidity() && (id !== 'phone' || /^\+?[0-9 ()-]{7,20}$/.test(input.value.trim()));
      if (!ok) {
        input.closest('.field').classList.add('invalid');
        firstInvalid ??= input;
      }
    }
    if (firstInvalid) {
      err.textContent = 'يرجى إكمال الحقول المطلوبة بشكل صحيح';
      err.hidden = false;
      firstInvalid.focus();
      return;
    }
    const submit = main.querySelector('[data-submit]');
    submit.disabled = true;
    submit.textContent = 'جاري إرسال الطلب…';
    try {
      const res = await api('/orders', {
        method: 'POST',
        body: JSON.stringify({
          customer: {
            name: fd.get('name'),
            phone: fd.get('phone'),
            email: fd.get('email') || null,
            country: region === 'sd' ? 'SD' : fd.get('country'),
            city: fd.get('city'),
            address: fd.get('address'),
          },
          items: cart.items(),
          paymentMethod: region === 'sd' ? 'bankak' : 'card',
          notes: fd.get('notes') || null,
        }),
      });
      rememberOrder(res.order.number, res.accessToken);
      cart.clear();
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      toast('تم إنشاء طلبك');
      navigate(`/order/${res.order.number}?token=${encodeURIComponent(res.accessToken)}`);
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
      submit.disabled = false;
      submit.textContent = 'تأكيد الطلب';
    }
  });

  await syncRegion();
}

const STEPS = [
  ['created', 'تم الطلب'],
  ['paid', 'تأكيد الدفع'],
  ['sent_to_supplier', 'تجهيز الطلب'],
  ['shipped', 'تم الشحن'],
  ['delivered', 'تم التسليم'],
];
const STATUS_TEXT = {
  pending_payment: ['بانتظار الدفع', 'amber'],
  awaiting_verification: ['جاري مراجعة الدفع', 'amber'],
  confirmed: ['تم تأكيد الدفع', 'green'],
  sent_to_supplier: ['قيد التجهيز', 'green'],
  shipped: ['تم الشحن', 'green'],
  delivered: ['تم التسليم', 'green'],
  cancelled: ['ملغي', 'red'],
};
const RANK = { pending_payment: 0, awaiting_verification: 0, confirmed: 1, sent_to_supplier: 2, shipped: 3, delivered: 4, cancelled: -1 };

export async function order(main, { number, query }) {
  const token = query.get('token') ?? '';
  document.title = `طلب ${number} | متجر البشرى`;
  let polls = 0;
  const load = async () => {
    let data;
    try {
      data = await api(`/orders/${encodeURIComponent(number)}?token=${encodeURIComponent(token)}`);
    } catch {
      main.innerHTML = `<div class="container"><div class="empty"><p>لم نجد هذا الطلب. تأكد من الرابط المرسل إليك.</p><a class="btn" href="/" data-link>العودة للرئيسية</a></div></div>`;
      return;
    }
    const o = data.order;
    const [label, tone] = STATUS_TEXT[o.status] ?? [o.status, ''];
    const rank = RANK[o.status] ?? 0;
    const tracking = o.items.map((i) => i.trackingNumber).filter(Boolean);
    const justPaid = query.get('paid') === '1' && o.status === 'pending_payment';

    main.innerHTML = `
      <div class="container page-head"><h1>طلب رقم <span dir="ltr">${esc(o.number)}</span></h1>
        <p><span class="status-pill ${tone}">${label}</span> · ${new Date(o.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString('ar-EG', { dateStyle: 'long' })}</p></div>
      <div class="container checkout">
        <div>
          ${o.status !== 'cancelled' ? `<section class="panel"><ol class="timeline">${STEPS.map(([, t], i) => `<li class="${i <= rank ? 'done' : ''}">${t}</li>`).join('')}</ol>
            ${tracking.length ? `<p style="margin:16px 0 0">رقم التتبع: <b dir="ltr">${tracking.map(esc).join('، ')}</b></p>` : ''}</section>` : ''}
          ${justPaid ? `<section class="panel"><p class="notice ok">تم استلام الدفع، جاري تأكيده… سيتم تحديث الصفحة تلقائياً.</p></section>` : ''}
          <div data-payment></div>
        </div>
        <aside class="panel"><h2>تفاصيل الطلب</h2>
          ${o.items.map((i) => `<div class="summary-line" style="grid-template-columns:1fr auto"><div><b>${esc(i.name)}</b><div class="sub">${[i.color, i.size, `× ${i.quantity}`].filter(Boolean).map(esc).join(' · ')}</div></div><b>${formatPrice(i.unitPrice * i.quantity, o.currency)}</b></div>`).join('')}
          <div class="totals" style="margin-top:10px">
            <div><span>المجموع الفرعي</span><span>${formatPrice(o.subtotal, o.currency)}</span></div>
            <div><span>الشحن</span><span>${formatPrice(o.shipping, o.currency)}</span></div>
            <div class="grand"><span>الإجمالي</span><span>${formatPrice(o.total, o.currency)}</span></div>
          </div>
          <p style="margin:12px 0 0;color:var(--muted);font-size:.88rem">${esc(o.customer.name)} · <span dir="ltr">${esc(o.customer.phone)}</span><br>${esc(o.customer.city)}، ${esc(o.customer.address)}</p>
        </aside>
      </div>`;

    const pay = main.querySelector('[data-payment]');
    if (o.paymentMethod === 'bankak' && o.status === 'pending_payment' && data.bankak) {
      const b = data.bankak;
      pay.innerHTML = `<section class="panel"><h2>${icons.bank} الدفع عبر بنكك</h2>
        ${o.paymentStatus === 'rejected' ? '<p class="notice err">لم نتمكن من تأكيد الإشعار السابق. يرجى التأكد من المبلغ ورفع إشعار صحيح.</p><br>' : ''}
        <div class="bankak-box">
          <div class="row"><span>اسم الحساب</span><span class="val">${esc(b.accountName || '—')}</span></div>
          <div class="row"><span>رقم الحساب</span><span><span class="val">${esc(b.accountNumber || '—')}</span> <button type="button" class="copy" data-copy="${esc(b.accountNumber)}">نسخ</button></span></div>
          <div class="row"><span>المبلغ</span><span class="val">${formatPrice(b.amount, b.currency)}</span></div>
          <div class="row"><span>اكتب في التعليق</span><span><span class="val">${esc(b.reference)}</span> <button type="button" class="copy" data-copy="${esc(b.reference)}">نسخ</button></span></div>
        </div>
        <form data-receipt style="display:grid;gap:12px;margin-top:16px">
          <label class="dropzone" for="receipt">${icons.upload}<b>ارفع صورة إشعار التحويل</b><span class="hint" style="color:var(--muted);font-size:.85rem">صورة أو PDF، حتى 5 ميجابايت</span><input id="receipt" name="receipt" type="file" accept="image/*,application/pdf" class="sr-only" required></label>
          <div class="field"><label for="tx">رقم العملية <span class="hint">(اختياري)</span></label><input id="tx" name="transactionId" type="text" dir="ltr"></div>
          <p class="notice err" data-receipt-error hidden></p>
          <button class="btn primary block" type="submit">إرسال الإشعار</button>
        </form></section>`;
      const form = pay.querySelector('[data-receipt]');
      const input = form.querySelector('#receipt');
      const zone = form.querySelector('.dropzone');
      input.addEventListener('change', () => {
        const f = input.files[0];
        if (!f) return;
        zone.innerHTML = f.type.startsWith('image/') ? `<img src="${URL.createObjectURL(f)}" alt="معاينة الإشعار"><span>${esc(f.name)}</span>` : `${icons.check}<b>${esc(f.name)}</b>`;
        zone.append(input);
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = form.querySelector('[data-receipt-error]');
        if (!input.files[0]) {
          errEl.textContent = 'اختر صورة الإشعار أولاً';
          errEl.hidden = false;
          return;
        }
        const btn = form.querySelector('[type=submit]');
        btn.disabled = true;
        btn.textContent = 'جاري الرفع…';
        try {
          await api(`/orders/${encodeURIComponent(o.number)}/receipt?token=${encodeURIComponent(token)}`, { method: 'POST', body: new FormData(form) });
          toast('تم استلام الإشعار');
          load();
        } catch (error) {
          errEl.textContent = error.message;
          errEl.hidden = false;
          btn.disabled = false;
          btn.textContent = 'إرسال الإشعار';
        }
      });
      pay.addEventListener('click', async (e) => {
        const c = e.target.closest('[data-copy]');
        if (!c) return;
        try {
          await navigator.clipboard.writeText(c.dataset.copy);
          toast('تم النسخ');
        } catch {}
      });
    } else if (o.status === 'awaiting_verification') {
      pay.innerHTML = `<section class="panel"><p class="notice">استلمنا إشعار التحويل وجاري مراجعته. سنؤكد طلبك قريباً ونبلغك عبر الهاتف.</p></section>`;
    } else if (o.paymentMethod === 'card' && o.status === 'pending_payment' && !justPaid) {
      pay.innerHTML = `<section class="panel"><h2>${icons.card} الدفع بالبطاقة</h2><p>لم يكتمل الدفع بعد.</p><button class="btn primary" data-pay>ادفع الآن</button><p class="notice err" data-pay-error hidden></p></section>`;
      pay.querySelector('[data-pay]').addEventListener('click', async () => {
        try {
          const res = await api(`/orders/${encodeURIComponent(o.number)}/checkout?token=${encodeURIComponent(token)}`, { method: 'POST' });
          window.location.href = res.checkoutUrl;
        } catch (error) {
          const el = pay.querySelector('[data-pay-error]');
          el.textContent = error.message;
          el.hidden = false;
        }
      });
    }
    if (justPaid && polls++ < 15) setTimeout(load, 4000);
  };
  await load();
}
