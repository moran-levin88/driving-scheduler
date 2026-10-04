'use client'
import { useState } from 'react'

// A single mandatory "אסמכתא" (confirmation number) popup — used for Bit/
// PayBox payments, same pattern as BankTransferModal.
export default function ReferenceModal({
  title, onConfirm, onCancel,
}: {
  title: string
  onConfirm: (reference: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const complete = !!value.trim()

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl p-5 w-full max-w-sm" dir="rtl" onClick={e => e.stopPropagation()}>
        <p className="font-bold text-lg mb-3">{title}</p>
        <div className="mb-3">
          <label className="block text-xs text-gray-600 mb-1">מספר אסמכתא *</label>
          <input type="text" value={value} onChange={e => setValue(e.target.value)} autoFocus
            className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => complete && onConfirm(value.trim())} disabled={!complete}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition">
            אישור
          </button>
          <button onClick={onCancel} className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50 transition">
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
