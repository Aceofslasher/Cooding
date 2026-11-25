import { useRef, useState } from 'react'
import { Archive, ArrowDownToLine, BookOpen, CheckCircle2, Eye, FileUp, Loader2, Pencil, Save, Send, Sparkles, Trash2, X } from 'lucide-react'
import { parseLessonImport, validateLesson } from '../services/lessonLibrary'
import { generateLessonDraft } from '../services/lessonGenerator'

const blankLesson = {
  title: '',
  topic: '',
  level: 'Beginner',
  minutes: 10,
  language: 'javascript',
  description: '',
  objective: '',
  objectives: '',
  explanation: '',
  example: '',
  starterCode: '',
  expectedOutput: '',
  hint: '',
  hints: '',
  referenceUrl: '',
  quizQuestion: '',
  quizChoices: ['', '', ''],
  quizAnswer: 0,
  quizExplanation: '',
}

const blankGenerator = { topic: '', level: 'Beginner', language: 'javascript', minutes: 10, goals: '' }

function draftFromLesson(lesson) {
  return {
    title: lesson.title || '',
    topic: lesson.topic || '',
    level: lesson.level || 'Beginner',
    minutes: lesson.minutes || 10,
    language: lesson.language || 'javascript',
    description: lesson.description || '',
    objective: lesson.objective || '',
    objectives: Array.isArray(lesson.objectives) ? lesson.objectives.join('\n') : '',
    explanation: lesson.explanation || '',
    example: lesson.example || '',
    starterCode: lesson.starterCode || '',
    expectedOutput: lesson.expectedOutput || '',
    hint: lesson.hint || '',
    hints: Array.isArray(lesson.hints) ? lesson.hints.join('\n') : '',
    referenceUrl: lesson.referenceUrl || '',
    quizQuestion: lesson.quiz?.question || '',
    quizChoices: lesson.quiz?.choices?.length ? [...lesson.quiz.choices, '', '', ''].slice(0, 3) : ['', '', ''],
    quizAnswer: lesson.quiz?.answer ?? 0,
    quizExplanation: lesson.quiz?.explanation || '',
  }
}

function splitLines(value) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean)
}

function statusLabel(status) {
  if (status === 'draft') return 'Draft'
  if (status === 'archived') return 'Archived'
  return 'Published'
}

