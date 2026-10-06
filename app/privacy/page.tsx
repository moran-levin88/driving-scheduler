import Link from 'next/link'
import { INSTRUCTOR_NAME, INSTRUCTOR_LICENSE_NUMBER } from '@/lib/instructorInfo'

export const metadata = { title: 'מדיניות פרטיות' }

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-blue-50 py-10 px-4" dir="rtl">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-md p-8 space-y-5 text-sm leading-relaxed text-gray-700">
        <div>
          <h1 className="text-2xl font-bold text-blue-900 mb-1">מדיניות פרטיות</h1>
          <p className="text-xs text-gray-400">עודכן לאחרונה: אוקטובר 2026</p>
        </div>

        <section>
          <h2 className="font-bold text-gray-900 mb-1">מי אוסף את המידע</h2>
          <p>
            {INSTRUCTOR_NAME}, מורה לנהיגה (מספר הוראה {INSTRUCTOR_LICENSE_NUMBER}), מפעיל/ה מערכת זו
            לניהול שיעורי נהיגה, תיאום לוח זמנים וחיוב תלמידים. {INSTRUCTOR_NAME} הוא/היא בעל/ת השליטה
            במאגר המידע המתואר במדיניות זו.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-1">אילו פרטים נאספים</h2>
          <ul className="list-disc pr-5 space-y-1">
            <li>פרטים מזהים: שם מלא, מספר תעודת זהות, תאריך לידה</li>
            <li>פרטי התקשרות: טלפון, כתובת אימייל, כתובת איסוף לשיעורים</li>
            <li>פרטי שיעורים: מועדים, סטטוס, הערות</li>
            <li>פרטי חיוב ותשלום: תעריף, תשלומים שבוצעו, אמצעי תשלום, פרטי חשבונית</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-1">למה המידע נאסף</h2>
          <p>
            המידע משמש אך ורק לצורך תפעול שירות שיעורי הנהיגה: קביעה וניהול של שיעורים, יצירת קשר בנוגע
            לשיעורים, הפקת חשבוניות וקבלות, וניהול כרטיס תלמיד כנדרש בדיני המס (הוראות ניהול פנקסי
            חשבונות). המידע אינו משמש לפרסום או משווק לצד שלישי כלשהו.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-1">שיתוף עם ספקי שירות</h2>
          <p>
            חלק מהמידע מועבר לספקים חיצוניים הנחוצים להפעלת השירות בלבד: שירות הנפקת חשבוניות (Morning),
            שירות סנכרון יומן (Google Calendar), ושירותי שליחת הודעות דוא&quot;ל/התראות. ספקים אלו מחויבים
            לשמור על סודיות המידע ואינם רשאים להשתמש בו למטרה אחרת.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-1">תקופת השמירה</h2>
          <p>
            מידע הקשור לשיעורים, תשלומים וחשבוניות נשמר בהתאם לחובת שמירת ספרי חשבונות לפי דיני המס
            (לרוב 7 שנים מתום שנת המס הרלוונטית). מידע שאינו דרוש עוד לצורך זה יימחק או יצומצם בהתאם
            לבקשה, ככל שניתן בכפוף לחובות השמירה החוקיות.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-1">אבטחת מידע</h2>
          <p>
            סיסמאות נשמרות מוצפנות, התקשורת עם המערכת מוצפנת (HTTPS), וגישה למידע מוגבלת לפי הרשאות
            (תלמיד/ה רואה רק את המידע שלו/שלה). ניסיונות התחברות כושלים חוזרים חוסמים זמנית את החשבון.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-1">הזכויות שלך</h2>
          <p>
            באפשרותך לעיין במידע שנשמר עליך, לבקש תיקון של מידע שגוי, ולפנות בכל שאלה או בקשה בנוגע
            לפרטיותך ישירות אל {INSTRUCTOR_NAME}.
          </p>
        </section>

        <div className="pt-4 border-t">
          <Link href="/" className="text-blue-600 hover:underline text-sm">
            &larr; חזרה לדף הבית
          </Link>
        </div>
      </div>
    </main>
  )
}
