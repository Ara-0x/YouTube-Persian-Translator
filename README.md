# YouTube Persian Translator 🇮🇷

<span dir="rtl">**ترجمهٔ زندهٔ زیرنویس یوتیوب به فارسی، با دوبلهٔ صوتی اختیاری**</span>

<span dir="rtl">YouTube Persian Translator یک افزونهٔ Google Chrome بر پایهٔ **Manifest V3** است که زیرنویس ویدیوهای YouTube را به‌صورت تدریجی به فارسی ترجمه می‌کند و ترجمه را مستقیماً روی ویدیو نمایش می‌دهد. همچنین می‌توانید ترجمه را با صدای مرورگر یا Gemini TTS بشنوید.</span>

<span dir="rtl">ترجمه با **Google Translate** انجام می‌شود و به کلید API نیاز ندارد. **Gemini فقط برای دوبلهٔ صوتی** استفاده می‌شود.</span>

## <span dir="rtl">✨ قابلیت‌ها</span>

- <span dir="rtl">🌐 **ترجمهٔ زنده:** ترجمهٔ تدریجی زیرنویس با هدف کاهش تأخیر</span>
- <span dir="rtl">⚡ **بدون API Key برای ترجمه:** استفاده از Google Translate</span>
- <span dir="rtl">🎯 **نمایش روی ویدیو:** نمایش کارت ترجمه روی زیرنویس یوتیوب</span>
- <span dir="rtl">🧲 **هم‌ترازی خودکار:** هماهنگ‌شدن موقعیت کارت با زیرنویس اصلی</span>
- <span dir="rtl">🔊 **دوبلهٔ صوتی اختیاری:** با صدای مرورگر یا Gemini TTS</span>
- <span dir="rtl">🎨 **شخصی‌سازی زیرنویس:** تنظیم موقعیت، اندازه و شفافیت</span>
- <span dir="rtl">💬 **نمایش متن اصلی:** امکان نمایش یا مخفی‌کردن زیرنویس اصلی</span>
- <span dir="rtl">🌗 **تم روشن و تاریک:** رابط یکپارچه با دو حالت نمایش</span>
- <span dir="rtl">💾 **کش ترجمه:** کاهش درخواست‌های تکراری</span>
- <span dir="rtl">⌨️ **میان‌برهای صفحه‌کلید:** کنترل سریع ترجمه و دوبله</span>

## <span dir="rtl">📦 نصب</span>

> <span dir="rtl">این راهنما مربوط به نصب دستی افزونه در نسخهٔ دسکتاپ Google Chrome است.</span>

### <span dir="rtl">۱. دانلود پروژه</span>

