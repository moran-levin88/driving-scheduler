# מערכת לקביעת שיעורי נהיגה

אפליקציית Next.js לניהול שיעורי נהיגה — מורה ותלמידים.

## דרישות מקדימות

- Node.js 18+
- PostgreSQL מותקן ופועל

## התקנה והרצה

### 1. הגדרת PostgreSQL

צור מסד נתונים חדש:

```bash
psql -U postgres
CREATE DATABASE driving_scheduler;
\q
```

### 2. הגדרת משתני סביבה

ערוך את הקובץ `.env.local` ושנה לפי הצורך:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/driving_scheduler"
NEXTAUTH_SECRET="שנה-לסוד-ארוך-ואקראי"
NEXTAUTH_URL="http://localhost:3000"
AUTH_SECRET="שנה-לסוד-ארוך-ואקראי"
RESEND_API_KEY="re_your_real_resend_api_key"
CRON_SECRET="שנה-לסוד-אקראי"
INSTRUCTOR_EMAIL="instructor@example.com"
INSTRUCTOR_PASSWORD="instructor123"
```

> **הערה לגבי אימייל:** להפעלת שליחת אימייל, קבל מפתח API אמיתי מ-[resend.com](https://resend.com).

### 3. אתחול מסד הנתונים

```bash
npm run db:push     # יצירת הטבלאות
npm run db:seed     # יצירת חשבון המורה
```

### 4. הרצת האפליקציה

```bash
npm run dev
```

פתח את הדפדפן בכתובת: [http://localhost:3000](http://localhost:3000)

---

## פרטי כניסה ברירת מחדל

### מורה

- **אימייל:** `instructor@example.com`
- **סיסמה:** `instructor123`

> שנה את הסיסמה בקובץ `.env.local` לפני הסיד.

### תלמיד

תלמידים נרשמים בעצמם דרך `/register`.
הם מתחברים עם קישור קסם (magic link) שנשלח לאימייל שלהם (דורש Resend API key).

---

## מבנה האפליקציה

```
/                      → דף בית (הפניה לפי תפקיד)
/login                 → כניסה למערכת
/register              → הרשמת תלמיד

/instructor/dashboard  → לוח בקרה למורה
/instructor/availability → ניהול שעות זמינות
/instructor/bookings   → ניהול הזמנות (אישור/דחייה)
/instructor/students   → רשימת תלמידים

/student/dashboard     → השיעורים שלי
/student/book          → קביעת שיעור חדש
```

## פריסה ל-Vercel

הקובץ `vercel.json` מגדיר cron job יומי (08:00) לשליחת תזכורות לתלמידים.

---

## פקודות נוספות

```bash
npm run db:studio  # Prisma Studio לצפייה במסד הנתונים
npm run build      # בנייה לייצור
```
