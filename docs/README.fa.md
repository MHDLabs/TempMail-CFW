# TempMail-CFW — راهنمای فارسی

سرویس ایمیل موقت سبک روی **Cloudflare Workers** با API و پنل مدیریت.

## قابلیت‌ها

- ساخت اینباکس تصادفی یا سفارشی
- دریافت ایمیل واقعی از طریق Email Routing
- ذخیره پیوست در R2 (دانلود با احراز هویت)
- API قدیمی (سازگار) و `/api/v1`
- پنل ادمین با تم روشن/تاریک
- استخراج خودکار کد OTP از موضوع/متن
- Webhook اختیاری هنگام دریافت پیام
- پاک‌سازی زمان‌بندی‌شده اینباکس‌های منقضی

## راه‌اندازی خلاصه

1. D1 و R2 و KV بسازید و IDها را در `wrangler.toml` بگذارید.
2. `EMAIL_DOMAINS` را تنظیم کنید.
3. Secret: `wrangler secret put PANEL_PASSWORD`
4. Migration: `wrangler d1 migrations apply tempmail-cfw`
5. دامنه را در Email Routing به Worker وصل کنید.
6. `npm install && npm run deploy`
7. پنل: `cd web && npm install && npm run build` سپس بخش `[assets]` در `wrangler.toml` را فعال کنید.

## مستندات بیشتر

- معماری: `docs/ARCHITECTURE.md`
- API: `docs/API.md` و `docs/openapi.yaml`
- امنیت: `docs/SECURITY.md`
- نگهداری داده: `docs/DATA-RETENTION.md`
- وب: `docs/WEB.md`
