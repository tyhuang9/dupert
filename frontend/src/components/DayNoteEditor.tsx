import { useState, type FormEvent } from 'react'
import type { DayNote } from '../types/activity'
import styles from './DayNoteEditor.module.css'

interface DayNoteEditorProps {
  dayDate: string
  note: DayNote | undefined
  loading: boolean
  readOnly?: boolean
  saving: boolean
  onSave: (note: string) => Promise<void> | void
}

export function DayNoteEditor({
  dayDate,
  note,
  loading,
  readOnly = false,
  saving,
  onSave,
}: DayNoteEditorProps) {
  const [draft, setDraft] = useState(note?.note ?? '')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void Promise.resolve(onSave(draft)).catch(() => undefined)
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.label}>
        Day note for {dayDate}
        <textarea
          className={styles.textarea}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={loading || saving || readOnly}
          readOnly={readOnly}
          maxLength={5000}
        />
      </label>
      {!readOnly && (
        <button type="submit" className={styles.submitButton} disabled={loading || saving}>
          {saving ? 'Saving...' : 'Save note'}
        </button>
      )}
    </form>
  )
}
