// 수행평가를 휴대폰 캘린더에 넣을 수 있는 .ics 파일로 만들어 내려받게 함
const esc = (s) => String(s ?? '').replace(/[\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n')
const ymd = (iso) => iso.replaceAll('-', '')
const nextDay = (iso) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function downloadIcs(assessments, filename = '수행평가.ics') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const events = assessments.map((a) => [
    'BEGIN:VEVENT',
    `UID:${a.id}@class-organizer`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(a.due_date)}`,
    `DTEND;VALUE=DATE:${ymd(nextDay(a.due_date))}`,
    `SUMMARY:${esc(`[${a.subject}] ${a.title}`)}`,
    `DESCRIPTION:${esc([a.kind, a.content, a.materials && `준비물: ${a.materials}`].filter(Boolean).join('\n'))}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`내일 ${a.subject} 수행평가`)}`, 'END:VALARM',
    'END:VEVENT'
  ].join('\r\n'))
  const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//학급정리기//KO', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