export default function LessonStudio({ lessons, allLessons, isSignedIn = false, onAddLessons, onSaveLesson, onDeleteLesson, onOpenLesson }) {
  const [draft, setDraft] = useState(blankLesson)
  const [editingId, setEditingId] = useState(null)
  const [preview, setPreview] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('ok')
  const [generator, setGenerator] = useState(blankGenerator)
  const [generating, setGenerating] = useState(false)
  const fileInput = useRef(null)

  function notify(text, tone = 'ok') {
    setMessage(text)
    setMessageTone(tone)
  }

  function updateField(event) {
    const { name, value } = event.target
    setDraft((current) => ({ ...current, [name]: name === 'minutes' ? Number(value) : value }))
  }

  function updateGenerator(event) {
    const { name, value } = event.target
    setGenerator((current) => ({ ...current, [name]: name === 'minutes' ? Number(value) : value }))
  }

  function updateChoice(index, value) {
    setDraft((current) => ({ ...current, quizChoices: current.quizChoices.map((choice, position) => (position === index ? value : choice)) }))
  }

  function resetForm() {
    setDraft(blankLesson)
    setEditingId(null)
    setPreview(false)
  }

  function buildLesson(status) {
    if (!editingId) {
      const id = `custom-${crypto.randomUUID()}`
      return validateLesson({ ...draftPayload(), id, status })
    }
    return validateLesson({ ...draftPayload(), id: editingId, status })
  }

  function draftPayload() {
    const choices = draft.quizChoices.map((choice) => choice.trim())
    const hasQuiz = Boolean(draft.quizQuestion.trim())
    let quiz = null
    if (hasQuiz) {
      if (choices.some((choice) => !choice)) throw new Error('Fill in all three answer choices, or clear the quiz question.')
      quiz = {
        question: draft.quizQuestion.trim(),
        choices,
        answer: Math.min(Math.max(draft.quizAnswer, 0), choices.length - 1),
        explanation: draft.quizExplanation.trim(),
      }
    }
    return {
      title: draft.title,
      topic: draft.topic,
      level: draft.level,
      minutes: draft.minutes,
      language: draft.language,
      description: draft.description,
      objective: draft.objective,
      objectives: splitLines(draft.objectives),
      explanation: draft.explanation,
      example: draft.example,
      starterCode: draft.starterCode,
      expectedOutput: draft.expectedOutput,
      hint: draft.hint,
      hints: splitLines(draft.hints),
      referenceUrl: draft.referenceUrl,
      quiz,
    }
  }

  function persist(status) {
    try {
      const lesson = buildLesson(status)
      if (!onSaveLesson(lesson)) return
      resetForm()
      notify(status === 'published' ? `Published "${lesson.title}" to your learning path.` : `Saved "${lesson.title}" as a draft. It is visible only in Lesson Studio.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save this lesson.', 'error')
    }
  }

  async function generate() {
    if (!generator.topic.trim()) {
      notify('Add a topic before generating a lesson.', 'error')
      return
    }
    setGenerating(true)
    notify('')
    const result = await generateLessonDraft({ ...generator, topic: generator.topic.trim() })
    setGenerating(false)
    if (!result.lesson) {
      notify(result.error || 'The lesson generator could not create a draft.', 'error')
      return
    }
    const lesson = result.lesson
    setEditingId(null)
    setPreview(false)
    setDraft({
      ...blankLesson,
      ...draftFromLesson(lesson),
      level: generator.level,
      language: generator.language,
      minutes: generator.minutes,
      topic: generator.topic.trim() || lesson.topic,
    })
    notify(result.mode === 'demo'
      ? 'Generated a demo draft locally. The hosted generator uses your signed-in AI session; review every field before publishing.'
      : 'Generated a draft. Review and edit the content, then publish it to your learning path.')
  }

  async function importFile(event) {
    const [file] = event.target.files || []
    if (!file) return
    try {
      if (file.size > 2_000_000) throw new Error('Import file must be 2 MB or smaller.')
      const imported = parseLessonImport(await file.text(), allLessons)
      if (!onAddLessons(imported)) return
      notify(`Imported ${imported.length} lesson${imported.length === 1 ? '' : 's'}.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not import lessons.', 'error')
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
    notify(`Exported ${lessons.length} lesson${lessons.length === 1 ? '' : 's'}.`)
  }

  function startEditing(lesson) {
    setDraft(draftFromLesson(lesson))
    setEditingId(lesson.id)
    setPreview(false)
    notify(`Editing "${lesson.title}". Publish or save a draft when you are ready.`)
  }

  function toggleArchive(lesson) {
    const nextStatus = lesson.status === 'archived' ? 'published' : 'archived'
    if (!onSaveLesson({ ...lesson, status: nextStatus })) return
    if (editingId === lesson.id && nextStatus === 'archived') resetForm()
    notify(nextStatus === 'archived'
      ? `Archived "${lesson.title}". It is hidden from the learning path but kept in Lesson Studio.`
      : `Restored "${lesson.title}" to the learning path.`)
  }

  const editingLesson = editingId ? lessons.find((lesson) => lesson.id === editingId) : null
  const quizHasContent = Boolean(draft.quizQuestion.trim())
  const publishedCount = lessons.filter((lesson) => (lesson.status || 'published') === 'published').length

  return (
    <div className="page-content lesson-studio-page">
      <PageIntro />
      <div className="lesson-studio-toolbar">
        <div>
          <strong>{lessons.length} custom lesson{lessons.length === 1 ? '' : 's'} · {publishedCount} published</strong>
          <span>Drafts stay private to Lesson Studio. Published lessons sync to Supabase and appear in your learning path.</span>
        </div>
        <div className="lesson-studio-actions">
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={importFile} />
          <button className="button button-secondary" type="button" onClick={() => fileInput.current?.click()}><FileUp size={14} />Import JSON</button>
          <button className="button button-secondary" type="button" onClick={exportLessons} disabled={!lessons.length}><ArrowDownToLine size={14} />Export JSON</button>
        </div>
      </div>

      <div className="lesson-studio-grid">
        <div className="lesson-studio-form">
          <section className="studio-generator">
            <div className="lesson-studio-section-title"><span className="lesson-studio-icon"><Sparkles size={16} /></span><div><h2>Generate with AI</h2><p>Describe the topic and the generator drafts every field for you to review.</p></div></div>
            <div className="studio-generator-grid">
              <label className="lesson-studio-field studio-generator-topic">Lesson topic<input name="topic" value={generator.topic} onChange={updateGenerator} placeholder="e.g. Sorting a list with for loops" maxLength={120} /></label>
              <label className="lesson-studio-field">Level<select name="level" value={generator.level} onChange={updateGenerator}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
              <label className="lesson-studio-field">Language<select name="language" value={generator.language} onChange={updateGenerator}><option value="javascript">JavaScript</option><option value="html">HTML</option></select></label>
              <label className="lesson-studio-field">Minutes<input name="minutes" type="number" min="1" max="120" value={generator.minutes} onChange={updateGenerator} /></label>
              <label className="lesson-studio-field studio-generator-goals">Extra goals (optional)<textarea name="goals" value={generator.goals} onChange={updateGenerator} rows="2" maxLength={600} placeholder="What should the learner be able to do afterwards?" /></label>
            </div>
            <div className="studio-generator-footer">
              <span>{isSignedIn ? 'Uses the hosted AI with your session. Keys stay on the server.' : 'In local development this creates a demo draft. Sign in for hosted AI generation.'}</span>
              <button className="button button-dark" type="button" onClick={generate} disabled={generating || !generator.topic.trim()}>{generating ? <Loader2 className="spin-icon" size={14} /> : <Sparkles size={14} />}{generating ? 'Generating' : 'Generate lesson'}</button>
            </div>
          </section>

          {preview ? <PreviewLesson draft={draft} /> : (
            <form className="studio-form" onSubmit={(event) => { event.preventDefault(); persist('published') }}>
              <div className="studio-form-head">
                <div><span className="eyebrow">{editingId ? 'EDITING LESSON' : 'NEW LESSON'}</span><h2>{editingId ? `Edit “${editingLesson?.title || draft.title || 'lesson'}”` : 'Create a lesson'}</h2></div>
                {editingId && <button className="icon-button" type="button" title="Stop editing" aria-label="Stop editing" onClick={resetForm}><X size={16} /></button>}
              </div>

              <section className="studio-section">
                <div className="studio-section-head"><span className="step-number">01</span><div><h3>Basic information</h3><p>How the lesson appears in the learning path.</p></div></div>
                <div className="lesson-studio-fields">
                  <label className="lesson-studio-field">Lesson title<input name="title" value={draft.title} onChange={updateField} maxLength={120} required /></label>
                  <label className="lesson-studio-field">Topic<input name="topic" value={draft.topic} onChange={updateField} maxLength={80} required /></label>
                  <label className="lesson-studio-field">Level<select name="level" value={draft.level} onChange={updateField}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
                  <label className="lesson-studio-field">Language<select name="language" value={draft.language} onChange={updateField}><option value="javascript">JavaScript</option><option value="html">HTML</option></select></label>
                  <label className="lesson-studio-field">Minutes<input name="minutes" type="number" min="1" max="120" value={draft.minutes} onChange={updateField} required /></label>
                  <label className="lesson-studio-field lesson-studio-wide">Short description<input name="description" value={draft.description} onChange={updateField} maxLength={240} required /></label>
                </div>
              </section>

              <section className="studio-section">
                <div className="studio-section-head"><span className="step-number">02</span><div><h3>Lesson content</h3><p>Explain the idea, show an example, and add a reference.</p></div></div>
                <div className="lesson-studio-fields">
                  <label className="lesson-studio-field lesson-studio-wide">Learning objective<input name="objective" value={draft.objective} onChange={updateField} maxLength={240} required /></label>
                  <label className="lesson-studio-field lesson-studio-wide">Objectives checklist<textarea name="objectives" value={draft.objectives} onChange={updateField} rows="3" maxLength={1200} placeholder="One objective per line (optional, up to 6)" /></label>
                  <label className="lesson-studio-field lesson-studio-wide">Explanation<textarea name="explanation" value={draft.explanation} onChange={updateField} rows="4" maxLength={5000} required /></label>
                  <label className="lesson-studio-field lesson-studio-wide">Example code<textarea name="example" value={draft.example} onChange={updateField} rows="4" maxLength={5000} required /></label>
                  <label className="lesson-studio-field lesson-studio-wide">Hint<textarea name="hint" value={draft.hint} onChange={updateField} rows="2" maxLength={5000} required /></label>
                  <label className="lesson-studio-field lesson-studio-wide">Reference URL (optional)<input name="referenceUrl" type="url" value={draft.referenceUrl} onChange={updateField} placeholder="https://www.w3schools.com/js/" /></label>
                </div>
              </section>

              <section className="studio-section">
                <div className="studio-section-head"><span className="step-number">03</span><div><h3>Coding activity</h3><p>Starter code, expected output, extra hints, and an optional knowledge check.</p></div></div>
                <div className="lesson-studio-fields">
                  <label className="lesson-studio-field lesson-studio-wide">Starter code<textarea name="starterCode" value={draft.starterCode} onChange={updateField} rows="4" maxLength={5000} required /></label>
                  <label className="lesson-studio-field lesson-studio-wide">Expected output<textarea name="expectedOutput" value={draft.expectedOutput} onChange={updateField} rows="2" maxLength={5000} required /></label>
                  <label className="lesson-studio-field lesson-studio-wide">Extra hints<textarea name="hints" value={draft.hints} onChange={updateField} rows="2" maxLength={2000} placeholder="One hint per line (optional, up to 5)" /></label>
                  <label className="lesson-studio-field lesson-studio-wide">Knowledge-check question (optional)<input name="quizQuestion" value={draft.quizQuestion} onChange={updateField} maxLength={500} placeholder="Leave blank for an exercise-only lesson" /></label>
                  {[0, 1, 2].map((index) => <label className="lesson-studio-field" key={index}>Choice {String.fromCharCode(65 + index)}<input value={draft.quizChoices[index]} onChange={(event) => updateChoice(index, event.target.value)} maxLength={200} /></label>)}
                  <label className="lesson-studio-field">Correct answer<select value={draft.quizAnswer} onChange={(event) => setDraft((current) => ({ ...current, quizAnswer: Number(event.target.value) }))} disabled={!quizHasContent}>{[0, 1, 2].map((index) => <option value={index} key={index}>Choice {String.fromCharCode(65 + index)}</option>)}</select></label>
                  <label className="lesson-studio-field lesson-studio-wide">Why the answer is correct<textarea value={draft.quizExplanation} onChange={(event) => setDraft((current) => ({ ...current, quizExplanation: event.target.value }))} rows="2" maxLength={500} placeholder="Shown after a learner answers (optional)" /></label>
                </div>
              </section>

              <section className="studio-section studio-publish">
                <div className="studio-section-head"><span className="step-number">04</span><div><h3>Publishing</h3><p>Preview first, then publish to the learning path or keep it as a private draft.</p></div></div>
                <div className="studio-publish-actions">
                  <button className="button button-secondary" type="button" onClick={() => setPreview(true)}><Eye size={14} />Preview</button>
                  <button className="button button-secondary" type="button" onClick={() => persist('draft')}><Save size={14} />Save draft</button>
                  <button className="button button-dark" type="submit"><Send size={14} />Publish lesson</button>
                </div>
                <p className="studio-publish-note">Published lessons sync to Supabase while you are signed in. Drafts and archived lessons are excluded from the learning path.</p>
              </section>

              <p className={`lesson-studio-message ${messageTone === 'error' ? 'lesson-studio-message-error' : ''}`} role="status" aria-live="polite">{message}</p>
            </form>
          )}

          {preview && <div className="studio-preview-actions">
            <button className="button button-secondary" type="button" onClick={() => setPreview(false)}><Pencil size={14} />Back to editing</button>
            <button className="button button-secondary" type="button" onClick={() => persist('draft')}><Save size={14} />Save draft</button>
            <button className="button button-dark" type="button" onClick={() => persist('published')}><Send size={14} />Publish lesson</button>
            <p className={`lesson-studio-message ${messageTone === 'error' ? 'lesson-studio-message-error' : ''}`} role="status" aria-live="polite">{message}</p>
          </div>}
        </div>

        <aside className="lesson-studio-list">
          <div className="lesson-studio-section-title"><span className="lesson-studio-icon"><BookOpen size={16} /></span><div><h2>Your lessons</h2><p>Published, draft, and archived lessons live here.</p></div></div>
          {lessons.length ? <div className="lesson-studio-items">{lessons.map((lesson) => {
            const status = lesson.status || 'published'
            return <article className="lesson-studio-item" key={lesson.id}>
              <button type="button" className="lesson-studio-item-main" onClick={() => startEditing(lesson)} title="Edit lesson">
                <span className="lesson-row-meta"><span>{lesson.topic}</span><i />{lesson.level}<i /><span className={`studio-status studio-status-${status}`}>{statusLabel(status)}</span></span>
                <strong>{lesson.title}</strong>
                <small>{lesson.description}</small>
              </button>
              <div className="lesson-studio-item-actions">
                {status === 'published' && <button type="button" className="icon-button" aria-label={`Open ${lesson.title}`} title="Open in learning path" onClick={() => onOpenLesson(lesson)}><Eye size={15} /></button>}
                <button type="button" className="icon-button" aria-label={status === 'archived' ? `Restore ${lesson.title}` : `Archive ${lesson.title}`} title={status === 'archived' ? 'Restore to learning path' : 'Archive lesson'} onClick={() => toggleArchive(lesson)}>{status === 'archived' ? <CheckCircle2 size={15} /> : <Archive size={15} />}</button>
                <button type="button" className="icon-button lesson-studio-delete" aria-label={`Remove ${lesson.title}`} title="Delete lesson" onClick={() => onDeleteLesson(lesson.id)}><Trash2 size={15} /></button>
              </div>
            </article>
          })}</div> : <div className="lesson-studio-empty">No custom lessons yet. Generate one with AI, fill in the form, or import a JSON file.</div>}
        </aside>
      </div>
    </div>
  )
}

function PreviewLesson({ draft }) {
  const quiz = draft.quizQuestion.trim() ? {
    question: draft.quizQuestion,
    choices: draft.quizChoices,
    answer: draft.quizAnswer,
    explanation: draft.quizExplanation,
  } : null
  return <article className="studio-preview">
    <div className="studio-preview-head"><span className="eyebrow">LESSON PREVIEW</span><span className="studio-status studio-status-draft">Not published</span></div>
    <div className="lesson-row-meta"><span>{draft.topic || 'Topic'}</span><i />{draft.level}<i />{draft.minutes} min<i />{draft.language === 'html' ? 'HTML' : 'JavaScript'}</div>
    <h1>{draft.title || 'Untitled lesson'}</h1>
    <p className="studio-preview-description">{draft.description || 'Add a short description so learners know what this lesson covers.'}</p>
    <div className="studio-preview-grid">
      <section><span className="eyebrow">OBJECTIVE</span><p>{draft.objective || '—'}</p>{splitLines(draft.objectives).length > 0 && <ul>{splitLines(draft.objectives).map((item) => <li key={item}>{item}</li>)}</ul>}</section>
      <section><span className="eyebrow">EXPLANATION</span><p>{draft.explanation || '—'}</p></section>
      <section><span className="eyebrow">EXAMPLE</span><pre>{draft.example || '—'}</pre></section>
      <section><span className="eyebrow">STARTER CODE</span><pre>{draft.starterCode || '—'}</pre></section>
      <section><span className="eyebrow">EXPECTED OUTPUT</span><pre>{draft.expectedOutput || '—'}</pre></section>
      <section><span className="eyebrow">HINTS</span><p>{draft.hint || '—'}</p>{splitLines(draft.hints).map((item) => <p key={item}>{item}</p>)}</section>
      {quiz && <section><span className="eyebrow">KNOWLEDGE CHECK</span><p>{quiz.question}</p><ol>{quiz.choices.filter(Boolean).map((choice, index) => <li key={`${choice}-${index}`} className={index === quiz.answer ? 'studio-preview-correct' : ''}>{choice}{index === quiz.answer ? ' ✓' : ''}</li>)}</ol>{quiz.explanation && <p>{quiz.explanation}</p>}</section>}
    </div>
  </article>
}

function PageIntro() {
  return <div className="page-intro"><div><div className="eyebrow">YOUR CUSTOM CONTENT</div><h1>Lesson studio</h1><p>Create, preview, publish, and archive lessons separately from the built-in learning path.</p></div></div>
}
