// The official staged practical-driving curriculum (הרשות הלאומית לבטיחות
// בדרכים / משרד התחבורה, "תוכנית לימוד נהיגה עיונית משולבת בלימודים
// מעשיים" — the current/new כרטיס תלמיד). Each stage is defined purely by
// a cumulative-lesson-count range out of the 28-lesson minimum — completion
// is derived from the student's lesson count alone, never set by hand.
export type CurriculumStage = {
  key: string
  title: string
  topics: string[]
  fromLesson: number
  toLesson: number
}

export const CURRICULUM_STAGES: CurriculumStage[] = [
  {
    key: 'A',
    title: 'שלב א\' — הכרת תא הנהג, תפעול והסתכלות',
    topics: [
      'כניסה ויציאה מהרכב, הכרת תא הנהג',
      'בקיאות ושליטה במכלולי הרכב',
      'התנעת מנוע, התחלת נסיעה ואיתות',
      'אבטחת הרכב בסיום נסיעה, מרחקי עצירה',
      'הרגלי הסתכלות וזיהוי סימנים מעידים',
      'הדרך וחלקיה, תמרורים',
    ],
    fromLesson: 1,
    toLesson: 4,
  },
  {
    key: 'B',
    title: 'שלב ב\' — מיקום בדרך, חניה, צמתים, פניות וזכויות קדימה',
    topics: [
      'מיקום בכביש, עצירה וחניה',
      'זכויות קדימה ותמרורים',
      'מעגלי תנועה',
      'התאמת הנהיגה להולכי רגל',
      'רכב בטיחותי',
    ],
    fromLesson: 5,
    toLesson: 10,
  },
  {
    key: 'C1',
    title: 'שלב ג\' (חלק 1) — מהירות נסיעה, שמירת מרווח, עקיפות ודרכים הרריות',
    topics: [
      'מהירות הנסיעה ושמירת מרווח',
      'נסיעה בדרכים עירוניות שאינן במהירויות גבוהות',
      'נהיגה בשול הדרך',
      'נהיגה בזמן תאורה',
      'מסלול אתגר מסכם — נסיעה ארוכת טווח בתנאי דרך, תנועה ומהירויות שונים',
    ],
    fromLesson: 11,
    toLesson: 15,
  },
  {
    key: 'C2',
    title: 'שלב ג\' (חלק 2) — נהיגה מתקדמת ולנהוג ולדעת יותר',
    topics: [
      'מערכות בטיחות מתקדמות ויציבות הרכב',
      'ביקורות רכב וטיפול בתקלות',
      'חגורות בטיחות, כריות אוויר וריסון ילדים',
      'נהיגת חורף וקיץ, אחריות הנהג',
      'נהג חדש וחובת ליווי',
      'גרירת גרור',
      'השלמות וסיכום',
    ],
    fromLesson: 16,
    toLesson: 24,
  },
  {
    key: 'FINAL',
    title: 'תרגול מסכם והכנה למבחן המעשי',
    topics: [
      'תרגול מסכם של כל הנושאים שנלמדו',
      'הכנה למבחן המעשי (טסט)',
    ],
    fromLesson: 25,
    toLesson: 28,
  },
]

export type StageProgress = CurriculumStage & {
  status: 'done' | 'in_progress' | 'not_started'
  lessonsCompletedInStage: number
  lessonsTotalInStage: number
}

// totalLessons is the same cumulative count already shown elsewhere on the
// student card (platform bookings + manual prior-lesson entries) — the
// stages don't track anything separately.
export function getStageProgress(totalLessons: number): StageProgress[] {
  return CURRICULUM_STAGES.map(stage => {
    const size = stage.toLesson - stage.fromLesson + 1
    const completed = Math.min(size, Math.max(0, totalLessons - (stage.fromLesson - 1)))
    const status: StageProgress['status'] =
      completed >= size ? 'done' : completed > 0 ? 'in_progress' : 'not_started'
    return { ...stage, status, lessonsCompletedInStage: completed, lessonsTotalInStage: size }
  })
}
