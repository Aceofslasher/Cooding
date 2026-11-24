import { useRef, useState } from 'react'
import { ArrowDownToLine, BookOpen, FileUp, Plus, Trash2 } from 'lucide-react'
import { parseLessonImport, validateLesson } from '../services/lessonLibrary'

const blankLesson = {
  title: '',
  topic: '',
  level: 'Beginner',
  minutes: 10,
  language: 'javascript',
  description: '',
  objective: '',
  explanation: '',
  example: '',
  starterCode: '',
  expectedOutput: '',
  hint: '',
  referenceUrl: '',
}

export default function LessonStudio({ lessons, allLessons, onAddLessons, onDeleteLesson, onOpenLesson }) {
  const [draft, setDraft] = useState(blankLesson)
  const [message, setMessage] = useState('')
  const fileInput = useRef(null)

  function updateField(event) {
    const { name, value } = event.target
    setDraft((current) => ({ ...current, [name]: name === 'minutes' ? Number(value) : value }))
  }

  function addDraft(event) {
    event.preventDefault()
    try {
      const lesson = validateLesson(draft)
      if (!onAddLessons([lesson])) return
      setDraft(blankLesson)
      setMessage(`Added "${lesson.title}" to your learning path.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add this lesson.')
    }
  }

  async function importFile(event) {
    const [file] = event.target.files || []
    if (!file) return
    try {
      if (file.size > 2_000_000) throw new Error('Import file must be 2 MB or smaller.')
      const imported = parseLessonImport(await file.text(), allLessons)
      if (!onAddLessons(imported)) return
      setMessage(`Imported ${imported.length} lesson${imported.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not import lessons.')
    } finally {
      event.target.value = ''
    }
  }

  function exportLessons() {
    const blob = new Blob([JSON.stringify(lessons, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'loopwise-lessons.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    setMessage(`Exported ${lessons.length} lesson${lessons.length === 1 ? '' : 's'}.`)
  }

  return (
    <div className="page-content lesson-studio-page">
      <PageIntro />
      <div className="lesson-studio-toolbar">
        <div>
          <strong>{lessons.length} custom lesson{lessons.length === 1 ? '' : 's'}</strong>
          <span>Stored in this browser; export JSON to back them up or move them.</span>
        </div>
        <div className="lesson-studio-actions">
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={importFile} />
          <button className="button button-secondary" type="button" onClick={() => fileInput.current?.click()}><FileUp size={14} />Import JSON</button>
          <button className="button button-secondary" type="button" onClick={exportLessons} disabled={!lessons.length}><ArrowDownToLine size={14} />Export JSON</button>
        </div>
      </div>

      <div className="lesson-studio-grid">
        <form className="lesson-studio-form" onSubmit={addDraft}>
          <div className="lesson-studio-section-title"><span className="lesson-studio-icon"><Plus size={16} /></span><div><h2>Create a lesson</h2><p>Write your own explanation and exercise, or use W3Schools as a linked reference.</p></div></div>
          <div className="lesson-studio-fields">
            <label className="lesson-studio-field">Lesson title<input name="title" value={draft.title} onChange={updateField} maxLength={120} required /></label>
            <label className="lesson-studio-field">Topic<input name="topic" value={draft.topic} onChange={updateField} maxLength={80} required /></label>
            <label className="lesson-studio-field">Level<select name="level" value={draft.level} onChange={updateField}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
            <label className="lesson-studio-field">Minutes<input name="minutes" type="number" min="1" max="120" value={draft.minutes} onChange={updateField} required /></label>
            <label className="lesson-studio-field lesson-studio-wide">Short description<input name="description" value={draft.description} onChange={updateField} maxLength={240} required /></label>
            <label className="lesson-studio-field lesson-studio-wide">Learning objective<input name="objective" value={draft.objective} onChange={updateField} maxLength={240} required /></label>
            <label className="lesson-studio-field lesson-studio-wide">Explanation<textarea name="explanation" value={draft.explanation} onChange={updateField} rows="4" maxLength={5000} required /></label>
            <label className="lesson-studio-field lesson-studio-wide">Example code<textarea name="example" value={draft.example} onChange={updateField} rows="4" maxLength={5000} required /></label>
            <label className="lesson-studio-field lesson-studio-wide">Starter code<textarea name="starterCode" value={draft.starterCode} onChange={updateField} rows="4" maxLength={5000} required /></label>
            <label className="lesson-studio-field lesson-studio-wide">Expected output<textarea name="expectedOutput" value={draft.expectedOutput} onChange={updateField} rows="2" maxLength={5000} required /></label>
            <label className="lesson-studio-field lesson-studio-wide">Hint<textarea name="hint" value={draft.hint} onChange={updateField} rows="2" maxLength={5000} required /></label>
            <label className="lesson-studio-field lesson-studio-wide">Reference URL (optional)<input name="referenceUrl" type="url" value={draft.referenceUrl} onChange={updateField} placeholder="https://www.w3schools.com/js/" /></label>
          </div>
          <div className="lesson-studio-form-footer"><span>JavaScript lessons · Maximum 5,000 characters per text field</span><button className="button button-dark" type="submit"><Plus size={14} />Add to learning path</button></div>
        </form>

        <aside className="lesson-studio-list">
          <div className="lesson-studio-section-title"><span className="lesson-studio-icon"><BookOpen size={16} /></span><div><h2>Your added lessons</h2><p>These are separate from the built-in course.</p></div></div>
          {lessons.length ? <div className="lesson-studio-items">{lessons.map((lesson) => (
            <article className="lesson-studio-item" key={lesson.id}>
              <button type="button" className="lesson-studio-item-main" onClick={() => onOpenLesson(lesson)}>
                <span className="lesson-row-meta"><span>{lesson.topic}</span><i />{lesson.level}</span>
                <strong>{lesson.title}</strong>
                <small>{lesson.description}</small>
              </button>
              <button type="button" className="icon-button lesson-studio-delete" aria-label={`Remove ${lesson.title}`} title="Remove lesson" onClick={() => onDeleteLesson(lesson.id)}><Trash2 size={15} /></button>
            </article>
          ))}</div> : <div className="lesson-studio-empty">No custom lessons yet. Add one with the form or import a JSON file.</div>}
        </aside>
      </div>
      <p className="lesson-studio-message" role="status" aria-live="polite">{message}</p>
    </div>
  )
}

function PageIntro() {
  return <div className="page-intro"><div><div className="eyebrow">YOUR CUSTOM CONTENT</div><h1>Lesson studio</h1><p>Create, import, and manage lessons separately from the built-in learning path.</p></div></div>
}
