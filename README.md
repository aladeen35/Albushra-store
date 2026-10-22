# متجر البشرى

متجر ملابس يعمل بنظام الدروب شيب لعملاء داخل السودان وخارجه، مبني على Cloudflare:

- **Cloudflare Workers** يشغّل الخادم (Hono + TypeScript)
- **D1** قاعدة البيانات (المنتجات والطلبات والإعدادات)
- **R2** لتخزين صور المنتجات وإشعارات تحويل بنكك
- **Cron** كل ساعة لمزامنة حالة الطلبات من الموردين وإلغاء الطلبات غير المدفوعة

> واجهة المتجر (التصميم) لم تُبنَ بعد، وتنتظر الشعار وتفاصيل التصميم. المجلد `public/` يحوي صفحة «قريباً» مؤقتة.

## طرق الدفع

| العميل | الطريقة | سير العمل |
|---|---|---|
| داخل السودان | الدفع عند الاستلام (`cod`) | يُؤكَّد الطلب فوراً ويُرسَل للمورد |
| داخل السودان | بنكك (`bankak`) | يظهر للعميل رقم الحساب، فيرفع صورة الإشعار، ثم تراجعها وتوافق عليها من لوحة التحكم |
| خارج السودان | بطاقة (`card`) عبر Stripe | يُحوَّل العميل لصفحة الدفع، ويُؤكَّد الطلب تلقائياً عند الدفع |

الدولة `SD` تعني «داخل السودان» والأسعار فيها بالجنيه، وما عداها «خارج السودان» والأسعار بالدولار. السعر الأساسي لكل منتج بالدولار، ويُحوَّل للجنيه بسعر الصرف في الإعدادات، ويمكن تحديد سعر ثابت بالجنيه لأي مقاس.

## حالات الطلب

`pending_payment` ← `awaiting_verification` (بنكك) ← `confirmed` ← `sent_to_supplier` ← `shipped` ← `delivered`، ويمكن الانتقال إلى `cancelled` من أي مرحلة قبل التسليم.

## الموردون

كل مورد له «محوّل» (adapter):

- `manual`: يُرسَل الطلب للمورد يدوياً (مثلاً بالواتساب)، ثم تحدّث الحالة من لوحة التحكم.
- `http_json`: ربط عبر API، يُرسل الطلب تلقائياً ويسحب حالة الشحن ورقم التتبع ويستورد المنتجات. يُضبط بـ `baseUrl` ومسارات الـ API في إعدادات المورد، ويوضع مفتاح الـ API في السر `SUPPLIER_<CODE>_API_KEY`.

إذا كان الـ API لمورد معيّن يختلف عن الشكل العام، يُضاف له ملف محوّل خاص في `src/suppliers/` يطبّق الواجهة `SupplierAdapter`. أرسل توثيق الـ API الخاص بالمورد ليُبرمج ربطه.

## التشغيل محلياً

```bash
npm install
cp .dev.vars.example .dev.vars      # ضع ADMIN_TOKEN
npm run db:migrate:local
npm run dev                          # http://localhost:8787
npm test
```

## النشر على Cloudflare

```bash
npx wrangler login
npx wrangler d1 create albushra-db           # انسخ database_id إلى wrangler.jsonc
npx wrangler r2 bucket create albushra-media
npm run db:migrate:remote
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put STRIPE_SECRET_KEY          # عند تفعيل الدفع الإلكتروني
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npm run deploy
```

بعد النشر:
1. عدّل `PUBLIC_URL` في `wrangler.jsonc` إلى رابط المتجر، واربط النطاق من لوحة Cloudflare.
2. في لوحة Stripe أضف Webhook على `https://<النطاق>/api/payments/stripe/webhook` للأحداث `checkout.session.completed` و`checkout.session.async_payment_succeeded` و`checkout.session.async_payment_failed`.
3. من `PUT /api/admin/settings` اضبط: رقم حساب بنكك واسمه، وسعر الصرف، ورسوم الشحن، ورقم الواتساب.

