'use client'
import { useState } from 'react'

export type BankTransferDetails = { bankNumber: string; branchNumber: string; accountNumber: string; transferRef: string }

export function formatBankTransferReference(d: BankTransferDetails) {
  return `בנק ${d.bankNumber} | סניף ${d.branchNumber} | חשבון ${d.accountNumber} | אסמכתא ${d.transferRef}`
}

// Mandatory bank-transfer details, collected in their own popup the moment
// "העברה בנקאית" is chosen as the payment method — joined into one string
// that's stored in the existing invoice reference field (no schema change).
export default function BankTransferModal({
  onConfirm, onCancel,
}: {
  onConfirm: (reference: string) => void
  onCancel: () => void
}) {
  const [bankNumber, setBankNumber] = useState('')
  const [branchNumber, setBranchNumber] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [transferRef, setTransferRef] = useState('')

  const complete = !!(bankNumber.trim() && branchNumber.trim() && accountNumber.trim() && transferRef.trim())

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl p-5 w-full max-w-sm" dir="rtl" onClick={e => e.stopPropagation()}>
        <p className="font-bold text-lg mb-3">פרטי העברה בנקאית</p>
        <div className="space-y-2 mb-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">מספר בנק *</label>
            <input type="text" value={bankNumber} onChange={e => setBankNumber(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">מספר סניף *</label>
            <input type="text" value={branchNumber} onChange={e => setBranchNumber(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">מספר חשבון *</label>
            <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">מספר אסמכתא של ההעברה *</label>
            <input type="text" value={transferRef} onChange={e => setTransferRef(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => complete && onConfirm(formatBankTransferReference({ bankNumber, branchNumber, accountNumber, transferRef }))}
            disabled={!complete}
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
