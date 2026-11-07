# TempMail-CFW — راهنمای فارسی

ایمیل موقت روی Cloudflare Workers با ذخیرهٔ محتوای نرمال‌شده در **D1**.

## قابلیت‌ها
- ساخت اینباکس تصادفی/سفارشی
- دریافت ایمیل از Email Routing
- API قدیمی و `/api/v1`
- فقط **فرادادهٔ پیوست** (دانلود فایل پشتیبانی نمی‌شود)
- پنل ادمین
- بدون R2 و بدون ارسال ایمیل خروجی

## راه‌اندازی
1. D1 و KV بسازید و در `wrangler.toml` قرار دهید
2. `EMAIL_DOMAINS` را تنظیم کنید
3. `wrangler secret put PANEL_PASSWORD`
4. `wrangler d1 migrations apply`
5. Email Routing را به Worker وصل کنید

جزئیات: `docs/ARCHITECTURE.md`
