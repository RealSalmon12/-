import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.js'

// PDF 첫 장을 작은 그림으로. 한 번 그린 건 이 기기에 저장해 두고 다시 안 받음
const CACHE = 'pdfthumb:'
const WIDTH = 160 // 목록 칸(64px)의 고해상도 화면용

const readCache = (key) => { try { return localStorage.getItem(CACHE + key) } catch { return null } }
const writeCache = (key, url) => { try { localStorage.setItem(CACHE + key, url) } catch { /* 저장 공간이 차면 그냥 넘어감 */ } }

// 한 번에 둘씩만 그림 (목록이 길어도 휴대폰이 버벅이지 않게)
let running = 0
const waiting = []
function queue(job) {
  return new Promise((resolve, reject) => {
    const start = () => {
      running++
      job().then(resolve, reject).finally(() => {
        running--
        waiting.shift()?.()
      })
    }
    running < 2 ? start() : waiting.push(start)
  })
}

let pdfjs = null
async function loadPdfjs() {
  if (!pdfjs) {
    const [lib, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    ])
    lib.GlobalWorkerOptions.workerSrc = worker.default
    pdfjs = lib
  }
  return pdfjs
}

async function render(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300)
  if (error) throw error
  const lib = await loadPdfjs()
  // 한글 글꼴이 안 들어 있는 PDF(학교 통신문에 많음)도 글자가 보이게 글꼴 지도를 받음
  const cdn = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${lib.version}/`
  const doc = await lib.getDocument({
    url: data.signedUrl,
    disableAutoFetch: true,
    cMapUrl: `${cdn}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${cdn}standard_fonts/`
  }).promise
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: WIDTH / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    return canvas.toDataURL('image/jpeg', 0.72)
  } finally {
    doc.destroy()
  }
}

export default function PdfThumb({ bucket, path }) {
  const ref = useRef(null)
  const [src, setSrc] = useState(() => readCache(path))

  useEffect(() => {
    if (src || !ref.current) return
    let cancelled = false
    // 화면에 보일 때만 그림
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      io.disconnect()
      queue(() => render(bucket, path))
        .then((url) => {
          writeCache(path, url)
          if (!cancelled) setSrc(url)
        })
        .catch(() => { /* 못 그리면 PDF 글자 그대로 둠 */ })
    }, { rootMargin: '200px' })
    io.observe(ref.current)
    return () => { cancelled = true; io.disconnect() }
  }, [bucket, path, src])

  return src
    ? <img src={src} alt="" />
    : <span ref={ref} className="sheet-ext">PDF</span>
}
