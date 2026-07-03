const TIMELINE_DAY_COLORS = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#db2777',
  '#0891b2',
  '#65a30d',
  '#dc2626',
]

export function timelineDayColor(dayIndex: number): string {
  const normalizedIndex = Math.max(0, dayIndex)
  return TIMELINE_DAY_COLORS[normalizedIndex % TIMELINE_DAY_COLORS.length]
}
