const TIMELINE_DAY_COLORS = [
  '#3F5F53',
  '#6E8193',
  '#D2A75A',
  '#6FA97B',
  '#8A7562',
  '#789184',
  '#A68C68',
  '#C86B6B',
]

export function timelineDayColor(dayIndex: number): string {
  const normalizedIndex = Math.max(0, dayIndex)
  return TIMELINE_DAY_COLORS[normalizedIndex % TIMELINE_DAY_COLORS.length]
}