> **تنبيه:** حساب Stripe يجب أن يُفتح في دولة يدعمها Stripe (مثل الإمارات أو بريطانيا أو أمريكا). إن كان الحساب في السعودية أو مصر فيمكن استبدال Stripe ببوابة أخرى مثل Tap أو Paymob، وذلك بتعديل `src/payments/`.

## واجهة الـ API

جميع المبالغ أعداد صحيحة: **الدولار بالسنت** (2000 = 20$) و**الجنيه بالجنيه الكامل**.

### للمتجر (عام)

| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/api/config` | اسم المتجر وطرق الدفع والشحن لكل منطقة |
| GET | `/api/categories` | الأقسام |
| GET | `/api/products?region=sd&category=&q=&limit=&offset=` | المنتجات بعملة المنطقة (`region` = `sd` أو `intl` أو رمز الدولة) |
| GET | `/api/products/:slug?region=` | تفاصيل منتج |
| POST | `/api/orders` | إنشاء طلب (انظر المثال أدناه) |
| GET | `/api/orders/:number?token=` | متابعة الطلب |
| POST | `/api/orders/:number/receipt?token=` | رفع إشعار بنكك (`multipart`: الحقلان `receipt` و`transactionId`) |
| POST | `/api/orders/:number/checkout?token=` | إعادة محاولة الدفع بالبطاقة |

```json
POST /api/orders
{
  "customer": { "name": "أحمد علي", "phone": "+249912345678", "country": "SD", "city": "بورتسودان", "address": "حي الثورة" },
  "items": [{ "variantId": 1, "quantity": 2 }],
  "paymentMethod": "cod"
}
```

يُرجِع الطلب ورمز `accessToken` (يُحفظ في المتصفح لمتابعة الطلب)، ومعه بيانات حساب بنكك أو رابط الدفع `checkoutUrl` حسب طريقة الدفع.

### لوحة التحكم (الترويسة `Authorization: Bearer <ADMIN_TOKEN>`)

| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/api/admin/summary` | عدد الطلبات حسب الحالة |
| GET | `/api/admin/orders?status=&q=` | قائمة الطلبات |
| GET | `/api/admin/orders/:number` | تفاصيل الطلب وسجل أحداثه |
| GET | `/api/admin/orders/:number/receipt` | صورة إشعار بنكك |
| POST | `/api/admin/orders/:number/verify-payment` | `{ "approve": true }` لقبول تحويل بنكك أو رفضه |
| POST | `/api/admin/orders/:number/status` | `{ "status": "shipped" }` لتغيير الحالة |
| POST | `/api/admin/orders/:number/forward` | إرسال الطلب للمورد يدوياً أو إعادة المحاولة |
| POST | `/api/admin/orders/:number/note` | ملاحظة داخلية |
| GET/POST/PUT/DELETE | `/api/admin/products[/:id]` | المنتجات (الحذف يُخفي المنتج فقط) |
| POST | `/api/admin/products/:id/variants`، PUT `/api/admin/variants/:id` | المقاسات والألوان |
| POST | `/api/admin/media` | رفع صورة منتج (`multipart`: الحقل `file`) |
| POST/PUT/DELETE | `/api/admin/categories[/:id]` | الأقسام |
| GET/POST/PUT | `/api/admin/suppliers[/:id]` | الموردون |
| POST | `/api/admin/suppliers/:id/import` | `{ "markupPercent": 50 }` لاستيراد منتجات المورد (تُضاف مخفية للمراجعة) |
| GET/PUT | `/api/admin/settings` | الإعدادات |

## هيكل المشروع

```
migrations/          جداول قاعدة البيانات
src/index.ts         نقطة الدخول والمهام المجدولة
src/routes/          مسارات الـ API (المتجر، الطلبات، الدفع، الإدارة)
src/lib/             الأسعار، الطلبات، الإعدادات، الصلاحيات
src/payments/        Stripe
src/suppliers/       محوّلات الموردين
test/                الاختبارات
public/              واجهة المتجر (لاحقاً)
```
