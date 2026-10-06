'use client'
import { useState, useEffect, useCallback } from 'react'
import { INSTRUCTOR_NAME } from '@/lib/instructorInfo'

type Lesson = { studentName: string; time: string }
type Fuel = { id: string; liters: number; amount: number | null; note: string | null }
type Day = { date: string; odometerKm: number | null; lessons: Lesson[]; fuel: Fuel[] }

const MONTH_LABELS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function VehicleLogPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getUTCFullYear())
  const [month, setMonth] = useState(now.getUTCMonth() + 1) // 1-12
  const [licensePlate, setLicensePlate] = useState('')
  const [days, setDays] = useState<Day[] | null>(null)

  const [odoDate, setOdoDate] = useState(todayStr())
  const [odoKm, setOdoKm] = useState('')
  const [savingOdo, setSavingOdo] = useState(false)
  const [odoError, setOdoError] = useState('')

  const [fuelDate, setFuelDate] = useState(todayStr())
  const [fuelLiters, setFuelLiters] = useState('')
  const [fuelAmount, setFuelAmount] = useState('')
  const [fuelNote, setFuelNote] = useState('')
  const [savingFuel, setSavingFuel] = useState(false)
  const [fuelError, setFuelError] = useState('')
  const [deletingFuelId, setDeletingFuelId] = useState<string | null>(null)

  const monthStr = `${year}-${String(month).padStart(2, '0')}`

  const load = useCallback(async () => {
    const res = await fetch(`/api/instructor/vehicle-log?month=${monthStr}`)
    const data = await res.json()
    setLicensePlate(data.vehicle?.licensePlate ?? '')
    setDays(data.days ?? [])
  }, [monthStr])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    // Prefill today's odometer field once we know it, so re-opening the page
    // shows what's already logged rather than an empty input.
    const today = days?.find(d => d.date === todayStr())
    if (today?.odometerKm != null) setOdoKm(String(today.odometerKm))
  }, [days])

  function changeMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m < 1) { m = 12; y -= 1 }
    if (m > 12) { m = 1; y += 1 }
    setMonth(m); setYear(y)
  }

  async function saveOdometer() {
    const km = Number(odoKm)
    if (!Number.isFinite(km) || km < 0) { setOdoError('קריאת ק"מ לא תקינה'); return }
    setSavingOdo(true)
    setOdoError('')
    const res = await fetch('/api/instructor/vehicle-log/odometer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: odoDate, odometerKm: km }),
    })
    setSavingOdo(false)
    if (res.ok) {
      await load()
    } else {
      const d = await res.json().catch(() => ({}))
      setOdoError(d.error || 'שגיאה בשמירה')
    }
  }

  async function saveFuel() {
    if (!fuelLiters || Number(fuelLiters) <= 0) { setFuelError('יש להזין כמות דלק בליטרים'); return }
    setSavingFuel(true)
    setFuelError('')
    const res = await fetch('/api/instructor/vehicle-log/fuel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: fuelDate,
        liters: Number(fuelLiters),
        amount: fuelAmount === '' ? null : Number(fuelAmount),
        note: fuelNote,
      }),
    })
    setSavingFuel(false)
    if (res.ok) {
      setFuelLiters(''); setFuelAmount(''); setFuelNote('')
      await load()
    } else {
      const d = await res.json().catch(() => ({}))
      setFuelError(d.error || 'שגיאה בשמירה')
    }
  }

  async function deleteFuel(id: string) {
    setDeletingFuelId(id)
    const res = await fetch(`/api/instructor/vehicle-log/fuel/${id}`, { method: 'DELETE' })
    setDeletingFuelId(null)
    if (res.ok) await load()
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ספר הרכב</h1>
          <p className="text-sm text-gray-500 mt-1">
            {licensePlate && <>רכב מספר {licensePlate} · </>}
            לפי תוספת ז׳ להוראות ניהול פנקסי חשבונות
          </p>
        </div>
        <button onClick={() => window.print()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          🖨️ הדפסה / שמירה כ-PDF
        </button>
      </div>

      {/* Quick entry */}
      <div className="grid md:grid-cols-2 gap-4 mb-6 print:hidden">
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="font-bold text-gray-900 mb-3">קריאת ק&quot;מ יומית</h2>
          <div className="flex gap-2 items-end flex-wrap">
            <div>
              <label className="block text-xs text-gray-500 mb-1">תאריך</label>
              <input type="date" value={odoDate} onChange={e => setOdoDate(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">קריאת ק&quot;מ</label>
              <input type="number" min={0} value={odoKm} onChange={e => setOdoKm(e.target.value)}
                placeholder="120500"
                className="w-28 border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
            </div>
            <button onClick={saveOdometer} disabled={savingOdo}
              className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
              {savingOdo ? 'שומר...' : 'שמירה'}
            </button>
          </div>
          {odoError && <p className="text-xs text-red-600 mt-2">{odoError}</p>}
        </div>

        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="font-bold text-gray-900 mb-3">רישום תדלוק</h2>
          <div className="flex gap-2 items-end flex-wrap">
            <div>
              <label className="block text-xs text-gray-500 mb-1">תאריך</label>
              <input type="date" value={fuelDate} onChange={e => setFuelDate(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ליטרים</label>
              <input type="number" min={0} step={0.01} value={fuelLiters} onChange={e => setFuelLiters(e.target.value)}
                placeholder="40"
                className="w-20 border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">₪ (אופציונלי)</label>
              <input type="number" min={0} value={fuelAmount} onChange={e => setFuelAmount(e.target.value)}
                placeholder="300"
                className="w-20 border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
            </div>
            <button onClick={saveFuel} disabled={savingFuel}
              className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
              {savingFuel ? 'שומר...' : 'הוסף'}
            </button>
          </div>
          <input type="text" value={fuelNote} onChange={e => setFuelNote(e.target.value)}
            placeholder="הערה (אופציונלי)"
            className="w-full border rounded-lg px-2 py-1.5 text-sm mt-2 focus:ring-2 focus:ring-blue-400" />
          {fuelError && <p className="text-xs text-red-600 mt-2">{fuelError}</p>}
        </div>
      </div>

      {/* Month navigator */}
      <div className="flex items-center gap-3 mb-3 print:hidden">
        <button onClick={() => changeMonth(-1)} className="p-1.5 hover:bg-gray-100 rounded">&rarr;</button>
        <span className="font-medium text-gray-700">{MONTH_LABELS[month - 1]} {year}</span>
        <button onClick={() => changeMonth(1)} className="p-1.5 hover:bg-gray-100 rounded">&larr;</button>
      </div>

      {/* Log table */}
      <div className="bg-white rounded-xl shadow overflow-hidden print:shadow-none">
        <div className="px-4 py-2 border-b hidden print:block">
          <p className="font-bold">ספר הרכב — {licensePlate} — {MONTH_LABELS[month - 1]} {year}</p>
          <p className="text-xs text-gray-500">מורה: {INSTRUCTOR_NAME}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-right">
                <th className="px-4 py-2.5 font-medium text-gray-500">תאריך</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">קריאת ק&quot;מ</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">שיעורים</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 print:hidden">תדלוק</th>
              </tr>
            </thead>
            <tbody>
              {days === null ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">טוען...</td></tr>
              ) : days.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">אין פעילות רשומה בחודש זה</td></tr>
              ) : (
                days.map(d => (
                  <tr key={d.date} className="border-b border-gray-100 align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {new Date(d.date).toLocaleDateString('he-IL', { timeZone: 'UTC' })}
                    </td>
                    <td className="px-4 py-2.5">
                      {d.odometerKm != null ? `${d.odometerKm.toLocaleString('he-IL')} ק״מ` : <span className="text-amber-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {d.lessons.length === 0 ? '—' : (
                        <ul className="space-y-0.5">
                          {d.lessons.map((l, i) => (
                            <li key={i}>
                              {l.studentName} — {new Date(l.time).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-2.5 print:hidden">
                      {d.fuel.length === 0 ? '—' : (
                        <ul className="space-y-0.5">
                          {d.fuel.map(f => (
                            <li key={f.id} className="flex items-center gap-1.5">
                              <span>
                                {f.liters} ל׳{f.amount != null && ` · ₪${f.amount}`}{f.note && ` · ${f.note}`}
                              </span>
                              <button onClick={() => deleteFuel(f.id)} disabled={deletingFuelId === f.id}
                                className="text-xs text-gray-300 hover:text-red-600 transition disabled:opacity-50">
                                🗑
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
