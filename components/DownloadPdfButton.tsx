'use client'
import { useState } from 'react'

const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
const MARGIN_MM = 12
const PX_PER_MM = 96 / 25.4 // standard 96 CSS px per inch
// Render as if the browser were this wide, so the PDF comes out the same
// — and this desktop-shaped table isn't cramped — whether the instructor
// downloads it from a phone or a desktop.
const CAPTURE_WIDTH_PX = 900
const RENDER_SCALE = 2 // resolution multiplier for crisp text, not a layout change

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

      const canvas = await html2canvas(el, {
        scale: RENDER_SCALE,
        backgroundColor: '#ffffff',
        windowWidth: CAPTURE_WIDTH_PX,
      })

      // Previously this stretched the capture to fill the full page width
      // regardless of its real size — on a narrow phone capture that blew
      // the font up hugely and cut it off mid-page. Scale from the capture's
      // true physical size instead, only shrinking (never enlarging) to fit
      // the printable area.
      const maxContentWidthMm = A4_WIDTH_MM - MARGIN_MM * 2
      const maxContentHeightMm = A4_HEIGHT_MM - MARGIN_MM * 2
      const naturalWidthMm = canvas.width / RENDER_SCALE / PX_PER_MM
      const fitScale = Math.min(1, maxContentWidthMm / naturalWidthMm)
      const mmPerPx = fitScale / PX_PER_MM / RENDER_SCALE

      const imgWidthMm = canvas.width * mmPerPx
      const x = (A4_WIDTH_MM - imgWidthMm) / 2
      const pageSlicePx = Math.floor(maxContentHeightMm / mmPerPx)

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      // Crop exact page-height slices out of the source canvas instead of
      // sliding one tall image behind the page's clip bounds — avoids any
      // slice bleeding into the next page's margin.
      let offsetPx = 0
      let firstPage = true
      while (offsetPx < canvas.height) {
        const sliceHeightPx = Math.min(pageSlicePx, canvas.height - offsetPx)
        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = canvas.width
        sliceCanvas.height = sliceHeightPx
        const ctx = sliceCanvas.getContext('2d')!
        ctx.drawImage(canvas, 0, offsetPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)

        if (!firstPage) pdf.addPage()
        pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', x, MARGIN_MM, imgWidthMm, sliceHeightPx * mmPerPx)

        offsetPx += sliceHeightPx
        firstPage = false
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