1. <span dir="rtl">به [صفحهٔ مخزن در GitHub](https://github.com/Ara-0x/YouTube-Persian-Translator) بروید.</span>
2. <span dir="rtl">روی دکمهٔ سبز **Code** کلیک کنید.</span>
3. <span dir="rtl">گزینهٔ **Download ZIP** را انتخاب کنید.</span>
4. <span dir="rtl">پس از پایان دانلود، فایل ZIP را از حالت فشرده خارج کنید.</span>

### <span dir="rtl">۲. بازکردن صفحهٔ افزونه‌ها</span>

1. <span dir="rtl">Google Chrome را باز کنید.</span>
2. <span dir="rtl">عبارت زیر را در نوار آدرس وارد کنید و کلید Enter را بزنید:</span>

   ```text
   chrome://extensions
   ```

3. <span dir="rtl">گزینهٔ **Developer mode** را فعال کنید.</span>

### <span dir="rtl">۳. بارگذاری افزونه</span>

1. <span dir="rtl">روی **Load unpacked** کلیک کنید.</span>
2. <span dir="rtl">پوشه‌ای را انتخاب کنید که فایل <code dir="ltr">manifest.json</code> مستقیماً داخل آن قرار دارد.</span>
3. <span dir="rtl">روی **Select Folder** کلیک کنید.</span>

<span dir="rtl">اگر افزونه با موفقیت بارگذاری شود، در فهرست افزونه‌های Chrome ظاهر خواهد شد.</span>

> <span dir="rtl">**نکته:** فایل ZIP را مستقیماً انتخاب نکنید؛ ابتدا آن را استخراج کنید. اگر پوشهٔ دانلودشده شامل یک پوشهٔ داخلی دیگر است، همان پوشه‌ای را انتخاب کنید که فایل <code dir="ltr">manifest.json</code> داخل آن قرار دارد.</span>

## <span dir="rtl">🚀 شروع کار</span>

1. <span dir="rtl">یک ویدیو در [YouTube](https://www.youtube.com/) باز کنید.</span>
2. <span dir="rtl">دکمهٔ **CC** را فعال کنید تا زیرنویس ویدیو نمایش داده شود.</span>
3. <span dir="rtl">از منوی **Extensions** در Chrome، افزونهٔ YouTube Persian Translator را باز کنید. اگر آیکون افزونه را در نوار ابزار نمی‌بینید، آن را از همین منو پیدا کنید.</span>
4. <span dir="rtl">ترجمه را از پنجرهٔ افزونه فعال کنید.</span>
5. <span dir="rtl">ترجمهٔ فارسی روی ویدیو نمایش داده می‌شود.</span>

<span dir="rtl">برای استفاده از دوبلهٔ Gemini، کلید API را در تنظیمات افزونه وارد کنید. برای ترجمه با Google Translate نیازی به کلید API نیست.</span>

## <span dir="rtl">🌐 ترجمه</span>

<span dir="rtl">مترجم فعلی افزونه **Google Translate** است.</span>

| <span dir="rtl">قابلیت</span> | <span dir="rtl">وضعیت</span> |
| --- | --- |
| <span dir="rtl">نیاز به API Key برای ترجمه</span> | <span dir="rtl">خیر</span> |
| <span dir="rtl">استفاده از Gemini برای ترجمه</span> | <span dir="rtl">خیر</span> |
| <span dir="rtl">ترجمهٔ تدریجی زیرنویس</span> | <span dir="rtl">بله</span> |
| <span dir="rtl">تلاش مجدد هنگام برخی خطاهای موقت</span> | <span dir="rtl">بله</span> |
| <span dir="rtl">دوبلهٔ صوتی با Gemini TTS</span> | <span dir="rtl">اختیاری</span> |

<span dir="rtl">ترجمه به سرویس Google Translate وابسته است؛ بنابراین محدودیت نرخ درخواست، دسترس‌پذیری سرویس یا تغییرات آن ممکن است بر عملکرد افزونه تأثیر بگذارد.</span>

## <span dir="rtl">🔊 دوبلهٔ صوتی</span>

<span dir="rtl">افزونه دو موتور دوبله دارد:</span>

| <span dir="rtl">موتور</span> | <span dir="rtl">توضیح</span> | <span dir="rtl">نیازمندی</span> |
| --- | --- | --- |
| <span dir="rtl">**Browser Speech**</span> | <span dir="rtl">استفاده از قابلیت گفتار مرورگر</span> | <span dir="rtl">صدای فارسی سازگار روی سیستم</span> |
| <span dir="rtl">**Gemini TTS**</span> | <span dir="rtl">تولید گفتار با سرویس Gemini</span> | <span dir="rtl">کلید API معتبر</span> |

<span dir="rtl">در حالت Gemini TTS، مدل و صداهای در دسترس به تنظیمات فعلی افزونه و دسترس‌پذیری سرویس بستگی دارند. استفاده از Gemini TTS ممکن است مشمول سهمیه، محدودیت یا هزینه‌های سرویس مربوطه باشد.</span>

<span dir="rtl">هنگام پخش دوبله، صدای اصلی ویدیو به‌طور خودکار کاهش می‌یابد. با توقف ویدیو یا جابه‌جایی در زمان پخش، صدای دوبله نیز قطع می‌شود.</span>

## <span dir="rtl">🎨 تنظیمات و شخصی‌سازی</span>

### <span dir="rtl">ظاهر زیرنویس</span>

- <span dir="rtl">انتخاب موقعیت پایین، بالا یا موقعیت سفارشی</span>
- <span dir="rtl">تغییر اندازه و شفافیت کارت</span>
- <span dir="rtl">نمایش یا مخفی‌کردن متن اصلی</span>
- <span dir="rtl">انتخاب تم روشن یا تاریک</span>

### <span dir="rtl">چسبیدن به زیرنویس</span>

<span dir="rtl">با فعال‌کردن این گزینه، کارت ترجمه با کادر زیرنویس یوتیوب هم‌تراز می‌شود و با تغییر اندازهٔ پنجره یا عوض‌شدن خط زیرنویس، موقعیت خود را تنظیم می‌کند.</span>

<span dir="rtl">اگر کارت را به‌صورت دستی جابه‌جا کنید، چسبیدن خودکار غیرفعال می‌شود تا موقعیت دلخواه شما حفظ شود. برای بازگرداندن آن، این گزینه را دوباره فعال کنید.</span>

### <span dir="rtl">میان‌برهای صفحه‌کلید</span>

| <span dir="rtl">میان‌بر</span> | <span dir="rtl">عملکرد</span> |
| --- | --- |
| <span dir="rtl"><code dir="ltr">Ctrl + Shift + P</code></span> | <span dir="rtl">فعال یا غیرفعال‌کردن ترجمه</span> |
| <span dir="rtl"><code dir="ltr">Ctrl + Shift + D</code></span> | <span dir="rtl">فعال یا غیرفعال‌کردن دوبله</span> |

<span dir="rtl">در macOS، در صورت پشتیبانی پیکربندی افزونه، از <code dir="ltr">Command</code> به‌جای <code dir="ltr">Ctrl</code> استفاده کنید.</span>

## <span dir="rtl">⚙️ نحوهٔ کار</span>

```text
زیرنویس یوتیوب
      │
      ▼
خواندن متن از DOM
      │
      ▼
تشخیص خط جدید یا تغییر متن
      │
      ▼
ادغام درخواست‌های تکراری
      │
      ▼
بررسی کش و درخواست ترجمه
      │
      ▼
نمایش ترجمه روی ویدیو
      │
      └── دوبلهٔ صوتی (اختیاری)
```

<span dir="rtl">افزونه متن زیرنویس را از بخش مربوط به پخش‌کننده می‌خواند و با نمونه‌برداری دوره‌ای، تغییرات آن را تشخیص می‌دهد. درخواست‌های تکراری تا حد امکان ادغام می‌شوند و نتیجه‌های موجود در کش دوباره درخواست نمی‌شوند.</span>

## <span dir="rtl">🔐 مجوزها</span>

| <span dir="rtl">مجوز یا دسترسی</span> | <span dir="rtl">کاربرد</span> |
| --- | --- |
| <span dir="rtl"><code dir="ltr">storage</code></span> | <span dir="rtl">ذخیرهٔ تنظیمات و داده‌های کش</span> |
| <span dir="rtl">دسترسی به YouTube</span> | <span dir="rtl">خواندن زیرنویس و نمایش رابط ترجمه</span> |
| <span dir="rtl"><code dir="ltr">translate.googleapis.com</code></span> | <span dir="rtl">ارسال متن برای ترجمه</span> |
| <span dir="rtl"><code dir="ltr">generativelanguage.googleapis.com</code></span> | <span dir="rtl">استفاده از Gemini TTS</span> |

## <span dir="rtl">🛡️ حریم خصوصی</span>

- <span dir="rtl">متن زیرنویس برای ترجمه به Google Translate ارسال می‌شود.</span>
- <span dir="rtl">اگر از Gemini TTS استفاده کنید، متن موردنیاز برای دوبله به سرویس Gemini ارسال خواهد شد.</span>
- <span dir="rtl">کلید API دوبله در ذخیره‌سازی محلی افزونه، یعنی <code dir="ltr">chrome.storage.local</code>، نگهداری می‌شود.</span>
- <span dir="rtl">افزونه برای عملکرد معمول خود به سرور اختصاصی پروژه نیاز ندارد.</span>

<span dir="rtl">استفاده از سرویس‌های خارجی تابع شرایط و سیاست‌های حریم خصوصی همان سرویس‌هاست. ذخیره‌شدن کلید روی دستگاه به‌تنهایی تضمین نمی‌کند که اطلاعات در برابر تمام انواع دسترسی غیرمجاز محافظت شده باشند.</span>

## <span dir="rtl">🧰 رفع اشکال</span>

### <span dir="rtl">ترجمه نمایش داده نمی‌شود</span>

- <span dir="rtl">مطمئن شوید ویدیو زیرنویس قابل‌دسترسی دارد.</span>
- <span dir="rtl">دکمهٔ **CC** را روشن کنید.</span>
- <span dir="rtl">ترجمه را از پنجرهٔ افزونه فعال کنید.</span>
- <span dir="rtl">اتصال اینترنت را بررسی کنید.</span>

### <span dir="rtl">پیام تنظیم‌نبودن API Key نمایش داده می‌شود</span>

<span dir="rtl">برای ترجمه با Google Translate کلیدی لازم نیست. اگر از Gemini TTS استفاده می‌کنید، کلید API را در تنظیمات بخش دوبله بررسی کنید.</span>

### <span dir="rtl">خطای 429 یا محدودیت درخواست</span>

<span dir="rtl">این خطا ممکن است به محدودیت نرخ درخواست‌های سرویس مربوط باشد. کمی صبر کنید و دوباره امتحان کنید.</span>

### <span dir="rtl">صدای فارسی پخش نمی‌شود</span>

<span dir="rtl">اگر از صدای مرورگر استفاده می‌کنید، وجود صدای فارسی سازگار روی سیستم را بررسی کنید. در صورت نیاز، موتور دوبله را به Gemini TTS تغییر دهید.</span>

### <span dir="rtl">کارت ترجمه با زیرنویس هم‌تراز نیست</span>

<span dir="rtl">گزینهٔ چسبیدن به زیرنویس را در تنظیمات فعال کنید. جابه‌جایی دستی کارت ممکن است این قابلیت را غیرفعال کرده باشد.</span>

### <span dir="rtl">افزونه نصب نمی‌شود یا خطا دارد</span>

<span dir="rtl">به <code dir="ltr">chrome://extensions</code> بروید و پیام خطا را بررسی کنید. مطمئن شوید پوشهٔ انتخاب‌شده مستقیماً شامل فایل <code dir="ltr">manifest.json</code> است و فایل‌های پروژه به‌طور کامل استخراج شده‌اند.</span>

## <span dir="rtl">🗂️ ساختار پروژه</span>

```text
manifest.json       پیکربندی افزونه بر پایهٔ Manifest V3
providers.js        تنظیمات پیش‌فرض و فهرست مترجم‌ها و صداها
background.js       سرویس‌ورکر، ترجمه، کش و دوبله
content.js          خواندن زیرنویس و رابط روی ویدیو
theme.css           استایل تم روشن و تاریک رابط افزونه
content.css         استایل کارت ترجمه
popup.html/js/css   پنجرهٔ سریع افزونه
options.html/js/css صفحهٔ تنظیمات کامل
icons/              آیکون‌های افزونه
```

## <span dir="rtl">🤝 مشارکت</span>

<span dir="rtl">از گزارش باگ، پیشنهاد قابلیت و مشارکت در توسعه استقبال می‌کنیم.</span>

<span dir="rtl">برای ثبت مشکل یا پیشنهاد، از بخش [Issues](https://github.com/Ara-0x/YouTube-Persian-Translator/issues) استفاده کنید. لطفاً پیش از ارسال Pull Request، تغییرات خود را آزمایش کنید و توضیح روشنی از آن‌ها ارائه دهید.</span>

## <span dir="rtl">📄 مجوز</span>

<span dir="rtl">این پروژه تحت مجوز **MIT** منتشر می‌شود. برای جزئیات، فایل <code dir="ltr">LICENSE</code> مخزن را بررسی کنید.</span>

## <span dir="rtl">🔗 لینک‌ها</span>

- <span dir="rtl">[مخزن پروژه](https://github.com/Ara-0x/YouTube-Persian-Translator)</span>
- <span dir="rtl">[گزارش مشکلات و پیشنهادها](https://github.com/Ara-0x/YouTube-Persian-Translator/issues)</span>
