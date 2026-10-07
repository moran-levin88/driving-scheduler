'use client'
import { useState } from 'react'

export default function DownloadPdfButton({ targetId, fileName }: { targetId: string; fileName: string }) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const el = document.getElementById(targetId)
      if (!el) return

      // html2canvas-pro, not plain html2canvas — Tailwind v4's default
      // palette renders as oklch(), which the unmaintained plain package
      // can't parse at all and fails on.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ])

      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/png')

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pageWidth
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      // Standard jsPDF multi-page slicing: redraw the same full-height image
      // on each page, shifted up by one page's worth each time — jsPDF clips
      // to the page bounds, so each call reveals just that page's slice.
      let heightLeft = imgHeight
      let position = 0
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
      while (heightLeft > 0) {
        position -= pageHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      pdf.save(fileName)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button onClick={handleDownload} disabled={loading}
      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
      {loading ? 'מכין PDF...' : '⬇️ הורדת PDF'}
    </button>
  )
}
