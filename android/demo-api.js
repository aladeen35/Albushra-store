// Offline stand-in for the store API inside the Android demo app.
// Serves the catalogue exported into assets/demo-data/ and keeps demo orders in localStorage,
// so the storefront runs unchanged without the Cloudflare backend.
(function () {
  const realFetch = window.fetch.bind(window);
  const cache = {};
  const load = (name) => (cache[name] ??= realFetch(`/demo-data/${name}.json`).then((r) => r.json()));
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const ORDERS = 'bushra.demo.orders';
  const orders = () => {
    try {
      return JSON.parse(localStorage.getItem(ORDERS) || '{}');
    } catch {
      return {};
    }
  };
  const saveOrders = (o) => localStorage.setItem(ORDERS, JSON.stringify(o));
  const regionOf = (v) => (v === 'intl' || (v && v.length === 2 && v.toUpperCase() !== 'SD') ? 'intl' : 'sd');

  async function handle(url, init) {
    const path = url.pathname.replace(/^\/api/, '');
    const q = url.searchParams;
    const method = (init?.method || 'GET').toUpperCase();

    if (path === '/config') {
      const c = await load('config');
      return json({ ...c, detectedCountry: 'SD', regions: { ...c.regions, intl: { ...c.regions.intl, paymentMethods: [] } } });
    }
    if (path === '/categories') return json(await load('categories'));
    if (path === '/products') {
      const { products } = await load(`products-${regionOf(q.get('region'))}`);
      let list = products;
      if (q.get('category')) list = list.filter((p) => p.category === q.get('category'));
      if (q.get('q')) list = list.filter((p) => (p.name + p.description).includes(q.get('q')));
      const offset = Number(q.get('offset')) || 0;
      const limit = Number(q.get('limit')) || 24;
      return json({ products: list.slice(offset, offset + limit), limit, offset });
    }
    if (path.startsWith('/products/')) {
      const slug = decodeURIComponent(path.slice('/products/'.length));
      const { products } = await load(`products-${regionOf(q.get('region'))}`);
      const p = products.find((x) => x.slug === slug);
      return p ? json({ product: p }) : json({ error: 'not_found' }, 404);
    }
    if (path === '/variants') {
      const region = regionOf(q.get('region'));
      const { products } = await load(`products-${region}`);
      const ids = (q.get('ids') || '').split(',').map(Number);
      const variants = [];
      for (const p of products) {
        for (const v of p.variants) {
          if (!ids.includes(v.id)) continue;
          variants.push({ id: v.id, slug: p.slug, name: p.name, size: v.size, color: v.color, image: (v.images[0] ?? p.images[0]) || null, price: v.price, inStock: v.inStock });
        }
      }
      return json({ currency: region === 'sd' ? 'SDG' : 'USD', variants });
    }
    if (path === '/orders' && method === 'POST') {
      const body = JSON.parse(init.body);
      if (body.paymentMethod !== 'bankak') return json({ error: 'card_unavailable', message: 'الدفع الإلكتروني غير متاح في النسخة التجريبية' }, 400);
      const config = await load('config');
      const { products } = await load('products-sd');
      const items = [];
      let subtotal = 0;
      for (const it of body.items) {
        for (const p of products) {
          const v = p.variants.find((x) => x.id === it.variantId);
          if (!v) continue;
          subtotal += v.price * it.quantity;
          items.push({ name: p.name, size: v.size, color: v.color, quantity: it.quantity, unitPrice: v.price, trackingNumber: null });
        }
      }
      const number = 'BSH-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      const token = Math.random().toString(36).slice(2);
      const shipping = config.regions.sd.shipping;
      const order = {
        number, status: 'pending_payment', paymentMethod: 'bankak', paymentStatus: 'unpaid', currency: 'SDG',
        subtotal, shipping, total: subtotal + shipping, createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        customer: { name: body.customer.name, phone: body.customer.phone, city: body.customer.city, address: body.customer.address, country: 'SD' }, items,
      };
      const all = orders();
      all[number] = { order, token };
      saveOrders(all);
      return json({ order, accessToken: token, bankak: bankak(order) }, 201);
    }
    const m = path.match(/^\/orders\/([^/]+)(\/receipt|\/checkout)?$/);
    if (m) {
      const rec = orders()[decodeURIComponent(m[1])];
      if (!rec || rec.token !== q.get('token')) return json({ error: 'not_found' }, 404);
      if (m[2] === '/receipt') {
        rec.order.status = 'awaiting_verification';
        rec.order.paymentStatus = 'pending_verification';
        const all = orders();
        all[rec.order.number] = rec;
        saveOrders(all);
        return json({ ok: true, status: 'awaiting_verification' });
      }
      if (m[2] === '/checkout') return json({ error: 'card_unavailable', message: 'غير متاح في النسخة التجريبية' }, 400);
      return json({ order: rec.order, ...(rec.order.status === 'pending_payment' ? { bankak: bankak(rec.order) } : {}) });
    }
    return json({ error: 'not_found' }, 404);
  }

  function bankak(order) {
    return { accountName: 'البشرى للملابس (تجريبي)', accountNumber: '0000000', amount: order.total, currency: 'SDG', reference: order.number };
  }

  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/api/')) return handle(url, init);
    return realFetch(input, init);
  };
})();
