import { useId, useState, type FormEvent } from 'react'
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
  const textareaId = useId()
  const countId = useId()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void Promise.resolve(onSave(draft)).catch(() => undefined)
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={textareaId}>
          Day note for {dayDate}
        </label>
        <span id={countId}>{draft.length}/5000</span>
      </div>
      <textarea
        id={textareaId}
        className={styles.textarea}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={loading || saving || readOnly}
        readOnly={readOnly}
        maxLength={5000}
        aria-describedby={countId}
        placeholder="Log reservations, backup plans, reminders, or anything collaborators should know."
      />
      {!readOnly && (
        <button type="submit" className={styles.submitButton} disabled={loading || saving}>
          {saving ? 'Saving...' : 'Save note'}
        </button>
      )}
    </form>
  )
}
