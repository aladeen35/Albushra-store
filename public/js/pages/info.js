import { esc, getConfig } from '../api.js';
import { icons } from '../icons.js';
import { featuresMarkup } from './home.js';

export async function about(main) {
  document.title = 'من نحن | متجر البشرى';
  main.innerHTML = `
    <section class="section"><div class="container about">
      <img src="/brand/logo-3d.webp" alt="شعار متجر البشرى" width="800" height="800">
      <div>
        <h1>متجر البشرى .. أناقتك على ذوقك</h1>
        <p>متجر سوداني للملابس يجمع لك أحدث الموديلات العصرية مع الأزياء التقليدية التي نحبها: تيشيرتات وجاكيتات وهوديز وجينز، وعبايات نسائية وجلاليب سودانية.</p>
        <p>نختار القطع بعناية من موردين موثوقين، ونوصلها لك داخل السودان وفي أي مكان في العالم. داخل السودان تدفع بسهولة عبر بنكك، وخارجه تدفع بالبطاقة بأمان.</p>
        <a class="btn primary" href="/products" data-link>${icons.bag} ابدأ التسوق</a>
      </div>
    </div></section>
    <section class="section" style="padding-top:0"><div class="container">${featuresMarkup()}</div></section>`;
}

export async function contact(main) {
  document.title = 'اتصل بنا | متجر البشرى';
  const config = await getConfig();
  const wa = config.whatsappNumber;
  main.innerHTML = `
    <div class="container page-head"><h1>اتصل بنا</h1><p>يسعدنا الرد على استفساراتك حول الطلبات والمقاسات والشحن.</p></div>
    <section class="section" style="padding-top:20px"><div class="container contact-cards">
      ${wa
        ? `<a class="contact-card" href="https://wa.me/${esc(wa.replace(/\D/g, ''))}" target="_blank" rel="noopener">${icons.whatsapp}<div><b>واتساب</b><div dir="ltr">${esc(wa)}</div></div></a>`
        : `<div class="contact-card">${icons.whatsapp}<div><b>واتساب</b><div style="color:var(--muted)">سيُضاف الرقم قريباً</div></div></div>`}
      <div class="contact-card">${icons.truck}<div><b>الشحن</b><div style="color:var(--muted)">لجميع مدن السودان وخارجه</div></div></div>
      <div class="contact-card">${icons.shield}<div><b>الدفع</b><div style="color:var(--muted)">بنكك داخل السودان · بطاقة خارجه</div></div></div>
    </div></section>`;
}

export async function notFound(main) {
  document.title = 'الصفحة غير موجودة | متجر البشرى';
  main.innerHTML = `<div class="container"><div class="empty">${icons.hanger}<h1>الصفحة غير موجودة</h1><p>ربما تم نقل هذه القطعة من الرف.</p><a class="btn" href="/" data-link>العودة للرئيسية</a></div></div>`;
}
