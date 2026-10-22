import { api, currentRegion, esc, getCategories } from '../api.js';
import { icons } from '../icons.js';
import { Rack } from '../rack.js';
import { marquee, navigate } from '../ui.js';

export const FEATURES = [
  { icon: 'truck', title: 'شحن سريع', text: 'توصيل لجميع مدن السودان وخارجه' },
  { icon: 'shield', title: 'دفع آمن', text: 'بنكك داخل السودان وبطاقة خارجه' },
  { icon: 'medal', title: 'جودة عالية', text: 'خامات مختارة بعناية' },
  { icon: 'hanger', title: 'تشكيلة متنوعة', text: 'من التيشيرت إلى الجلابية' },
];

export function featuresMarkup() {
  return `<div class="features">${FEATURES.map((f) => `<div class="feature">${icons[f.icon]}<b>${f.title}</b><span>${f.text}</span></div>`).join('')}</div>`;
}

export async function categoryCircles(cats, region) {
  // One front image per category, taken from its newest product.
  const covers = await Promise.all(
    cats.map((c) =>
      api(`/products?category=${encodeURIComponent(c.slug)}&limit=1&region=${region}`)
        .then((d) => d.products[0]?.variants.find((v) => v.images?.length)?.images ?? d.products[0]?.images ?? [])
        .catch(() => []),
    ),
  );
  return `<div class="cat-grid">${cats
    .map(
      (c, i) => `<a class="cat-card" href="/c/${encodeURIComponent(c.slug)}" data-link>
        <span class="circle">${covers[i][0] ? `<img src="${esc(covers[i][0])}" alt="" loading="lazy">` : ''}</span>${esc(c.name)}</a>`,
    )
    .join('')}</div>`;
}

export default async function home(main) {
  const [region, cats] = await Promise.all([currentRegion(), getCategories()]);
  main.innerHTML = `
    <section class="rack-section hero" aria-label="أحدث التصاميم">
      <div class="rack-filters" role="group" aria-label="تصفية حسب القسم">
        <button class="chip" aria-pressed="true" data-cat="">الكل</button>
        ${cats.map((c) => `<button class="chip" aria-pressed="false" data-cat="${esc(c.slug)}">${esc(c.name)}</button>`).join('')}
      </div>
      <div data-rack></div>
      ${marquee()}
    </section>
    <section class="section"><div class="container">
      <h2 class="section-title">تسوق حسب القسم</h2>
      <div data-cats><div class="loading" style="min-height:160px"><div class="spinner"></div></div></div>
    </div></section>
    <section class="section" style="padding-top:0"><div class="container">${featuresMarkup()}</div></section>`;

  const rack = new Rack(main.querySelector('[data-rack]'), { onOpen: (p) => navigate(`/p/${encodeURIComponent(p.slug)}`) });
  const load = async (cat) => {
    const r = await currentRegion();
    const data = await api(`/products?limit=14&region=${r}${cat ? `&category=${encodeURIComponent(cat)}` : ''}`).catch(() => ({ products: [] }));
    rack.setProducts(data.products);
  };
  main.querySelector('.rack-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    main.querySelectorAll('.rack-filters .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    load(chip.dataset.cat);
  });
  await load('');
  main.querySelector('[data-cats]').innerHTML = await categoryCircles(cats, region);

  const onRegion = () => load(main.querySelector('.rack-filters [aria-pressed="true"]')?.dataset.cat ?? '');
  window.addEventListener('region-change', onRegion);
  return () => {
    rack.destroy();
    window.removeEventListener('region-change', onRegion);
  };
}
