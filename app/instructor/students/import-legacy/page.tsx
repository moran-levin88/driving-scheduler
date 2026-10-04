'use client'
import { useEffect, useState } from 'react'
import { LEGACY_STUDENTS, type LegacyStudent } from './legacyData'

type DbStudent = { id: string; name: string; phone: string | null }

type MatchState = {
  legacy: LegacyStudent
  match: DbStudent | null
  candidates: DbStudent[]
  existingRange: { min: string; max: string; count: number } | null
  checked: boolean
  alreadyImported: number
  selected: Set<number> // indices into legacy.lessons
  importTests: boolean
  loading: boolean
  result: string
  importing: boolean
}

function normalize(name: string) {
  return name.replace(/\s+/g, ' ').trim()
}

export default function ImportLegacyPage() {
  const [students, setStudents] = useState<DbStudent[] | null>(null)
  const [rows, setRows] = useState<MatchState[]>([])

  useEffect(() => {
    fetch('/api/students').then(r => r.json()).then((data: any[]) => {
      if (!Array.isArray(data)) return
      const list = data.map(s => ({ id: s.id, name: s.name, phone: s.phone }))
      setStudents(list)
      setRows(LEGACY_STUDENTS.map(legacy => {
        const candidates = list.filter(s => normalize(s.name) === normalize(legacy.name))
        return {
          legacy,
          match: candidates.length === 1 ? candidates[0] : null,
          candidates,
          existingRange: null,
          checked: false,
          alreadyImported: 0,
          selected: new Set(legacy.lessons.map((_, i) => i)),
          importTests: true,
          loading: false,
          result: '',
          importing: false,
        }
      }))
    })
  }, [])

  async function loadExisting(index: number) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, loading: true } : r))
    const row = rows[index]
    if (!row.match) return
    const [panelRes, manualRes] = await Promise.all([
      fetch(`/api/students/${row.match.id}/payments-panel`),
      fetch(`/api/students/${row.match.id}/manual-lessons`),
    ])
    const panel = await panelRes.json().catch(() => null)
    const manual = await manualRes.json().catch(() => [])
    let existingRange: MatchState['existingRange'] = null
    if (panel?.lessons?.length) {
      const times = panel.lessons.map((l: any) => new Date(l.startTime).getTime())
      existingRange = {
        min: new Date(Math.min(...times)).toLocaleDateString('he-IL'),
        max: new Date(Math.max(...times)).toLocaleDateString('he-IL'),
        count: panel.lessons.length,
      }
    }
    setRows(prev => prev.map((r, i) => i === index ? {
      ...r, loading: false, checked: true, existingRange, alreadyImported: Array.isArray(manual) ? manual.length : 0,
    } : r))
  }

  function toggleRow(index: number, lessonIdx: number) {
    setRows(prev => prev.map((r, i) => {
      if (i !== index) return r
      const next = new Set(r.selected)
      if (next.has(lessonIdx)) next.delete(lessonIdx)
      else next.add(lessonIdx)
      return { ...r, selected: next }
    }))
  }

  function selectMatch(index: number, studentId: string) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, match: r.candidates.find(c => c.id === studentId) ?? null } : r))
  }

  async function handleImport(index: number) {
    const row = rows[index]
    if (!row.match || row.selected.size === 0) return
    setRows(prev => prev.map((r, i) => i === index ? { ...r, importing: true, result: '' } : r))
    try {
      const records = [...row.selected].map(i => {
        const l = row.legacy.lessons[i]
        return { date: `${l.date}T${l.time}:00`, lessons: l.lessons, amountPaid: l.amount }
      })
      const res = await fetch(`/api/students/${row.match.id}/manual-lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRows(prev => prev.map((r, i) => i === index ? { ...r, importing: false, result: data.error || 'שגיאה' } : r))
        return
      }
      if (row.importTests && (row.legacy.practicalTests > 0 || row.legacy.internalTests > 0)) {
        await fetch(`/api/students/${row.match.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manualPriorPracticalTests: row.legacy.practicalTests,
            manualPriorInternalTests: row.legacy.internalTests,
          }),
        }).catch(() => {})
      }
      setRows(prev => prev.map((r, i) => i === index ? { ...r, importing: false, result: `✓ יובאו ${data.count} שיעורים` } : r))
    } catch {
      setRows(prev => prev.map((r, i) => i === index ? { ...r, importing: false, result: 'שגיאת רשת — נסה שוב' } : r))
    }
  }

  if (!students) return <p className="text-gray-400">טוען תלמידים...</p>

  return (
    <div dir="rtl" className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ייבוא היסטוריה מהפלטפורמה הקודמת</h1>
        <p className="text-sm text-gray-500 mt-1">
          כלי חד-פעמי לייבוא שיעורים מקבצי ה-PDF של אלפא דרייב. <strong className="text-red-600">בדקי טווח תאריכים לפני ייבוא</strong> — אם לתלמיד/ה כבר יש שיעורים אמיתיים במערכת החדשה בתאריכים חופפים, בטלי את הסימון שלהם כדי לא לכפול אותם.
        </p>
      </div>

      {rows.map((row, index) => {
        const legacyDates = row.legacy.lessons.map(l => l.date).sort()
        const legacyTotal = row.legacy.lessons.reduce((s, l) => s + l.lessons, 0)
        const selectedTotal = [...row.selected].reduce((s, i) => s + row.legacy.lessons[i].lessons, 0)
        return (
          <div key={row.legacy.name} className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div>
                <p className="font-bold text-gray-900">{row.legacy.name} <span className="text-gray-400 text-sm">({row.legacy.idNumber})</span></p>
                <p className="text-xs text-gray-500">
                  PDF: {legacyDates[0]} – {legacyDates[legacyDates.length - 1]} | {row.legacy.lessons.length} שורות | {legacyTotal} שיעורים
                  {(row.legacy.practicalTests > 0 || row.legacy.internalTests > 0) && (
                    <> | {row.legacy.practicalTests} מבחנים מעשיים, {row.legacy.internalTests} טסטים פנימיים</>
                  )}
                </p>
              </div>
              {!row.match && row.candidates.length === 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">לא נמצא תלמיד/ה תואם/ת</span>
              )}
              {!row.match && row.candidates.length > 1 && (
                <select onChange={e => selectMatch(index, e.target.value)} className="text-xs border rounded-lg px-2 py-1" defaultValue="">
                  <option value="" disabled>כמה התאמות — בחרי</option>
                  {row.candidates.map(c => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
                </select>
              )}
            </div>

            {row.match && (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">הותאם: {row.match.name}</span>
                  {!row.existingRange && !row.loading && (
                    <button onClick={() => loadExisting(index)} className="text-xs text-blue-600 hover:underline">
                      בדוק שיעורים קיימים במערכת
                    </button>
                  )}
                  {row.loading && <span className="text-xs text-gray-400">בודק...</span>}
                  {row.existingRange && (
                    <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
                      יש כבר {row.existingRange.count} שיעורים במערכת: {row.existingRange.min} – {row.existingRange.max}
                    </span>
                  )}
                  {row.alreadyImported > 0 && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                      ⚠ כבר יובאו {row.alreadyImported} רשומות היסטוריות לתלמיד/ה זה — בדקי שלא תיובא כפילות
                    </span>
                  )}
                </div>

                <div className="max-h-56 overflow-y-auto border rounded-lg divide-y mb-2">
                  {row.legacy.lessons.map((l, i) => (
                    <label key={i} className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={row.selected.has(i)} onChange={() => toggleRow(index, i)} className="w-4 h-4 accent-blue-600" />
                      <span className="text-gray-700">{l.date} {l.time} — {l.lessons} שיעורים{l.amount != null ? ` — ₪${l.amount}` : ''}</span>
                    </label>
                  ))}
                </div>

                {(row.legacy.practicalTests > 0 || row.legacy.internalTests > 0) && (
                  <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
                    <input type="checkbox" checked={row.importTests} onChange={e => setRows(prev => prev.map((r, i) => i === index ? { ...r, importTests: e.target.checked } : r))} className="w-4 h-4 accent-blue-600" />
                    ייבא גם ספירת מבחנים ({row.legacy.practicalTests} מעשיים, {row.legacy.internalTests} פנימיים) לכרטיס התלמיד
                  </label>
                )}

                <div className="flex items-center gap-3">
                  <button onClick={() => handleImport(index)} disabled={!row.checked || row.importing || row.selected.size === 0}
                    title={!row.checked ? 'יש לבדוק קודם שיעורים קיימים במערכת' : undefined}
                    className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                    {row.importing ? 'מייבא...' : `ייבא ${row.selected.size} שורות (${selectedTotal} שיעורים)`}
                  </button>
                  {!row.checked && <span className="text-xs text-amber-600">יש לבדוק שיעורים קיימים לפני הייבוא ⬆</span>}
                  {row.result && <span className="text-sm text-gray-600">{row.result}</span>}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
