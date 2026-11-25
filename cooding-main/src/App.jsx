import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Award,
  Bell, BookOpen, Braces, Bug, Camera, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Code2, Copy, Download, Eye, EyeOff, FileCode2, FileText, Flame, FolderOpen, Globe, GraduationCap,
  History, KeyRound, LayoutDashboard, Lightbulb, ListChecks, LockKeyhole, Maximize2, Minimize2,
  Menu, MessageCircle, Moon, Pencil, Play, Plus, RefreshCw, RotateCcw, Save, Search, Send, Settings,
  ShieldCheck, Sparkles, Target, Terminal, Trash2, Upload, UserRound, X,
} from 'lucide-react'
import { emptyProgress, lessonQuizzes, lessons, practiceExercises, readProgress } from './data/learningContent'
import LessonStudio from './components/LessonStudio'
import { askTutor } from './services/tutorService'
import { isCloudConfigured, supabase } from './services/supabase'
import { loadCloudProgress, saveCloudAttempt, saveCloudLessonProgress, saveCloudProfile, saveCloudQuizAttempt } from './services/progressService'
import { loadTutorHistory, saveTutorMessage, startTutorConversation } from './services/tutorHistory'
import { deletePlaygroundProject, listPlaygroundProjects, loadPlaygroundProject, savePlaygroundProject } from './services/playgroundService'
import { deleteSharedCustomLesson, loadSharedCustomLessons, publishCustomLessons } from './services/customLessonService'
import { readCustomLessons, saveCustomLessons } from './services/lessonLibrary'
import { countCorrectedAttempts } from './utils/progress'
import { evaluateTestCases, passedAllTests } from './utils/evaluation'
import { mergeErrorHistory } from './utils/attempts.js'
import { deriveSkillLevel, skillLevelPlan } from './utils/skill'
import { PLAYGROUND_AI_NOTE, playgroundFilePayload, resolvePlaygroundFile, splitAssistantReply } from './utils/playground'
import { createPlaygroundFile, deletePlaygroundFile, duplicatePlaygroundFile, normalizePlaygroundFiles, parsePlayground, playgroundNameTaken, playgroundStorageKey, renamePlaygroundFile, sanitizeFileName, serializePlayground, updatePlaygroundFile } from './utils/playgroundFiles'
import { buildZip, zipFileName } from './utils/zip'
import { buildPersonalization, formatDuration } from './utils/personalization'
import { parseInline, parseTutorLines, parseTutorMarkdown, runnableTutorLanguage } from './utils/tutorMarkdown'
import { buildPrerequisiteMap, buildTopicMastery, recentActivity, recentCompletions, recommendNextLesson, summarizeMistakes } from './utils/insights'
import { lessonActivityState, lessonsReadyToComplete } from './utils/activities.js'
import { STREAK_GOAL, recordStreakCompletion, summarizeStreak } from './utils/streak'
import './App.css'

const navigation = [
  { section: 'LEARN', items: [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'learn', label: 'Learning path', icon: BookOpen },
    { id: 'lesson-studio', label: 'Lesson studio', icon: Plus },
    { id: 'practice', label: 'Practice', icon: ListChecks },
  ] },
  { section: 'WORKSPACE', items: [
    { id: 'playground', label: 'Playground', icon: Braces },
    { id: 'tutor', label: 'AI tutor', icon: MessageCircle },
  ] },
  { section: 'YOUR SPACE', items: [
    { id: 'progress', label: 'My progress', icon: Activity },
    { id: 'mistakes', label: 'Mistake history', icon: Bug },
    { id: 'history', label: 'Learning history', icon: History },
  ] },
]

const pageTitles = {
  dashboard: 'Overview', learn: 'Learning path', 'lesson-studio': 'Lesson studio', practice: 'Practice',
  playground: 'Playground', tutor: 'AI tutor', progress: 'My progress',
  mistakes: 'Mistake history', history: 'Learning history', settings: 'Profile & settings', lesson: 'Lesson workspace',
}

const sandboxWorkerSource = `self.onmessage = ({ data }) => {
  const lines = []
  let outputLength = 0
  const safeConsole = {
    log: (...values) => {
      if (lines.length >= 100 || outputLength >= 8000) return
      const line = values.map((value) => {
        if (typeof value === 'string') return value
        if (value && typeof value === 'object') return Array.isArray(value) ? '[Array]' : '[Object]'
        return String(value)
      }).join(' ')
      const boundedLine = line.slice(0, 8000 - outputLength)
      lines.push(boundedLine)
      outputLength += boundedLine.length
    },
  }
  self.fetch = undefined
  self.XMLHttpRequest = undefined
  self.WebSocket = undefined
  self.EventSource = undefined
  self.Worker = undefined
  self.importScripts = undefined
  try {
    new Function('console', data.source)(safeConsole)
    self.postMessage({ output: lines.join('\\n'), executionStatus: 'success' })
  } catch (error) {
    self.postMessage({
      output: lines.join('\\n'),
      error: error?.stack || String(error),
      executionStatus: error?.name === 'SyntaxError' ? 'compile_error' : 'runtime_error',
    })
  }
}`

function Button({ children, variant = 'secondary', className = '', ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>
}


function App() {
  const [progress, setProgress] = useState(readProgress)
  const [customLessons, setCustomLessons] = useState(() => {
    try {
      return readCustomLessons()
    } catch {
      return []
    }
  })
  const [sharedLessons, setSharedLessons] = useState([])
  const [page, setPage] = useState('dashboard')
  const [currentLesson, setCurrentLesson] = useState(lessons[0])
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(localStorage.getItem('codementor-theme') === 'dark')
  const [toast, setToast] = useState('')
  const [authUser, setAuthUser] = useState(null)
  const [currentCode, setCurrentCode] = useState('')
  const [practiceFocus, setPracticeFocus] = useState(null)
  const [playgroundSeed, setPlaygroundSeed] = useState(null)
  const [tutorPrefill, setTutorPrefill] = useState(null)
  const [cloudLoading, setCloudLoading] = useState(false)
  const tutorConversationRef = useRef(null)
  const tutorConversationPromise = useRef(null)
  const savedMessageIds = useRef(new Set())
  const tutorLanguage = currentLesson?.language === 'html' ? 'html' : 'javascript'
  const localCustomIds = new Set(customLessons.map((lesson) => lesson.id))
  const builtInIds = new Set(lessons.map((lesson) => lesson.id))
  const communityLessons = sharedLessons.filter((lesson) => !localCustomIds.has(lesson.id) && !builtInIds.has(lesson.id))
  const activeCustomLessons = customLessons.filter((lesson) => (lesson.status || 'published') === 'published')
  const allLessons = [...lessons, ...activeCustomLessons, ...communityLessons]
  const builtInCompleted = progress.lessonsCompleted.filter((id) => builtInIds.has(id)).length
  const progressView = { ...progress, skillLevel: deriveSkillLevel(builtInCompleted, lessons.length) }

  useEffect(() => {
    try {
      readCustomLessons()
    } catch (error) {
      setToast(error instanceof Error ? `Could not load custom lessons: ${error.message}` : 'Could not load custom lessons')
    }
  }, [])

  useEffect(() => {
    if (!authUser) return
    localStorage.setItem('codementor-progress', JSON.stringify(progress))
  }, [authUser, progress])

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    const applySession = (session) => {
      const user = session?.user ?? null
      setAuthUser(user)
      if (!user) {
        setProgress(emptyProgress)
        localStorage.removeItem('codementor-progress')
      }
    }
    supabase.auth.getSession().then(({ data }) => {
      if (active) applySession(data.session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!authUser) {
      setCloudLoading(false)
      return undefined
    }
    let active = true
    setCloudLoading(true)
    loadCloudProgress(authUser.id).then((cloudProgress) => {
      if (!active) return
      const customIds = new Set(customLessons.map((lesson) => lesson.id))
      setProgress((previous) => ({
        ...previous,
        ...cloudProgress,
        lessonsStarted: [...new Set([...(cloudProgress.lessonsStarted || []), ...previous.lessonsStarted.filter((id) => customIds.has(id))])],
        lessonsCompleted: [...new Set([...(cloudProgress.lessonsCompleted || []), ...previous.lessonsCompleted.filter((id) => customIds.has(id))])],
        lessonStartedAt: { ...previous.lessonStartedAt, ...cloudProgress.lessonStartedAt },
        lessonCompletedAt: { ...previous.lessonCompletedAt, ...cloudProgress.lessonCompletedAt },
        lessonTimeSpent: { ...previous.lessonTimeSpent, ...cloudProgress.lessonTimeSpent },
        errorHistory: cloudProgress.errorHistory || [],
        attempts: [...(cloudProgress.attempts || []), ...previous.attempts.filter((attempt) => customIds.has(attempt.lessonId))],
      }))
    }).catch((error) => {
      if (active) setToast(error instanceof Error ? `Could not load cloud progress: ${error.message}` : 'Could not load cloud progress')
    }).finally(() => {
      if (active) setCloudLoading(false)
    })
    return () => { active = false }
  }, [authUser, customLessons])

  useEffect(() => {
    const ready = lessonsReadyToComplete(progress, allLessons, lessonQuizzes)
    if (!ready.length) return
    setProgress((previous) => {
      const completedIds = new Set(previous.lessonsCompleted)
      const additions = ready.filter((lesson) => !completedIds.has(lesson.id))
      if (!additions.length) return previous
      const lessonCompletedAt = { ...previous.lessonCompletedAt }
      for (const lesson of additions) {
        const passedAt = (previous.attempts || []).find((attempt) => attempt.passed && !attempt.exerciseId && attempt.lessonId === lesson.id)?.createdAt
        lessonCompletedAt[lesson.id] = lessonCompletedAt[lesson.id] || passedAt || new Date().toISOString()
      }
      return { ...previous, lessonsCompleted: [...previous.lessonsCompleted, ...additions.map((lesson) => lesson.id)], lessonCompletedAt }
    })
    if (authUser) {
      for (const lesson of ready) {
        if (!lesson.isCustom) saveCloudLessonProgress(authUser.id, lesson.id, 'completed').catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, authUser, allLessons])

  useEffect(() => {
    if (!authUser) {
      tutorConversationRef.current = null
      tutorConversationPromise.current = null
      savedMessageIds.current = new Set()
      return
    }
    let active = true
    loadTutorHistory(authUser.id).then(({ conversationId, messages }) => {
      if (!active) return
      tutorConversationRef.current = conversationId
      savedMessageIds.current = new Set(messages.map((message) => message.id))
      setProgress((previous) => {
        const known = new Set(messages.map((message) => message.id))
        const localOnly = (previous.messages || []).filter((message) => !known.has(message.id))
        const merged = [...messages, ...localOnly].sort((first, second) => new Date(first.createdAt || 0) - new Date(second.createdAt || 0))
        return { ...previous, messages: merged }
      })
    }).catch((error) => setToast(error instanceof Error ? `Could not load tutor history: ${error.message}` : 'Could not load tutor history'))
    return () => { active = false }
  }, [authUser])

  useEffect(() => {
    if (!authUser) {
      setSharedLessons([])
      return undefined
    }
    let active = true
    loadSharedCustomLessons()
      .then((rows) => { if (active) setSharedLessons(rows) })
      .catch(() => {})
    return () => { active = false }
  }, [authUser])

  useEffect(() => {
    if (!authUser || !customLessons.length) return
    const authorName = progress.displayName || authUser.email?.split('@')[0] || 'Learner'
    publishCustomLessons(customLessons, authUser.id, authorName)
      .then(() => loadSharedCustomLessons())
      .then((rows) => setSharedLessons(rows))
      .catch(() => setToast('Custom lessons saved locally; sharing them failed'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, customLessons])

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    localStorage.setItem('codementor-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  function openLesson(lesson) {
    if (authUser && !lesson.isCustom) saveCloudLessonProgress(authUser.id, lesson.id, 'started').catch(() => setToast('Could not sync lesson progress'))
    setProgress((previous) => ({
      ...previous,
      lessonsStarted: previous.lessonsStarted.includes(lesson.id) ? previous.lessonsStarted : [...previous.lessonsStarted, lesson.id],
      lessonStartedAt: { ...previous.lessonStartedAt, [lesson.id]: previous.lessonStartedAt?.[lesson.id] || new Date().toISOString() },
    }))
    setCurrentLesson(lesson)
    setPage('lesson')
    setMobileNavOpen(false)
  }

  function recordAttempt(attempt) {
    const savedAttempt = { ...attempt, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    setProgress((previous) => ({
      ...previous,
      attempts: [savedAttempt, ...previous.attempts],
      errorHistory: mergeErrorHistory(previous.errorHistory || [], savedAttempt),
    }))
    if (authUser) saveCloudAttempt(authUser.id, savedAttempt).catch((error) => setToast(error instanceof Error ? `Attempt saved locally, but cloud sync failed: ${error.message}` : 'Attempt saved locally, but cloud sync failed'))
  }

  function completeLesson(lesson, durationSeconds = 0) {
    const completedAt = new Date().toISOString()
    const extraSeconds = Math.max(0, Math.round(durationSeconds))
    if (authUser) {
      setProgress((previous) => ({ ...previous, streak: recordStreakCompletion(previous.streak, new Date(), lesson.id) }))
    }
    setProgress((previous) => ({
      ...previous,
      lessonsCompleted: previous.lessonsCompleted.includes(lesson.id)
        ? previous.lessonsCompleted
        : [...previous.lessonsCompleted, lesson.id],
      lessonCompletedAt: { ...previous.lessonCompletedAt, [lesson.id]: previous.lessonCompletedAt?.[lesson.id] || completedAt },
      lessonTimeSpent: extraSeconds
        ? { ...previous.lessonTimeSpent, [lesson.id]: (previous.lessonTimeSpent?.[lesson.id] || 0) + extraSeconds }
        : previous.lessonTimeSpent,
    }))
    if (authUser && !lesson.isCustom) saveCloudLessonProgress(authUser.id, lesson.id, 'completed', extraSeconds).catch((error) => setToast(error instanceof Error ? `Lesson completed locally, but cloud sync failed: ${error.message}` : 'Lesson completed locally, but cloud sync failed'))
    setToast('Lesson marked complete')
  }

  function recordQuiz(quizAttempt) {
    const savedAttempt = { ...quizAttempt, id: crypto.randomUUID(), completedAt: new Date().toISOString() }
    setProgress((previous) => ({ ...previous, quizAttempts: [savedAttempt, ...previous.quizAttempts] }))
    if (authUser) saveCloudQuizAttempt(authUser.id, savedAttempt).catch(() => setToast('Quiz saved locally, but cloud sync failed'))
  }

  function ensureTutorConversation(userId) {
    if (tutorConversationRef.current) return Promise.resolve(tutorConversationRef.current)
    if (!tutorConversationPromise.current) {
      tutorConversationPromise.current = startTutorConversation(userId)
        .then((conversationId) => {
          tutorConversationRef.current = conversationId
          return conversationId
        })
        .finally(() => { tutorConversationPromise.current = null })
    }
    return tutorConversationPromise.current
  }

  function persistTutorMessage(message) {
    const userId = authUser?.id
    if (!userId) return
    ensureTutorConversation(userId)
      .then((conversationId) => (conversationId ? saveTutorMessage(userId, conversationId, message) : null))
      .catch((error) => {
        savedMessageIds.current.delete(message.id)
        setToast(error instanceof Error ? `Tutor message not saved: ${error.message}` : 'Tutor message not saved')
      })
  }

  function updateTutorMessages(messages) {
    setProgress((previous) => ({ ...previous, messages }))
    if (!authUser) return
    for (const message of messages) {
      if (savedMessageIds.current.has(message.id) || message.mode === 'error') continue
      savedMessageIds.current.add(message.id)
      persistTutorMessage(message)
    }
  }

  function newTutorConversation() {
    setProgress((previous) => ({ ...previous, messages: [] }))
    tutorConversationRef.current = null
    if (!authUser) return
    startTutorConversation(authUser.id)
      .then((conversationId) => { tutorConversationRef.current = conversationId })
      .catch((error) => setToast(error instanceof Error ? `Could not start a new conversation: ${error.message}` : 'Could not start a new conversation'))
  }

  function changePage(nextPage) {
    setPage(nextPage)
    setMobileNavOpen(false)
  }

  function addCustomLessons(additions) {
    const updatedLessons = [...customLessons, ...additions]
    try {
      saveCustomLessons(updatedLessons)
      setCustomLessons(updatedLessons)
      return true
    } catch (error) {
      setToast(error instanceof Error ? `Could not save lessons: ${error.message}` : 'Could not save lessons')
      return false
    }
  }

  function saveCustomLesson(lesson) {
    const exists = customLessons.some((item) => item.id === lesson.id)
    const updatedLessons = exists
      ? customLessons.map((item) => (item.id === lesson.id ? lesson : item))
      : [lesson, ...customLessons]
    try {
      saveCustomLessons(updatedLessons)
      setCustomLessons(updatedLessons)
      setSharedLessons((previous) => previous.filter((item) => item.id !== lesson.id))
      return true
    } catch (error) {
      setToast(error instanceof Error ? `Could not save lesson: ${error.message}` : 'Could not save lesson')
      return false
    }
  }

  function deleteCustomLesson(lessonId) {
    const updatedLessons = customLessons.filter((lesson) => lesson.id !== lessonId)
    try {
      saveCustomLessons(updatedLessons)
      setCustomLessons(updatedLessons)
      setSharedLessons((previous) => previous.filter((lesson) => lesson.id !== lessonId))
      if (authUser) deleteSharedCustomLesson(lessonId).catch(() => {})
      setProgress((previous) => ({
        ...previous,
        lessonsStarted: previous.lessonsStarted.filter((id) => id !== lessonId),
        lessonsCompleted: previous.lessonsCompleted.filter((id) => id !== lessonId),
        attempts: previous.attempts.filter((attempt) => attempt.lessonId !== lessonId),
        quizAttempts: previous.quizAttempts.filter((attempt) => attempt.lessonId !== lessonId),
      }))
    } catch (error) {
      setToast(error instanceof Error ? `Could not remove lesson: ${error.message}` : 'Could not remove lesson')
    }
  }

  const activeTitle = pageTitles[page] || 'Overview'

  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><Code2 size={20} strokeWidth={2.2} /></div>
          <span className="brand-name">loop<span>wise</span></span>
          <button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.section}>
              <p className="nav-section-label">{group.section}</p>
              {group.items.map(({ id, label, icon: Icon }) => (
                <button key={id} className={`nav-link ${page === id ? 'nav-link-active' : ''}`} onClick={() => changePage(id)}>
                  <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
                  {id === 'tutor' && <span className="nav-new-dot" />}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <StreakCard progress={progress} authUser={authUser} onOpenSettings={() => changePage('settings')} />
          <button className={`nav-link ${page === 'settings' ? 'nav-link-active' : ''}`} onClick={() => changePage('settings')}><Settings size={17} /><span>Profile & settings</span></button>
          {authUser && <button className="nav-link signout-link" onClick={() => supabase.auth.signOut().then(() => setToast('Signed out. Progress is only saved while signed in.'))}><LockKeyhole size={16} /><span>Sign out</span></button>}
          <button className="profile-row" onClick={() => changePage('settings')}>
            <span className="avatar">{progress.avatar ? <img src={progress.avatar} alt="" /> : (progress.displayName || 'L').slice(0, 1).toUpperCase()}</span>
            <span className="profile-copy"><strong>{progress.displayName || 'Learner'}</strong><small>{progressView.skillLevel} learner</small></span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-leading">
            <button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></button>
            <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{activeTitle}</strong></div>
          </div>
          <div className="topbar-actions">
            <span className={`storage-badge ${authUser ? 'storage-cloud' : ''}`}><span />{authUser ? 'Cloud sync active' : isCloudConfigured ? 'Sign in for cloud sync' : 'Saved on this device'}</span>
            <button className="icon-button theme-button" aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Sparkles size={17} /> : <Moon size={17} />}</button>
            <button className="help-button" onClick={() => changePage('tutor')}><CircleHelp size={16} /><span>Help</span></button>
          </div>
        </header>

        {page === 'dashboard' && <Dashboard progress={progressView} lessons={allLessons} loading={cloudLoading} onOpenLesson={openLesson} onNavigate={changePage} onPracticeExercise={(exerciseId) => { setPracticeFocus(exerciseId); changePage('practice') }} />}
        {page === 'learn' && <LearningPath progress={progress} lessons={allLessons} authUser={authUser} onOpenLesson={openLesson} />}
        {page === 'lesson-studio' && <LessonStudio lessons={customLessons} allLessons={allLessons} isSignedIn={Boolean(authUser)} onAddLessons={addCustomLessons} onSaveLesson={saveCustomLesson} onDeleteLesson={deleteCustomLesson} onOpenLesson={openLesson} />}
        {page === 'lesson' && <LessonWorkspace key={currentLesson.id} lesson={currentLesson} lessons={allLessons} progress={progressView} authUser={authUser} onCodeChange={setCurrentCode} onComplete={completeLesson} onRecordAttempt={recordAttempt} onRecordQuiz={recordQuiz} onBack={() => changePage('learn')} onPrevious={() => openLesson(allLessons[Math.max(0, allLessons.findIndex((lesson) => lesson.id === currentLesson.id) - 1)])} onNext={() => openLesson(allLessons[(allLessons.findIndex((lesson) => lesson.id === currentLesson.id) + 1) % allLessons.length])} onOpenPrerequisite={openLesson} />}
        {page === 'playground' && <Playground onCodeChange={setCurrentCode} isSignedIn={Boolean(authUser)} authUser={authUser} skillLevel={progressView.skillLevel} seed={playgroundSeed} onSeedHandled={() => setPlaygroundSeed(null)} onNotify={setToast} />}
        {page === 'practice' && <Practice progress={progressView} authUser={authUser} onRecordAttempt={recordAttempt} focusExerciseId={practiceFocus} onFocusHandled={() => setPracticeFocus(null)} />}
        {page === 'tutor' && <TutorPage progress={progressView} currentCode={currentCode} currentLesson={currentLesson} tutorLanguage={tutorLanguage} isSignedIn={Boolean(authUser)} prefill={tutorPrefill} onPrefillHandled={() => setTutorPrefill(null)} onSendToPlayground={(block) => { setPlaygroundSeed({ ...block, id: crypto.randomUUID() }); changePage('playground') }} onMessagesChange={updateTutorMessages} onNewConversation={newTutorConversation} />}
        {page === 'progress' && <ProgressPage progress={progressView} lessons={allLessons} loading={cloudLoading} />}
        {page === 'mistakes' && <MistakeHistoryPage progress={progressView} lessons={allLessons} loading={cloudLoading} onOpenLesson={openLesson} onNavigate={changePage} onPracticeExercise={(exerciseId) => { setPracticeFocus(exerciseId); changePage('practice') }} onAskTutor={(row) => { setTutorPrefill({ id: crypto.randomUUID(), text: `Help me understand this ${String(row.errorType || 'error').replaceAll('_', ' ')} in ${row.topic || 'my code'}: ${row.errorMessage || 'my attempt did not pass'}. What is the smallest fix?`, mode: 'debugging', code: row.codeExcerpt || '' }); changePage('tutor') }} />}
        {page === 'history' && <HistoryPage progress={progress} lessons={allLessons} loading={cloudLoading} />}
        {page === 'settings' && <SettingsPage progress={progressView} authUser={authUser} onSignOut={() => supabase?.auth.signOut()} onSave={(updates) => { setProgress((previous) => ({ ...previous, ...updates })); if (authUser) saveCloudProfile(authUser.id, updates).catch((error) => setToast(error instanceof Error ? `Profile saved locally, but cloud sync failed: ${error.message}` : 'Profile saved locally, but cloud sync failed')); setToast('Profile preferences saved') }} />}
      </main>
      {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  )
}

function PageIntro({ eyebrow, title, description, action }) {
  return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function Dashboard({ progress, lessons, loading = false, onOpenLesson, onNavigate, onPracticeExercise }) {
  const builtInLessons = lessons.filter((lesson) => !lesson.isCustom)
  const builtInIds = new Set(builtInLessons.map((lesson) => lesson.id))
  const completed = progress.lessonsCompleted.filter((id) => builtInIds.has(id)).length
  const attempted = progress.attempts.length
  const passed = progress.attempts.filter((attempt) => attempt.passed).length
  const recommendation = recommendNextLesson(progress, builtInLessons)
  const nextLesson = recommendation?.lesson || lessons[0]
  const personal = buildPersonalization(progress, { lessons: builtInLessons, exercises: practiceExercises })
  const courses = courseCatalog.map((course) => {
    const courseLessons = builtInLessons.filter((lesson) => lesson.language === course.id)
    const done = courseLessons.filter((lesson) => progress.lessonsCompleted.includes(lesson.id)).length
    return { ...course, completed: done, total: courseLessons.length, percent: courseLessons.length ? Math.round((done / courseLessons.length) * 100) : 0 }
  })
  const recentLessons = recentCompletions(progress, builtInLessons, 3)
  const recentAttempts = progress.attempts.slice(0, 3)
  const activity = recentActivity(progress, 7)
  const activityMax = Math.max(1, ...activity.map((day) => day.count))
  const weekTotal = activity.reduce((total, day) => total + day.count, 0)
  const weekLessons = activity.reduce((total, day) => total + day.lessons, 0)
  const mistakes = summarizeMistakes(progress.errorHistory || [])
  const overallPercent = builtInLessons.length ? Math.round((completed / builtInLessons.length) * 100) : 0
  const trendLabel = personal.improvement.trend === 'improving' ? 'Improving' : personal.improvement.trend === 'slipping' ? 'Needs review' : personal.improvement.trend === 'steady' ? 'Steady' : '—'

  return <div className="page-content dashboard-page">
    <PageIntro eyebrow="YOUR LEARNING SPACE" title={`Good to see you, ${progress.displayName || 'Learner'}.`} description="A little practice today goes a long way." action={<Button variant="dark" onClick={() => onNavigate('playground')}><Code2 size={16} />Open playground</Button>} />
    <div className="dashboard-grid">
      <section className="welcome-panel">
        <div className="welcome-copy"><span className="welcome-kicker"><span className="welcome-dot" />CONTINUE LEARNING</span><h2>Small steps.<br />Real understanding.</h2><p>{recommendation?.reason || 'Learn a concept, try it yourself, and get a nudge when you need one.'}</p><Button variant="white" onClick={() => onOpenLesson(nextLesson)}>Continue learning<ArrowRight size={16} /></Button></div>
        <div className="welcome-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><Code2 size={32} /></div><span className="orbit-chip orbit-chip-a">{ }</span><span className="orbit-chip orbit-chip-b">&lt;/&gt;</span><span className="orbit-chip orbit-chip-c">{overallPercent}%</span></div>
        <div className="welcome-foot"><span>UP NEXT</span><strong>{nextLesson.title}</strong><span className="welcome-duration"><Clock3 size={13} />{nextLesson.minutes} min</span></div>
      </section>
      <section className="metric-panel">
        <div className="panel-heading"><div><span className="eyebrow">YOUR MOMENTUM</span><h2>Learning snapshot</h2></div><button className="text-link" onClick={() => onNavigate('progress')}>View progress<ArrowUpRight size={14} /></button></div>
        <div className="metric-grid">
          <Metric label="Lessons completed" value={completed} icon={BookOpen} detail={`${progress.lessonsStarted?.length ?? 0} started · ${overallPercent}% of path`} />
          <Metric label="Exercises passed" value={`${personal.exercisesPassed}/${practiceExercises.length}`} icon={ListChecks} detail={attempted ? `${attempted} tried · ${personal.passRate === null ? '—' : `${Math.round(personal.passRate * 100)}% pass rate`}` : 'Your attempts show here'} />
          <Metric label="Average score" value={personal.avgScore === null ? '—' : `${personal.avgScore}%`} icon={Award} detail={`${passed} passed attempt${passed === 1 ? '' : 's'} so far`} compact />
          <Metric label="Practice time" value={formatDuration(personal.totalSeconds)} icon={Clock3} detail={`${formatDuration(personal.practiceSeconds)} coding · ${formatDuration(personal.lessonSeconds)} lessons`} compact />
          <Metric label="Current level" value={progress.skillLevel} icon={Target} detail="Unlocks as you complete lessons" compact />
          <Metric label="Latest quiz" value={progress.quizAttempts.length ? `${progress.quizAttempts[0].score}/${progress.quizAttempts[0].totalQuestions}` : '—'} icon={GraduationCap} detail={progress.quizAttempts.length ? 'Most recent knowledge check' : 'No checks completed'} compact />
        </div>
        <div className="course-progress-list">{courses.map((course) => <div className="course-progress-row" key={course.id}><div className="course-progress-label"><span>{course.name}</span><strong>{course.completed}/{course.total} · {course.percent}%</strong></div><div className="progress-track"><span style={{ width: `${course.percent}%` }} /></div></div>)}</div>
        <span className="snapshot-footnote">{loading ? 'Syncing your cloud progress…' : `${completed} of ${builtInLessons.length} learning path lessons completed · ${personal.improvement.label.toLowerCase()}`}</span>
      </section>
      <section className="next-panel">
        <div className="panel-heading"><div><span className="eyebrow">{progress.lessonStartedAt?.[nextLesson.id] ? 'PICK UP WHERE YOU LEFT OFF' : 'RECOMMENDED FOR YOU'}</span><h2>Recommended next</h2></div><span className="recommendation-icon"><ArrowDownRight size={17} /></span></div>
        <div className="recommendation-body"><div className="recommendation-number">{String(builtInLessons.findIndex((lesson) => lesson.id === nextLesson.id) + 1).padStart(2, '0')}</div><div><span className="lesson-tag">{nextLesson.topic}</span><h3>{nextLesson.title}</h3><p>{recommendation?.reason || nextLesson.description}</p></div></div>
        <div className="recommendation-footer"><span><Clock3 size={14} />{nextLesson.minutes} min <i /> {nextLesson.level}</span><Button onClick={() => onOpenLesson(nextLesson)}>{progress.lessonStartedAt?.[nextLesson.id] ? 'Resume lesson' : 'Start lesson'}<ArrowRight size={15} /></Button></div>
      </section>
      <section className="next-panel dashboard-practice">
        <div className="panel-heading"><div><span className="eyebrow">PERSONALIZED PRACTICE</span><h2>Practice next</h2></div><span className="recommendation-icon"><Target size={17} /></span></div>
        {personal.recommendations.length ? <div className="dashboard-practice-list">{personal.recommendations.map(({ exercise, reason }) => <button type="button" key={exercise.id} className="dashboard-practice-row" onClick={() => onPracticeExercise(exercise.id)}><span className="lesson-tag">{exercise.topic}</span><span className="dashboard-practice-copy"><strong>{exercise.title}</strong><small>{reason}</small></span><span className="practice-recommend-open">Open<ArrowRight size={13} /></span></button>)}</div> : <div className="empty-inline"><div className="empty-glyph"><CheckCircle2 size={18} /></div><div><strong>Every practice exercise is passed</strong><span>Try a new lesson, or revisit an exercise to keep it fresh.</span></div></div>}
      </section>
      <section className="recent-panel">
        <div className="panel-heading"><div><span className="eyebrow">WINS</span><h2>Recently completed</h2></div><button className="text-link" onClick={() => onNavigate('learn')}>Open path<ArrowUpRight size={14} /></button></div>
        {recentLessons.length ? <div className="recent-list">{recentLessons.map((lesson) => <button className="recent-row recent-row-button" key={lesson.id} onClick={() => onOpenLesson(lesson)}><span className="attempt-status attempt-passed"><Check size={14} /></span><div className="recent-copy"><strong>{lesson.title}</strong><span>{lesson.topic} · {progress.lessonCompletedAt?.[lesson.id] ? new Date(progress.lessonCompletedAt[lesson.id]).toLocaleDateString() : lesson.level}</span></div><span className="result-label result-good">Done</span></button>)}</div> : <div className="empty-inline"><div className="empty-glyph"><CheckCircle2 size={18} /></div><div><strong>No lessons finished yet</strong><span>Complete a lesson and it will show up here.</span></div></div>}
      </section>
      <section className="recent-panel">
        <div className="panel-heading"><div><span className="eyebrow">YOUR WORK</span><h2>Recent attempts</h2></div><button className="text-link" onClick={() => onNavigate('history')}>View history<ArrowUpRight size={14} /></button></div>
        {recentAttempts.length ? <div className="recent-list">{recentAttempts.map((attempt) => <div className="recent-row" key={attempt.id}><span className={`attempt-status ${attempt.passed ? 'attempt-passed' : 'attempt-review'}`}>{attempt.passed ? <Check size={14} /> : <RotateCcw size={14} />}</span><div className="recent-copy"><strong>{attempt.title}</strong><span>{attempt.topic || 'Practice'} · {new Date(attempt.createdAt).toLocaleDateString()}</span></div><span className={`result-label ${attempt.passed ? 'result-good' : 'result-retry'}`}>{attempt.passed ? 'Passed' : 'Review'}</span></div>)}</div> : <div className="empty-inline"><div className="empty-glyph"><Terminal size={18} /></div><div><strong>Your first attempt starts here</strong><span>Write a little code and your learning history will grow here.</span></div></div>}
      </section>
      <section className="dashboard-activity">
        <div className="panel-heading"><div><span className="eyebrow">THIS WEEK</span><h2>Daily learning activity</h2></div><button className="text-link" onClick={() => onNavigate('mistakes')}>Review mistakes<ArrowUpRight size={14} /></button></div>
        <div className="activity-body">
          <div className="activity-bars">{activity.map((day) => <div className="activity-bar" key={day.key}><div className="activity-bar-track"><span className={day.count ? 'activity-bar-filled' : ''} style={{ height: `${day.count ? Math.max(12, (day.count / activityMax) * 100) : 4}%` }} /></div><strong>{day.count}</strong><small>{day.label}</small></div>)}</div>
          <div className="activity-summary"><div><strong>{weekTotal}</strong><span>activities this week</span></div><div><strong>{weekLessons}</strong><span>lessons completed</span></div><div><strong>{mistakes.unresolved}</strong><span>mistakes to revisit</span></div><div><strong className={`trend-value trend-${personal.improvement.trend}`}>{trendLabel}</strong><span>recent pass-rate trend</span></div></div>
        </div>
      </section>
    </div>
  </div>
}

function Metric({ label, value, icon: Icon, detail, compact = false }) {
  return <div className="metric"><div className="metric-top"><span>{label}</span><Icon size={16} /></div><strong className={compact ? 'metric-compact-value' : ''}>{value}</strong><small>{detail}</small></div>
}

function StreakCard({ progress, authUser, onOpenSettings }) {
  const streak = summarizeStreak(progress.streak)
  const broken = Boolean(progress.streak?.lastDay) && !streak.count
  const label = `${streak.count} day${streak.count === 1 ? '' : 's'} streak`
  let detail
  if (!authUser) detail = 'Sign in and finish 3 lessons a day to keep your streak.'
  else if (streak.goalMetToday) detail = "Today's goal is done. Come back tomorrow to keep it alive."
  else if (broken) detail = 'Your streak broke. Finish 3 lessons today to start again.'
  else detail = `${streak.todayCount} of ${STREAK_GOAL} lessons today · ${streak.remaining} more to keep it going`
  return <div className={`streak-card ${broken ? 'streak-card-broken' : ''}`}>
    <div className="streak-card-head"><span className="streak-flame"><Flame size={17} /></span><div><strong>{label}</strong><span>{authUser ? 'Daily goal · 3 lessons' : 'Not signed in'}</span></div></div>
    <div className="streak-dots" aria-hidden="true">{[0, 1, 2].map((index) => <i key={index} className={index < streak.todayCount ? 'streak-dot-done' : ''} />)}</div>
    <p>{detail}</p>
    {!authUser && <button className="streak-signin" onClick={onOpenSettings}>Sign in to start</button>}
  </div>
}

const courseCatalog = [
  {
    id: 'javascript',
    name: 'JavaScript',
    title: 'JavaScript, from the ground up',
    description: 'Learn to read, write, and reason about code through short explanations and hands-on practice.',
    icon: Braces,
  },
  {
    id: 'html',
    name: 'HTML',
    title: 'HTML, from the ground up',
    description: 'Build real pages with headings, links, lists, forms, and semantic structure. Every lesson links to W3Schools.',
    icon: FileCode2,
  },
]

function LearningPath({ progress, lessons, authUser, onOpenLesson }) {
  const [language, setLanguage] = useState('All languages')
  const [level, setLevel] = useState('All levels')
  const [topic, setTopic] = useState('All topics')
  const [status, setStatus] = useState('All statuses')
  const [query, setQuery] = useState('')
  const [showAllMastery, setShowAllMastery] = useState(false)
  const builtInLessons = lessons.filter((lesson) => !lesson.isCustom)
  const prerequisites = buildPrerequisiteMap(builtInLessons)
  const myCustomLessons = lessons.filter((lesson) => lesson.isCustom && !lesson.ownerId)
  const sharedLessons = lessons.filter((lesson) => lesson.isCustom && lesson.ownerId)
  const search = query.trim().toLowerCase()
  const matchesFilters = (lesson) => {
    if (!(language === 'Custom lessons' || language === 'All languages' || lesson.language === language.toLowerCase())) return false
    if (!(level === 'All levels' || lesson.level === level)) return false
    if (!(topic === 'All topics' || lesson.topic === topic)) return false
    const done = progress.lessonsCompleted.includes(lesson.id)
    const started = progress.lessonsStarted?.includes(lesson.id)
    if (status === 'Completed' && !done) return false
    if (status === 'In progress' && (!started || done)) return false
    if (status === 'Not started' && (started || done)) return false
    if (search && !`${lesson.title} ${lesson.topic} ${lesson.description}`.toLowerCase().includes(search)) return false
    return true
  }
  const customOnly = language === 'Custom lessons'
  const visibleCourses = customOnly ? [] : courseCatalog.filter((course) => language === 'All languages' || language.toLowerCase() === course.id)
  const courses = visibleCourses.map((course) => {
    const courseLessons = builtInLessons.filter((lesson) => lesson.language === course.id)
    const groups = ['Beginner', 'Intermediate', 'Advanced']
      .filter((lessonLevel) => level === 'All levels' || lessonLevel === level)
      .map((lessonLevel) => ({ level: lessonLevel, lessons: courseLessons.filter((lesson) => lesson.level === lessonLevel && matchesFilters(lesson)) }))
      .filter((group) => group.lessons.length)
    return { ...course, lessons: courseLessons, completed: courseLessons.filter((lesson) => progress.lessonsCompleted.includes(lesson.id)).length, groups }
  })
  const visibleCustom = myCustomLessons.filter(matchesFilters)
  const visibleShared = sharedLessons.filter(matchesFilters)
  const visibleCount = courses.reduce((total, course) => total + course.lessons.filter(matchesFilters).length, 0) + visibleCustom.length + visibleShared.length
  const totalBuiltIn = builtInLessons.length
  const topicOptions = [...new Set(lessons.map((lesson) => lesson.topic).filter(Boolean))].sort((first, second) => first.localeCompare(second))
  const mastery = buildTopicMastery(progress, builtInLessons)
    .filter((entry) => entry.status !== 'Not Started')
    .filter((entry) => language === 'All languages' || entry.language === language.toLowerCase())
  const visibleMastery = showAllMastery ? mastery : mastery.slice(0, 8)
  const filtersActive = language !== 'All languages' || level !== 'All levels' || topic !== 'All topics' || status !== 'All statuses' || Boolean(query.trim())
  return <div className="page-content">
    <PageIntro eyebrow="THE CURRICULUM" title="Learning path" description={`${totalBuiltIn} built-in lessons across JavaScript and HTML, plus your own custom and shared lessons.`} action={<div className="learning-count"><BookOpen size={15} />{progress.lessonsCompleted.length} / {lessons.length} complete</div>} />
    <div className="filter-row filter-row-path">
      <label className="search-wrap"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, topic, or goal" aria-label="Search lessons" /></label>
      <div className="filter-controls">
        <label className="select-wrap"><span className="sr-only">Programming language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option>All languages</option><option value="javascript">JavaScript</option><option value="html">HTML</option><option>Custom lessons</option></select><ChevronDown size={14} /></label>
        <label className="select-wrap"><span className="sr-only">Difficulty</span><select value={level} onChange={(event) => setLevel(event.target.value)}><option>All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select><ChevronDown size={14} /></label>
        <label className="select-wrap"><span className="sr-only">Topic</span><select value={topic} onChange={(event) => setTopic(event.target.value)}><option>All topics</option>{topicOptions.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label>
        <label className="select-wrap"><span className="sr-only">Completion status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>All statuses</option><option>Not started</option><option>In progress</option><option>Completed</option></select><ChevronDown size={14} /></label>
        {filtersActive && <button className="filter-clear" type="button" onClick={() => { setLanguage('All languages'); setLevel('All levels'); setTopic('All topics'); setStatus('All statuses'); setQuery('') }}>Clear</button>}
      </div>
    </div>
    {!customOnly && visibleMastery.length > 0 && <section className="mastery-panel">
      <div className="panel-heading"><div><span className="eyebrow">PERSONALIZED PATH</span><h2>Topic mastery</h2></div><span className="topics-caption">From completed activities and results</span></div>
      <div className="mastery-strip">{visibleMastery.map((entry) => <button type="button" key={entry.topic} className={`mastery-chip mastery-${entry.status.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setTopic(topic === entry.topic ? 'All topics' : entry.topic)} title={`Filter lessons about ${entry.topic}`}><span className="mastery-topic">{entry.topic}</span><strong>{entry.status}</strong><small>{entry.completed}/{entry.lessons || '—'} lessons · {entry.passed}/{entry.attempts} attempts{entry.unresolved ? ` · ${entry.unresolved} open` : ''}</small></button>)}</div>
      {mastery.length > 8 && <button type="button" className="text-link mastery-more" onClick={() => setShowAllMastery((value) => !value)}>{showAllMastery ? 'Show less' : `Show all ${mastery.length} active topics`}<ChevronDown size={13} /></button>}
    </section>}
    {courses.map((course) => {
      const CourseIcon = course.icon
      const percent = course.lessons.length ? Math.round((course.completed / course.lessons.length) * 100) : 0
      return <div className="course-block" key={course.id}>
        <section className="course-overview"><div className="course-symbol"><CourseIcon size={22} /></div><div className="course-summary"><div><span className="course-label">{course.lessons.length} BUILT-IN LESSONS · {course.name.toUpperCase()}</span><h2>{course.title}</h2><p>{course.description}</p></div><div className="course-progress-wrap"><div className="course-progress-label"><span>Your progress</span><strong>{course.completed}/{course.lessons.length}</strong></div><div className="progress-track"><span style={{ width: `${percent}%` }} /></div></div></div></section>
        {course.groups.map((group) => {
          const groupDone = group.lessons.filter((lesson) => progress.lessonsCompleted.includes(lesson.id)).length
          return <section key={`${course.id}-${group.level}`} className="lesson-level-group"><div className="lesson-list-heading"><h2>{group.level}</h2><span>{groupDone} of {group.lessons.length} complete</span></div><LessonRows lessons={group.lessons} progress={progress} onOpenLesson={onOpenLesson} prerequisites={prerequisites} /></section>
        })}
        {!course.groups.length && <div className="empty-inline empty-inline-course"><BookOpen size={18} /><div><strong>No {course.name} lessons match these filters</strong><span>Try clearing the search or status filter.</span></div></div>}
      </div>
    })}
    {visibleCustom.length > 0 && <section className="lesson-level-group custom-lesson-group"><div className="lesson-list-heading"><h2>Your custom lessons</h2><span>{visibleCustom.length} lessons</span></div><LessonRows lessons={visibleCustom} progress={progress} onOpenLesson={onOpenLesson} /></section>}
    {visibleShared.length > 0 && <section className="lesson-level-group custom-lesson-group"><div className="lesson-list-heading"><h2>Shared custom lessons</h2><span>{visibleShared.length} lessons</span></div><LessonRows lessons={visibleShared} progress={progress} onOpenLesson={onOpenLesson} showAuthor authUserId={authUser?.id} /></section>}
    {!visibleCount && <div className="empty-state"><BookOpen size={22} /><strong>No lessons match these filters</strong><span>Try another level, topic, or search term.</span></div>}
  </div>
}

function LessonRows({ lessons, progress, onOpenLesson, showAuthor = false, authUserId, prerequisites }) {
  return <div className="lesson-list">{lessons.map((lesson, index) => {
    const done = progress.lessonsCompleted.includes(lesson.id)
    const started = progress.lessonsStarted?.includes(lesson.id)
    const authorLabel = showAuthor ? (lesson.ownerId && lesson.ownerId === authUserId ? 'Shared by you' : `Shared by ${lesson.author || 'a learner'}`) : ''
    const prerequisite = prerequisites?.get(lesson.id)
    const prerequisiteOpen = prerequisite && !done && !progress.lessonsCompleted.includes(prerequisite.id)
    return <button key={lesson.id} className="lesson-row" onClick={() => onOpenLesson(lesson)}><span className={`lesson-index ${done ? 'lesson-index-done' : ''}`}>{done ? <Check size={16} /> : String(index + 1).padStart(2, '0')}</span><span className="lesson-row-copy"><span className="lesson-row-meta"><span>{lesson.topic}</span><i />{lesson.level}{authorLabel && <><i />{authorLabel}</>}{prerequisiteOpen && <><i /><span className="prereq-tag" title={`This lesson builds on ${prerequisite.title}`}>After {prerequisite.title}</span></>}</span><strong>{lesson.title}</strong><small>{lesson.description}</small></span><span className="lesson-row-time"><Clock3 size={14} />{lesson.minutes} min</span><span className={`lesson-row-status ${done ? 'status-complete' : ''}`}>{done ? 'Completed' : started ? 'In progress' : 'Start'}<ArrowRight size={15} /></span></button>
  })}</div>
}

function LessonWorkspace({ lesson, lessons, progress, authUser, onCodeChange, onComplete, onRecordAttempt, onRecordQuiz, onBack, onPrevious, onNext, onOpenPrerequisite }) {
  const [showExample, setShowExample] = useState(false)
  const completionRequested = useRef(false)
  const openedAt = useRef(Date.now())
  const quiz = lessonQuizzes[lesson.id] || lesson.quiz || null
  const activities = lessonActivityState(progress, lesson, quiz)
  const complete = activities.complete
  const courseLessons = lessons.filter((item) => !item.isCustom && item.language === lesson.language)
  const courseIndex = courseLessons.findIndex((item) => item.id === lesson.id)
  const prerequisite = courseIndex > 0 ? courseLessons[courseIndex - 1] : null
  const prerequisiteOpen = Boolean(prerequisite && !progress.lessonsCompleted.includes(prerequisite.id))
  const referenceUrl = lesson.referenceUrl || (lesson.language === 'html' ? 'https://www.w3schools.com/html/' : 'https://www.w3schools.com/js/')
  useEffect(() => {
    if (complete || !activities.ready || completionRequested.current) return
    completionRequested.current = true
    onComplete(lesson, Math.max(1, Math.round((Date.now() - openedAt.current) / 1000)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities.ready, complete, lesson.id])
  const nextStep = complete
    ? 'This lesson is saved to your learning record.'
    : activities.ready
      ? 'Saving your completion...'
      : activities.exercisePassed
        ? 'Pass the knowledge check to complete this lesson.'
        : activities.quizPassed && quiz
          ? 'Finish the coding exercise to complete this lesson.'
          : quiz
            ? 'Pass the exercise and the knowledge check to complete this lesson.'
            : 'Pass the coding exercise to complete this lesson.'
  return <div className="page-content workspace-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15} />Back to learning path</button>
    <div className="workspace-heading"><div><div className="lesson-row-meta"><span>{lesson.topic}</span><i />{lesson.level}<i /><Clock3 size={13} />{lesson.minutes} min</div><h1>{lesson.title}</h1><p>{lesson.description}</p></div><span className={`lesson-state ${complete ? 'lesson-state-done' : ''}`}>{complete ? <CheckCircle2 size={15} /> : <BookOpen size={15} />}{complete ? 'Completed' : 'In progress'}</span></div>
    {prerequisiteOpen && <div className="prereq-banner"><span className="prereq-icon"><LockKeyhole size={15} /></span><div><strong>This lesson builds on “{prerequisite.title}”</strong><span>Finish the earlier lesson first for the smoothest ride, or continue if you feel ready.</span></div><button className="text-link" onClick={() => onOpenPrerequisite(prerequisite)}>Open prerequisite<ArrowRight size={14} /></button></div>}
    <section className={`activity-panel ${complete ? 'activity-panel-done' : activities.ready ? 'activity-panel-ready' : ''}`}>
      <div className="activity-panel-copy"><span className="eyebrow">COMPLETION CHECKLIST</span><strong>{complete ? 'Lesson completed' : `${activities.done} of ${activities.required} required activities done`}</strong></div>
      <div className="activity-items">
        <span className={`activity-item ${activities.exercisePassed ? 'activity-done' : ''}`}><span className="activity-check">{activities.exercisePassed ? <Check size={13} /> : null}</span>Coding exercise output</span>
        {quiz && <span className={`activity-item ${activities.quizPassed ? 'activity-done' : ''}`}><span className="activity-check">{activities.quizPassed ? <Check size={13} /> : null}</span>Knowledge check</span>}
      </div>
      <span className="activity-note">{nextStep}</span>
    </section>
    <div className="workspace-grid"><section className="lesson-instructions"><div className="workspace-section-title"><span className="step-number">01</span><div><span className="eyebrow">THE IDEA</span><h2>What you will learn</h2></div></div><p className="lesson-explanation">{lesson.explanation}</p><div className="objective-box"><div className="objective-icon"><Target size={17} /></div><div><span>YOUR OBJECTIVE</span><strong>{lesson.objective}</strong></div></div><a className="reference-link" href={referenceUrl} target="_blank" rel="noreferrer">Read the W3Schools reference<ArrowUpRight size={14} /></a><div className="instruction-divider" /><div className="workspace-section-title compact-title"><span className="step-number">02</span><div><span className="eyebrow">YOUR TURN</span><h2>Try it yourself</h2></div></div><p className="exercise-prompt">Update the starter code so it produces the expected result. Run it to check your output.</p><div className="expected-output"><span>EXPECTED OUTPUT</span><code>{lesson.expectedOutput.split('\n').map((line, index) => <span key={index}>{line}</span>)}</code></div><button className="example-toggle" onClick={() => setShowExample((value) => !value)}><Lightbulb size={15} />{showExample ? 'Hide example' : 'Show example'}<ChevronDown className={showExample ? 'rotate-icon' : ''} size={14} /></button>{showExample && <pre className="example-code">{lesson.example}</pre>}</section>
      <EditorWorkspace key={lesson.id} starterCode={lesson.starterCode} language={lesson.language} expectedOutput={lesson.expectedOutput} title={lesson.title} topic={lesson.topic} onCodeChange={onCodeChange} onRecordAttempt={onRecordAttempt} hint={lesson.hint} context={lesson} lessons={lessons} isSignedIn={Boolean(authUser)} skillLevel={progress.skillLevel} onPrevious={onPrevious} onNext={onNext} lessonId={lesson.id} testCases={lesson.testCases || []} attempts={progress.attempts.filter((attempt) => attempt.lessonId === lesson.id)} />
    </div>
    <QuizCheck lesson={lesson} quiz={quiz} alreadyPassed={activities.quizPassed} onRecordQuiz={onRecordQuiz} />
  </div>
}

function QuizCheck({ lesson, quiz = null, alreadyPassed = false, onRecordQuiz }) {
  const activeQuiz = quiz || lessonQuizzes[lesson.id]
  const [selected, setSelected] = useState(null)
  const [result, setResult] = useState(alreadyPassed ? 'You already passed this check. Try it again any time.' : '')
  if (!activeQuiz) return null
  function checkAnswer() {
    if (selected === null) return
    const correct = selected === activeQuiz.answer
    setResult(correct ? 'Correct. You can explain this idea now.' : 'Not quite. Revisit the explanation and try another answer.')
    onRecordQuiz({ lessonId: lesson.id, score: correct ? 1 : 0, totalQuestions: 1 })
  }
  return <section className="quiz-panel"><div className="quiz-heading"><span className="quiz-icon"><ListChecks size={17} /></span><div><span className="eyebrow">QUICK KNOWLEDGE CHECK</span><h2>Pause and check your understanding</h2></div>{alreadyPassed && <span className="quiz-passed-note"><Check size={13} />Passed</span>}</div><p>{activeQuiz.question}</p><div className="quiz-options">{activeQuiz.choices.map((choice, index) => <label className={`quiz-option ${selected === index ? 'quiz-option-selected' : ''}`} key={choice}><input type="radio" name={`quiz-${lesson.id}`} checked={selected === index} onChange={() => { setSelected(index); setResult('') }} /><span>{choice}</span></label>)}</div><div className="quiz-footer"><span className={result.startsWith('Correct') ? 'quiz-result quiz-result-correct' : 'quiz-result'}>{result}</span><Button onClick={checkAnswer} disabled={selected === null}>Check answer<ArrowRight size={14} /></Button></div></section>
}

function PlaygroundMessage({ message, files, onApply }) {
  if (message.role === 'user') return <div className="pg-msg pg-msg-user"><span className="pg-avatar">You</span><div className="pg-bubble">{message.content}</div></div>
  const parts = splitAssistantReply(message.content)
  return <div className="pg-msg"><span className="pg-avatar pg-avatar-ai"><Sparkles size={12} /></span><div className="pg-bubble">{message.mode === 'demo' && <span className="pg-mode">DEMO</span>}{message.mode === 'error' && <span className="pg-mode pg-mode-error">CONNECTION ERROR</span>}{parts.map((part, index) => part.type === 'text' ? (part.text.trim() ? <p key={index}>{part.text.trim()}</p> : null) : <div className="pg-code" key={index}><div className="pg-code-head"><span>{part.fileName || (part.language ? part.language.toUpperCase() : 'SNIPPET')}</span><button type="button" className="pg-apply" onClick={() => onApply(message.id, index, part)}>{message.applied?.includes(index) ? 'Applied' : resolvePlaygroundFile(part, files) ? `Apply to ${resolvePlaygroundFile(part, files).name}` : 'No matching file'}</button></div><pre>{part.code}</pre></div>)}</div></div>
}

function Playground({ onCodeChange, isSignedIn, authUser = null, skillLevel = 'Beginner', seed = null, onSeedHandled, onNotify }) {
  const userId = authUser?.id || null
  const [initial] = useState(() => loadPlaygroundState(userId))
  const [files, setFiles] = useState(initial.files)
  const [activeName, setActiveName] = useState(initial.activeName)
  const [openTabs, setOpenTabs] = useState(initial.openTabs)
  const [projectId, setProjectId] = useState(initial.projectId)
  const [projectName, setProjectName] = useState(initial.projectName || 'Untitled project')
  const [projects, setProjects] = useState([])
  const [cloudBusy, setCloudBusy] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [runId, setRunId] = useState(0)
  const [output, setOutput] = useState('')
  const [runStatus, setRunStatus] = useState('idle')
  const [activeOutputTab, setActiveOutputTab] = useState('console')
  const [chat, setChat] = useState(initial.chat)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [seedNote, setSeedNote] = useState('')
  const chatEndRef = useRef(null)
  const editorRef = useRef(null)
  const notify = (message) => onNotify?.(message)

  const activeFile = files.find((file) => file.name === activeName) || files[0]

  useEffect(() => { onCodeChange?.(activeFile?.content || '') }, [activeFile, onCodeChange])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat.length, busy])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(playgroundStorageKey(userId), serializePlayground({ files, activeName, openTabs, chat, projectId, projectName }))
        setSavedAt(Date.now())
      } catch {
        // Storage can be full or blocked; signed-in learners can still save to their account.
      }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [files, activeName, openTabs, chat, projectId, projectName, userId])

  useEffect(() => {
    if (!userId) { setProjects([]); return undefined }
    let active = true
    listPlaygroundProjects(userId).then((rows) => { if (active) setProjects(rows) }).catch(() => {})
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    if (!seed?.code) return
    const language = seed.language === 'html' || seed.language === 'css' ? seed.language : 'javascript'
    const extension = language === 'html' ? 'html' : language === 'css' ? 'css' : 'js'
    const proposed = seed.fileName && /\.(html|css|js)$/i.test(seed.fileName) ? sanitizeFileName(seed.fileName) : `tutor-snippet.${extension}`
    const existingName = files.find((file) => file.name.toLowerCase() === proposed.toLowerCase())?.name
    const target = existingName || proposed
    setFiles((current) => (existingName
      ? current.map((file) => (file.name === existingName ? { ...file, content: seed.code } : file))
      : createPlaygroundFile(current, proposed, seed.code)))
    setOpenTabs((tabs) => (tabs.includes(target) ? tabs : [...tabs, target]))
    setActiveName(target)
    setSeedNote(`The tutor's code was added to ${target}. Review it, then run the page.`)
    onSeedHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.id])

  useEffect(() => {
    if (!fullscreen) return undefined
    const handleKey = (event) => { if (event.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [fullscreen])

  function openFile(name) {
    setActiveName(name)
    setOpenTabs((tabs) => tabs.includes(name) ? tabs : [...tabs, name])
  }

  function closeTab(name) {
    setOpenTabs((tabs) => {
      if (tabs.length === 1) return tabs
      const nextTabs = tabs.filter((tab) => tab !== name)
      if (name === activeName) setActiveName(nextTabs[nextTabs.length - 1])
      return nextTabs
    })
  }

  function updateCode(value) {
    setFiles((current) => updatePlaygroundFile(current, activeName, value ?? ''))
  }

  function runCode() {
    setActiveOutputTab('console')
    setOutput('')
    setRunStatus('running')
    setSeedNote('')
    setRunId((value) => value + 1)
  }

  function receiveRun(result) {
    setOutput([result.error, result.consoleText, result.output].filter((value) => typeof value === 'string' && value.trim()).join('\n') || '(No output yet)')
    setRunStatus(result.error ? 'error' : 'success')
  }

  function resetProject() {
    if (!window.confirm('Reset this project to the starter files? Your current edits will be replaced.')) return
    setFiles(defaultPlaygroundFiles.map((file) => ({ ...file })))
    setActiveName(defaultPlaygroundFiles[0].name)
    setOpenTabs([defaultPlaygroundFiles[0].name])
    setProjectId(null)
    setProjectName('Untitled project')
    setOutput('')
    setRunStatus('idle')
    setSeedNote('')
    notify('Project reset to the starter files.')
  }

  function newFile() {
    const raw = window.prompt('New file name (.html, .css, or .js)', 'page.html')
    if (!raw) return
    const name = sanitizeFileName(raw)
    if (playgroundNameTaken(files, name)) { notify('That file name is already used in this project.'); return }
    setFiles((current) => createPlaygroundFile(current, name))
    openFile(name)
  }

  function renameActive() {
    const raw = window.prompt('Rename this file', activeName)
    if (!raw || raw.trim() === activeName) return
    const name = sanitizeFileName(raw)
    if (playgroundNameTaken(files, name, activeName)) { notify('Another file already uses that name.'); return }
    setFiles((current) => renamePlaygroundFile(current, activeName, name))
    setOpenTabs((tabs) => tabs.map((tab) => (tab === activeName ? name : tab)))
    setActiveName(name)
  }

  function duplicateActive() {
    const result = duplicatePlaygroundFile(files, activeName)
    if (!result.name) return
    setFiles(result.files)
    openFile(result.name)
  }

  function deleteActive() {
    if (files.length <= 1) { notify('Keep at least one file in the project.'); return }
    if (!window.confirm(`Delete ${activeName}? This cannot be undone.`)) return
    const nextFiles = deletePlaygroundFile(files, activeName)
    setFiles(nextFiles)
    setOpenTabs((tabs) => {
      const remaining = tabs.filter((tab) => tab !== activeName)
      return remaining.length ? remaining : [nextFiles[0].name]
    })
    setActiveName(nextFiles[0].name)
  }

  function editorAction(actionId) {
    const action = editorRef.current?.getAction?.(actionId)
    if (!action) { notify('That editor action is not available for this file yet.'); return }
    action.run().catch(() => {})
  }

  function downloadZip() {
    const archive = buildZip(files.map((file) => ({ name: file.name, content: file.content })))
    const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${zipFileName(projectName)}.zip`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('Project downloaded as a .zip archive.')
  }

  async function saveProject() {
    if (!isSignedIn) { notify('Sign in from Profile & settings to save this project to your account.'); return }
    const name = projectName.trim() || 'Untitled project'
    setCloudBusy(true)
    try {
      const saved = await savePlaygroundProject({ id: projectId, userId, name, files })
      setProjectId(saved.id)
      setProjectName(saved.name)
      setProjects(await listPlaygroundProjects(userId))
      notify(`Saved “${saved.name}” to your account.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save this project.')
    } finally {
      setCloudBusy(false)
    }
  }

  async function openSavedProject(id) {
    if (!id) return
    setCloudBusy(true)
    try {
      const project = await loadPlaygroundProject(id)
      if (!project) { notify('That saved project could not be found.'); return }
      const normalized = normalizePlaygroundFiles(project.files)
      if (!normalized) { notify('That saved project has no supported files.'); return }
      setFiles(normalized)
      setActiveName(normalized[0].name)
      setOpenTabs(normalized.slice(0, 3).map((file) => file.name))
      setProjectId(project.id)
      setProjectName(project.name)
      setChat([])
      setOutput('')
      setRunStatus('idle')
      notify(`Opened “${project.name}”.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not open that project.')
    } finally {
      setCloudBusy(false)
    }
  }

  async function removeProject() {
    if (!projectId) return
    if (!window.confirm(`Delete the saved project “${projectName}”? Work in this browser stays put.`)) return
    setCloudBusy(true)
    try {
      await deletePlaygroundProject(projectId)
      setProjects((current) => current.filter((project) => project.id !== projectId))
      setProjectId(null)
      notify('Saved project deleted.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not delete that project.')
    } finally {
      setCloudBusy(false)
    }
  }

  function appendAssistant(content, mode = 'local') {
    setChat((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content, mode }])
  }

  async function sendToTutor(text, errorText) {
    const trimmed = text.trim()
    setActiveOutputTab('chat')
    if (!isSignedIn) {
      appendAssistant('Sign in from Profile & settings to chat with the AI tutor and let it add code for you.')
      return
    }
    if (!trimmed || busy) return
    const userMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed }
    const nextChat = [...chat, userMessage]
    setChat(nextChat)
    setDraft('')
    setBusy(true)
    const result = await askTutor({
      question: `${PLAYGROUND_AI_NOTE}\n\nLearner request: ${trimmed}`,
      code: playgroundFilePayload(files),
      error: errorText,
      relatedLanguage: activeFile?.language || 'javascript',
      context: { title: 'Playground', topic: 'Playground', objective: `Build and refine ${files.map((file) => file.name).join(', ')}`, files: files.map((file) => file.name) },
      skillLevel,
      history: nextChat.slice(-6).map((message) => ({ role: message.role, content: message.content })),
    })
    setBusy(false)
    setChat((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: result.reply, mode: result.mode }])
  }

  function askPlaygroundTutor(kind) {
    if (kind === 'error' && runStatus !== 'error') {
      setActiveOutputTab('chat')
      appendAssistant('Run your project first so the tutor has an actual error message to explain.')
      return
    }
    sendToTutor(
      kind === 'hint' ? 'Please give me a hint about what to work on next. Do not rewrite my code yet.' : `Explain this error and, if the cause is clear, include the fixed file: ${output}`,
      kind === 'error' ? output : undefined,
    )
  }

  function applyBlock(messageId, index, block) {
    const target = resolvePlaygroundFile(block, files)
    if (!target) return
    setFiles((current) => current.map((file) => file.name === target.name ? { ...file, content: block.code } : file))
    openFile(target.name)
    setChat((current) => current.map((message) => message.id === messageId ? { ...message, applied: [...(message.applied || []), index] } : message))
  }

  const fileIcon = (file) => file.language === 'html' ? <FileCode2 size={14} /> : file.language === 'css' ? <FileText size={14} /> : <Braces size={14} />
  const activeIcon = activeFile.language === 'html' ? 'HTML' : activeFile.language === 'css' ? 'CSS' : 'JS'

  return <div className="page-content workspace-page">
    <PageIntro eyebrow="A SPACE TO EXPERIMENT" title="Playground" description="A small multi-file workspace: edit HTML, CSS, and JavaScript, run the page, and keep projects." />
    {seedNote && <div className="pg-seed-note"><Sparkles size={14} /><span>{seedNote}</span><button type="button" className="text-link" onClick={() => setSeedNote('')}>Dismiss</button></div>}
    <div className="playground-workbench">
      <aside className="file-explorer">
        <div className="explorer-head"><span>EXPLORER</span><button className="icon-button" aria-label="Reset project" title="Reset project" onClick={resetProject}><RotateCcw size={14} /></button></div>
        <div className="explorer-project">
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} aria-label="Project name" maxLength={80} />
          <button type="button" className="icon-button" title={isSignedIn ? 'Save project to your account' : 'Sign in to save projects'} aria-label="Save project" onClick={saveProject} disabled={cloudBusy}><Save size={14} /></button>
        </div>
        <div className="explorer-project-row">
          <select value={projectId || ''} onChange={(event) => openSavedProject(event.target.value)} disabled={!isSignedIn || cloudBusy || !projects.length} aria-label="Open a saved project">
            <option value="">{isSignedIn ? (projects.length ? 'Open saved project…' : 'No saved projects yet') : 'Sign in to load projects'}</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          {projectId && <button type="button" className="icon-button" title="Delete saved project" aria-label="Delete saved project" onClick={removeProject} disabled={cloudBusy}><Trash2 size={13} /></button>}
        </div>
        <div className="explorer-folder"><FolderOpen size={14} /><span>src</span></div>
        <div className="explorer-actions">
          <button type="button" className="icon-button" title="New file" aria-label="New file" onClick={newFile}><Plus size={14} /></button>
          <button type="button" className="icon-button" title="Rename active file" aria-label="Rename active file" onClick={renameActive}><Pencil size={13} /></button>
          <button type="button" className="icon-button" title="Duplicate active file" aria-label="Duplicate active file" onClick={duplicateActive}><Copy size={13} /></button>
          <button type="button" className="icon-button" title="Delete active file" aria-label="Delete active file" onClick={deleteActive}><Trash2 size={13} /></button>
          <button type="button" className="icon-button" title="Download project as .zip" aria-label="Download project as zip" onClick={downloadZip}><Download size={13} /></button>
        </div>
        <div className="explorer-files">{files.map((file) => (
          <button key={file.name} className={`explorer-file ${file.name === activeName ? 'explorer-file-active' : ''}`} onClick={() => openFile(file.name)}>
            {fileIcon(file)}<span>{file.name}</span>
          </button>
        ))}</div>
        <div className="explorer-foot"><span>{files.length} file{files.length === 1 ? '' : 's'}</span><span>{savedAt ? `Autosaved ${new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Autosave on'}</span></div>
        <div className="explorer-cloudnote">{projectId ? 'Linked to your saved project' : isSignedIn ? 'Save to keep this project on every device' : 'Projects stay in this browser until you sign in'}</div>
      </aside>
      <section className={`editor-workspace editor-workspace-wide ${fullscreen ? 'pg-fullscreen' : ''}`}>
        <div className="editor-toolbar">
          <div className="editor-tabs">{openTabs.map((name) => {
            const file = files.find((item) => item.name === name)
            if (!file) return null
            return <div key={name} className={`editor-tab ${name === activeName ? 'editor-tab-active' : ''}`}><button type="button" onClick={() => setActiveName(name)}>{fileIcon(file)}<span>{name}</span></button>{openTabs.length > 1 && <button type="button" className="editor-tab-close" aria-label={`Close ${name}`} onClick={() => closeTab(name)}><X size={12} /></button>}</div>
          })}</div>
          <div className="editor-controls">
            <span className="editor-language">{activeIcon}</span>
            <button className="editor-tool" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={() => editorAction('undo')}><ArrowLeft size={14} /></button>
            <button className="editor-tool" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onClick={() => editorAction('redo')}><ArrowRight size={14} /></button>
            <button className="editor-tool editor-tool-text" title="Format document" onClick={() => editorAction('editor.action.formatDocument')}>Format</button>
            <button className="editor-tool editor-tool-text" title="Find and replace" onClick={() => editorAction('actions.find')}>Find</button>
            <button className="editor-tool" title={fullscreen ? 'Exit fullscreen' : 'Fullscreen editor'} aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen editor'} onClick={() => setFullscreen((value) => !value)}>{fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
            <Button variant="run" onClick={runCode} disabled={runStatus === 'running'}><Play size={14} fill="currentColor" />Run Code</Button>
          </div>
        </div>
        <div className="monaco-wrap"><Editor path={activeFile.name} height={fullscreen ? '44vh' : '380px'} language={activeFile.language} theme="vs-dark" value={activeFile.content} onChange={updateCode} onMount={(editor) => { editorRef.current = editor }} options={{ minimap: { enabled: false }, fontSize: 13, lineHeight: 22, padding: { top: 16, bottom: 12 }, scrollBeyondLastLine: false, wordWrap: 'on', automaticLayout: true, fontFamily: '"IBM Plex Mono", Consolas, monospace', lineNumbersMinChars: 3, renderLineHighlight: 'gutter', scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 }, suggestOnTriggerCharacters: true }} /></div>
        <div className="pg-preview-wrap">
          <div className="pg-preview-head"><span><Eye size={13} />LIVE PREVIEW</span><span className="pg-preview-hint">Isolated frame · no network</span></div>
          {runId ? <CodeRunner key={runId} code={buildPreviewDocument(files)} language="html" runId={runId} onComplete={receiveRun} /> : <div className="pg-preview-empty"><Eye size={17} /><span>Press Run Code to render your page here. Scripts stay inside an isolated frame.</span></div>}
        </div>
        <div className="output-panel"><div className="output-header"><div className="output-tabs"><button className={activeOutputTab === 'console' ? 'output-tab-active' : ''} onClick={() => setActiveOutputTab('console')}><Terminal size={14} />Console</button><button className={activeOutputTab === 'chat' ? 'output-tab-active' : ''} onClick={() => setActiveOutputTab('chat')}><Sparkles size={14} />AI chat</button></div><span className={`execution-status execution-${runStatus}`}>{runStatus === 'running' ? 'Running' : runStatus === 'success' ? 'Preview rendered' : runStatus === 'error' ? 'Error' : 'Ready'}</span></div>
          {activeOutputTab === 'console' ? <pre className={`output-content ${runStatus === 'error' ? 'output-error' : ''}`}>{output || 'Run your code to preview the page and see its visible text and errors.'}</pre> : <div className="pg-chat">
            <div className="pg-chat-log">
              {!chat.length && <div className="pg-chat-empty"><strong>Ask the tutor to explain, debug, or write code.</strong><span>Try “Add a button that changes the heading color” or “Why is my paragraph not showing?”. Code changes arrive with an Apply button.</span><div className="pg-suggestions"><button type="button" onClick={() => sendToTutor('Add a contact form with a name, email, and submit button, and style it.')}>Add a form</button><button type="button" onClick={() => sendToTutor('Explain what script.js currently does in simple terms.')}>Explain my code</button></div></div>}
              {chat.map((message) => <PlaygroundMessage key={message.id} message={message} files={files} onApply={applyBlock} />)}
              {busy && <div className="pg-typing"><i /><i /><i /></div>}
              <div ref={chatEndRef} />
            </div>
            <form className="pg-chat-form" onSubmit={(event) => { event.preventDefault(); sendToTutor(draft) }}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={isSignedIn ? 'Ask the tutor to add or explain code...' : 'Sign in to chat with the tutor'} disabled={!isSignedIn || busy} aria-label="Message the playground tutor" />
              <Button variant="dark" type="submit" disabled={!isSignedIn || busy || !draft.trim()}><Send size={13} />Send</Button>
            </form>
          </div>}
        </div>
        <div className="editor-footer"><div className="editor-footer-left"><button className="editor-action" onClick={() => askPlaygroundTutor('hint')} disabled={busy}><Lightbulb size={15} />Get a hint</button><button className="editor-action" onClick={() => askPlaygroundTutor('error')} disabled={busy}><CircleHelp size={15} />Explain my error</button><button className="editor-action" onClick={downloadZip}><Download size={15} />Download .zip</button></div><div className="editor-footer-right"><span className="safe-runtime"><ShieldCheck size={14} />Runs in an isolated browser frame</span></div></div>
      </section>
    </div>
  </div>
}

const defaultPlaygroundFiles = [
  {
    name: 'index.html',
    language: 'html',
    content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Loopwise playground</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main>
      <h1>Hello, world!</h1>
      <p id="output"></p>
    </main>
    <script src="script.js"></script>
  </body>
</html>`,
  },
  {
    name: 'styles.css',
    language: 'css',
    content: `body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #f4f8f5;
  color: #17221e;
  display: grid;
  place-items: center;
  min-height: 100vh;
}

h1 {
  color: #2f785e;
}`,
  },
  {
    name: 'script.js',
    language: 'javascript',
    content: `const output = document.getElementById('output');
if (output) {
  output.textContent = 'Built with HTML, CSS, and JavaScript.';
}`,
  },
]

function buildPreviewDocument(files) {
  const htmlFile = files.find((file) => file.language === 'html')
  const css = files.filter((file) => file.language === 'css').map((file) => file.content).join('\n').replace(/<\/style/gi, '<\\/style')
  const js = files.filter((file) => file.language === 'javascript').map((file) => file.content).join('\n').replace(/<\/script/gi, '<\\/script')
  let html = htmlFile?.content || '<!DOCTYPE html><html><head></head><body></body></html>'
  html = html.replace(/<link[^>]+href=["'][^"']*\.css["'][^>]*>/gi, '')
  html = html.replace(/<script[^>]+src=["'][^"']*\.js["'][^>]*><\/script>/gi, '')
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `<style>${css}</style></head>`) : `<style>${css}</style>${html}`
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `<script>${js}</script></body>`) : `${html}<script>${js}</script>`
  return html
}

function loadPlaygroundState(userId) {
  try {
    const restored = parsePlayground(localStorage.getItem(playgroundStorageKey(userId)))
    if (restored) return restored
  } catch {
    // Unreadable storage falls back to the starter project.
  }
  return {
    files: defaultPlaygroundFiles.map((file) => ({ ...file })),
    activeName: defaultPlaygroundFiles[0].name,
    openTabs: [defaultPlaygroundFiles[0].name],
    chat: [],
    projectId: null,
    projectName: 'Untitled project',
  }
}

function EditorWorkspace({ starterCode, language, expectedOutput, title, topic, onCodeChange, onRecordAttempt, hint, context, lessons = [], onPrevious, onNext, isSignedIn = false, skillLevel = 'Beginner', exerciseId = null, lessonId = null, testCases = [], attempts = [] }) {
  const [code, setCode] = useState(starterCode)
  const [runId, setRunId] = useState(0)
  const [output, setOutput] = useState('')
  const [runStatus, setRunStatus] = useState('idle')
  const [executionStatus, setExecutionStatus] = useState('idle')
  const [feedback, setFeedback] = useState('')
  const [activeOutputTab, setActiveOutputTab] = useState('output')
  const [busy, setBusy] = useState(false)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [testResults, setTestResults] = useState(null)
  const [showSubmissions, setShowSubmissions] = useState(false)
  const pendingSubmit = useRef(false)
  const startedAt = useRef(Date.now())
  const testDefinitions = testCases.length
    ? testCases
    : [{ description: 'Program output matches the expected output', expectedOutput, mode: 'exact' }]
  const passedTestCount = testResults ? testResults.filter((result) => result.passed).length : 0

  useEffect(() => { onCodeChange?.(code) }, [code, onCodeChange])

  function runCode() {
    setFeedback('')
    setActiveOutputTab('output')
    setOutput('')
    setRunStatus('running')
    setExecutionStatus('running')
    setRunId((value) => value + 1)
  }

  function receiveRun(result) {
    setOutput([result.error, result.consoleText, result.output].filter((value) => typeof value === 'string' && value.trim()).join('\n') || '(No output yet)')
    setRunStatus(result.error ? 'error' : 'success')
    setExecutionStatus(result.error ? result.executionStatus || 'runtime_error' : 'success')
    if (pendingSubmit.current) {
      pendingSubmit.current = false
      gradeSubmission(result)
    }
  }

  function gradeSubmission(result) {
    const stdout = String(result.output ?? '')
    const failedToRun = Boolean(result.error)
    const results = failedToRun
      ? testDefinitions.map((test) => ({ description: test.description, passed: false, expected: test.expectedOutput, actual: result.error }))
      : evaluateTestCases({ output: stdout, expectedOutput, language, testCases })
    const passedCount = results.filter((testResult) => testResult.passed).length
    const passed = !failedToRun && passedAllTests(results)
    setTestResults(results)
    setActiveOutputTab('tests')
    onRecordAttempt({
      lessonId: lessonId || undefined,
      exerciseId: exerciseId || undefined,
      title,
      topic,
      passed,
      output: failedToRun ? String(result.error || '') : stdout,
      expectedOutput,
      language,
      code,
      executionStatus: passed ? 'accepted' : failedToRun ? (result.executionStatus || 'runtime_error') : 'wrong_answer',
      testResults: results,
      passedTests: passedCount,
      totalTests: results.length,
      score: results.length ? Math.round((passedCount / results.length) * 100) : 0,
      durationSeconds: Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)),
      hintsUsed,
    })
    setFeedback(passed
      ? `All ${results.length} check${results.length === 1 ? '' : 's'} passed. Nice work!`
      : failedToRun
        ? 'Your code did not finish, so the checks could not pass. Fix the error, then submit again.'
        : `${passedCount} of ${results.length} checks passed. Open the Tests tab to see what missed, then submit again.`)
  }

  function submitAnswer() {
    if (!expectedOutput) {
      setFeedback('This exercise does not have an expected output yet.')
      return
    }
    if (runStatus === 'running') {
      pendingSubmit.current = true
      return
    }
    setTestResults(null)
    pendingSubmit.current = true
    runCode()
  }

  function restoreSubmission(submission) {
    if (!submission?.code) return
    setCode(submission.code)
    onCodeChange?.(submission.code)
    setOutput('')
    setRunStatus('idle')
    setExecutionStatus('idle')
    setTestResults(null)
    setFeedback('Loaded an earlier submission into the editor. Run or submit when you are ready.')
    setActiveOutputTab('feedback')
  }

  async function getHint() {
    setActiveOutputTab('feedback')
    if (!isSignedIn) {
      setFeedback('Sign in from Profile & settings to use AI hints and error explanations.')
      return
    }
    setBusy(true)
    setHintsUsed((count) => count + 1)
    setFeedback('Thinking through a hint...')
    const result = await askTutor({ question: 'Please give me a hint, not the full solution.', mode: 'hint', code, relatedLanguage: language, context: { ...context, title, topic, hint }, skillLevel })
    setFeedback(`${result.mode === 'demo' ? 'Tutor demo · ' : ''}${result.reply}`)
    setActiveOutputTab('feedback')
    setBusy(false)
  }

  async function explainError() {
    setActiveOutputTab('feedback')
    if (!isSignedIn) {
      setFeedback('Sign in from Profile & settings to use AI hints and error explanations.')
      return
    }
    if (runStatus !== 'error' || !output) {
      setFeedback('Run your code first so the tutor has an actual error message to explain.')
      return
    }
    setBusy(true)
    setFeedback('Reading the error and your code...')
    const result = await askTutor({ question: 'Explain what this error means and guide me toward a fix without rewriting my whole solution.', mode: 'debugging', error: output, code, relatedLanguage: language, context: { ...context, title, topic }, skillLevel })
    setFeedback(`${result.mode === 'demo' ? 'Tutor demo · ' : ''}${result.reply}`)
    setActiveOutputTab('feedback')
    setBusy(false)
  }

  function resetCode() {
    setCode(starterCode)
    onCodeChange?.(starterCode)
    setOutput('')
    setRunStatus('idle')
    setExecutionStatus('idle')
    setFeedback('')
  }

  return <section className="editor-workspace">
      <div className="editor-toolbar"><div className="editor-file"><span className="file-language-icon">{language === 'javascript' ? 'JS' : language === 'html' ? 'HTML' : language.toUpperCase()}</span><span>{`${title.toLowerCase().replaceAll(' ', '-')}.${language === 'javascript' ? 'js' : language}`}</span><span className="editor-unsaved" /></div><div className="editor-controls"><span className="editor-language">{language === 'html' ? 'HTML' : 'JavaScript'}</span><button className="editor-tool" onClick={resetCode} aria-label="Reset code" title="Reset code"><RotateCcw size={15} /></button><Button variant="run" onClick={runCode} disabled={runStatus === 'running'}><Play size={14} fill="currentColor" />Run</Button></div></div>
    <div className="monaco-wrap"><Editor height="340px" language={language} theme="vs-dark" value={code} onChange={(value) => { const nextCode = value ?? ''; setCode(nextCode); onCodeChange?.(nextCode) }} options={{ minimap: { enabled: false }, fontSize: 13, lineHeight: 22, padding: { top: 16, bottom: 12 }, scrollBeyondLastLine: false, wordWrap: 'on', automaticLayout: true, fontFamily: '"IBM Plex Mono", Consolas, monospace', lineNumbersMinChars: 3, renderLineHighlight: 'gutter', scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 }, suggestOnTriggerCharacters: true }} /></div>
    <CodeRunner key={runId} code={code} language={language} runId={runId} onComplete={receiveRun} />
    <div className="output-panel"><div className="output-header"><div className="output-tabs"><button className={activeOutputTab === 'output' ? 'output-tab-active' : ''} onClick={() => setActiveOutputTab('output')}><Terminal size={14} />Output</button><button className={activeOutputTab === 'feedback' ? 'output-tab-active' : ''} onClick={() => setActiveOutputTab('feedback')}><Sparkles size={14} />Feedback</button><button className={activeOutputTab === 'tests' ? 'output-tab-active' : ''} onClick={() => setActiveOutputTab('tests')}><ListChecks size={14} />Tests{testResults ? ` ${passedTestCount}/${testResults.length}` : ''}</button></div><span className={`execution-status execution-${runStatus}`}>{runStatus === 'running' ? 'Running' : runStatus === 'success' ? 'Execution succeeded' : runStatus === 'error' ? executionStatus === 'compile_error' ? 'Compile error' : executionStatus === 'runtime_error' ? 'Runtime error' : executionStatus === 'timeout' || executionStatus === 'time_limit' ? 'Time limit' : executionStatus === 'infrastructure_error' ? 'Service unavailable' : 'Execution failed' : 'Ready'}</span></div>
      {activeOutputTab === 'output' ? <pre className={`output-content ${runStatus === 'error' ? 'output-error' : ''}`}>{output || 'Run your code to see what happens.'}</pre> : activeOutputTab === 'tests' ? <div className="test-results">{testResults ? testResults.map((testResult, index) => <div key={index} className={`test-result-row ${testResult.passed ? 'test-result-pass' : 'test-result-fail'}`}><span className="test-result-icon">{testResult.passed ? <Check size={13} /> : <X size={13} />}</span><div className="test-result-copy"><strong>{testResult.description}</strong><small>Expected: <code>{String(testResult.expected ?? '')}</code></small>{!testResult.passed && <small>Got: <code>{String(testResult.actual ?? '(no output)')}</code></small>}</div></div>) : <p className="test-results-empty">Submit your answer to check it against every test case.</p>}</div> : <div className={`feedback-content ${testResults && passedAllTests(testResults) ? 'feedback-success' : ''}`}>{feedback ? <TutorRichText text={feedback} /> : 'Submit your answer for a check, or ask for a hint when you need a nudge.'}</div>}
    </div>
    <div className="editor-footer"><div className="editor-footer-left"><button className="editor-action" onClick={getHint} disabled={busy}><Lightbulb size={15} />Get a hint</button><button className="editor-action" onClick={explainError} disabled={busy}><CircleHelp size={15} />Explain my error</button><button className="editor-action" onClick={submitAnswer}><CheckCircle2 size={15} />Submit answer</button></div><div className="editor-footer-right"><span className="safe-runtime"><ShieldCheck size={14} />Runs in an isolated browser frame</span>{onPrevious && <Button onClick={onPrevious} disabled={lessons.findIndex((lesson) => lesson.id === context?.id) <= 0}><ArrowLeft size={14} />Previous</Button>}{onNext && <Button onClick={onNext}>Next lesson<ArrowRight size={14} /></Button>}</div></div>
    {attempts.length > 0 && <section className="submissions-panel">
      <div className="submissions-head"><div><span className="eyebrow">YOUR HISTORY</span><strong>{attempts.length} previous submission{attempts.length === 1 ? '' : 's'} for this exercise</strong></div><button type="button" className="text-link" onClick={() => setShowSubmissions((value) => !value)}>{showSubmissions ? 'Hide submissions' : 'Show submissions'}<ChevronDown className={showSubmissions ? 'rotate-icon' : ''} size={13} /></button></div>
      {showSubmissions && <div className="submission-list">{attempts.slice(0, 8).map((submission) => {
        const results = Array.isArray(submission.testResults) ? submission.testResults : []
        const total = results.length || Number(submission.totalTests) || 0
        const correct = results.length ? results.filter((result) => result.passed).length : Number(submission.passedTests) || 0
        return <div className="submission-row" key={submission.id}>
          <div className="submission-meta"><span className={`submission-status ${submission.passed ? 'submission-passed' : 'submission-failed'}`}>{submission.passed ? 'Passed' : 'Failed'}</span>{total > 0 && <span>{correct}/{total} checks</span>}{submission.hintsUsed ? <span>{submission.hintsUsed} hint{submission.hintsUsed === 1 ? '' : 's'}</span> : null}{submission.durationSeconds ? <span>{Math.max(1, Math.round(Number(submission.durationSeconds)))}s</span> : null}</div>
          <div className="submission-foot"><span>{new Date(submission.createdAt).toLocaleString()}</span>{submission.code && <button type="button" className="text-link" onClick={() => restoreSubmission(submission)}><RotateCcw size={13} />Restore code</button>}</div>
        </div>
      })}</div>}
    </section>}
  </section>
}

function CodeRunner({ code, language, runId, onComplete }) {
  const iframeRef = useRef(null)
  const callbackRef = useRef(onComplete)
  useEffect(() => { callbackRef.current = onComplete }, [onComplete])
  useLayoutEffect(() => {
    if (!runId) return undefined
    let finished = false
    const timeout = window.setTimeout(() => {
      if (finished) return
      finished = true
      try { iframeRef.current?.contentWindow?.stop() } catch { /* opaque-origin frames block stop(); the callback still reports the timeout */ }
      callbackRef.current({ runId, error: 'Execution stopped after 3.5 seconds. Check for a loop or script that never finishes.', executionStatus: 'time_limit' })
    }, 3500)
    function handleMessage(event) {
      if (event.source !== iframeRef.current?.contentWindow || event.data?.source !== 'loopwise-sandbox' || event.data?.runId !== runId) return
      if (finished) return
      finished = true
      window.clearTimeout(timeout)
      callbackRef.current(event.data)
    }
    window.addEventListener('message', handleMessage)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('message', handleMessage)
    }
  }, [runId, language])

  if (!runId) return null
  const policy = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src data:"
  let documentContent
  if (language === 'html') {
    const guard = `<script>window.__lwLogs=[];window.__lwErrors=[];(function(){var format=function(values){return values.map(function(value){try{return typeof value==='string'?value:JSON.stringify(value)}catch(error){return String(value)}}).join(' ')};['log','info','warn','error'].forEach(function(type){var original=console[type];console[type]=function(){var values=[].slice.call(arguments);window.__lwLogs.push(type+': '+format(values));original.apply(console,values)}});window.addEventListener('error',function(event){var message=(event.error&&event.error.stack?event.error.stack.split('\\n')[0]:null)||event.message||'Unknown error';window.__lwErrors.push('Uncaught: '+message)});window.addEventListener('unhandledrejection',function(event){var reason=event.reason&&event.reason.message?event.reason.message:event.reason;window.__lwErrors.push('Unhandled promise rejection: '+(reason||'unknown'))})})()</script>`
    const report = `<script>const runId=${runId};let sent=false;const finish=(result)=>{if(sent)return;sent=true;parent.postMessage({source:'loopwise-sandbox',runId,...result},'*')};setTimeout(()=>{const clean=document.body.cloneNode(true);clean.querySelectorAll('script,style,noscript,template').forEach((node)=>node.remove());const text=((clean.innerText||clean.textContent||'').trim());const logs=(window.__lwLogs||[]).join('\\n');const errors=(window.__lwErrors||[]).join('\\n');if(errors)finish({error:errors,output:text,consoleText:logs,executionStatus:'runtime_error'});else finish({output:text,consoleText:logs,executionStatus:'success'})},80)</script>`
    documentContent = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"><meta name="viewport" content="width=device-width"><style>body{font:14px system-ui;padding:16px;color:#17221e}</style>${guard}${code}${report}`
  } else {
    const encoded = btoa(unescape(encodeURIComponent(code)))
    const encodedWorker = btoa(unescape(encodeURIComponent(sandboxWorkerSource)))
    documentContent = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><body><script>const runId=${runId};const source=decodeURIComponent(escape(atob('${encoded}')));const workerSource=decodeURIComponent(escape(atob('${encodedWorker}')));const workerUrl=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));const worker=new Worker(workerUrl);let finished=false;const finish=(result)=>{if(finished)return;finished=true;clearTimeout(timer);worker.terminate();URL.revokeObjectURL(workerUrl);document.body.textContent=result.output||'(No output yet)';parent.postMessage({source:'loopwise-sandbox',runId,...result},'*')};const timer=setTimeout(()=>finish({error:'JavaScript stopped after 3 seconds. Check whether a loop condition can eventually become false.',executionStatus:'time_limit'}),3000);worker.onmessage=(event)=>finish(event.data);worker.onerror=(event)=>finish({error:event.message||'JavaScript worker failed.',executionStatus:'runtime_error'});worker.postMessage({source})</script></body>`
  }
  if (language === 'html') return <iframe ref={iframeRef} title="Sandboxed HTML preview" className="preview-frame" sandbox="allow-scripts" srcDoc={documentContent} />
  return <iframe ref={iframeRef} title="Sandboxed code output" className="sandbox-frame" sandbox="allow-scripts" srcDoc={documentContent} />
}

function Practice({ progress, authUser, onRecordAttempt, focusExerciseId = null, onFocusHandled }) {
  const [activeId, setActiveId] = useState(focusExerciseId)
  const [showHint, setShowHint] = useState(false)
  const [language, setLanguage] = useState('All languages')
  const exerciseResults = new Map()
  for (const attempt of progress.attempts) {
    const key = attempt.exerciseId || attempt.title
    const entry = exerciseResults.get(key) || { attempts: 0, passed: false }
    entry.attempts += 1
    if (attempt.passed) entry.passed = true
    exerciseResults.set(key, entry)
  }
  const weakness = new Map()
  for (const attempt of progress.attempts) {
    if (attempt.passed || !attempt.topic) continue
    weakness.set(attempt.topic, (weakness.get(attempt.topic) || 0) + 1)
  }
  for (const entry of summarizeMistakes(progress.errorHistory || []).topics) {
    if (!entry.unresolved) continue
    weakness.set(entry.topic, (weakness.get(entry.topic) || 0) + entry.unresolved)
  }
  const recommendations = practiceExercises
    .filter((exercise) => !exerciseResults.get(exercise.id)?.passed && weakness.has(exercise.topic))
    .sort((first, second) => weakness.get(second.topic) - weakness.get(first.topic))
    .slice(0, 3)
  const exercises = language === 'All languages' ? practiceExercises : practiceExercises.filter((exercise) => exercise.language === language.toLowerCase())
  const active = practiceExercises.find((exercise) => exercise.id === activeId)
  const activeAttempts = active ? progress.attempts.filter((attempt) => attempt.exerciseId === active.id || (!attempt.exerciseId && attempt.title === active.title)) : []

  useEffect(() => { setShowHint(false) }, [activeId])
  useEffect(() => {
    if (!focusExerciseId) return
    setActiveId(focusExerciseId)
    onFocusHandled?.()
  }, [focusExerciseId, onFocusHandled])

  if (active) return <div className="page-content workspace-page">
    <button className="back-link" onClick={() => setActiveId(null)}><ArrowLeft size={15} />Back to practice</button>
    <div className="workspace-heading"><div><div className="lesson-row-meta"><span>{active.topic}</span><i />{active.difficulty}<i /><Code2 size={13} />{active.language === 'html' ? 'HTML' : 'JavaScript'}</div><h1>{active.title}</h1><p>{active.prompt}</p></div><span className="lesson-state"><Target size={15} />Practice</span></div>
    <div className="workspace-grid">
      <section className="lesson-instructions">
        <div className="workspace-section-title"><span className="step-number">01</span><div><span className="eyebrow">THE TASK</span><h2>What to build</h2></div></div>
        <p className="lesson-explanation">{active.prompt}</p>
        <div className="objective-box"><div className="objective-icon"><Target size={17} /></div><div><span>YOUR OBJECTIVE</span><strong>{active.prompt}</strong></div></div>
        <div className="instruction-divider" />
        <div className="workspace-section-title compact-title"><span className="step-number">02</span><div><span className="eyebrow">CHECK YOUR WORK</span><h2>Expected output</h2></div></div>
        <p className="exercise-prompt">Submit your code to check it against every test case for this exercise.</p>
        <div className="expected-output"><span>EXPECTED OUTPUT</span><code>{active.expectedOutput.split('\n').map((line, index) => <span key={index}>{line}</span>)}</code></div>
        {(active.testCases?.length || 0) > 1 && <div className="test-case-list"><span className="eyebrow">TESTS ({active.testCases.length})</span>{active.testCases.map((testCase, index) => <span key={index} className="test-case-item"><span className="test-case-index">{index + 1}</span>{testCase.description}</span>)}</div>}
        <button className="example-toggle" onClick={() => setShowHint((value) => !value)}><Lightbulb size={15} />{showHint ? 'Hide hint' : 'Show hint'}<ChevronDown className={showHint ? 'rotate-icon' : ''} size={14} /></button>
        {showHint && <pre className="example-code">{active.hint}</pre>}
      </section>
      <EditorWorkspace key={active.id} starterCode={active.starterCode} language={active.language} expectedOutput={active.expectedOutput} title={active.title} topic={active.topic} onRecordAttempt={onRecordAttempt} hint={active.hint} context={active} isSignedIn={Boolean(authUser)} skillLevel={progress.skillLevel} exerciseId={active.id} lessonId={active.lessonId} testCases={active.testCases || []} attempts={activeAttempts} />
    </div>
  </div>

  return <div className="page-content"><PageIntro eyebrow="RETRIEVE, APPLY, IMPROVE" title="Practice" description="Short exercises help new ideas stick. Try, check, and try again." action={<span className="learning-count"><Target size={15} />{practiceExercises.length} exercises</span>} /><div className="practice-summary"><div className="practice-summary-icon"><Award size={20} /></div><div><strong>Practice at your own pace</strong><span>These starter exercises use the same concepts as your lessons.</span></div><span className="practice-summary-count">{progress.attempts.filter((attempt) => attempt.passed).length} passed</span></div>
    {recommendations.length > 0 && <section className="mastery-panel practice-recommend"><div className="panel-heading"><div><span className="eyebrow">BASED ON YOUR RESULTS</span><h2>Recommended practice</h2></div><span className="topics-caption">Built from failed attempts and open mistakes</span></div><div className="practice-recommend-list">{recommendations.map((exercise) => <button type="button" key={exercise.id} className="practice-recommend-item" onClick={() => setActiveId(exercise.id)}><span className="lesson-tag">{exercise.topic}</span><strong>{exercise.title}</strong><small>{weakness.get(exercise.topic)} signal{weakness.get(exercise.topic) === 1 ? '' : 's'} to work on · {exercise.difficulty}</small><span className="practice-recommend-open">Open<ArrowRight size={13} /></span></button>)}</div></section>}
    <div className="filter-row"><div className="filter-caption">FILTER <span>{language === 'All languages' ? 'All exercises' : language === 'html' ? 'HTML exercises' : 'JavaScript exercises'}</span></div><div className="filter-controls"><label className="select-wrap"><span className="sr-only">Practice language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option>All languages</option><option value="javascript">JavaScript</option><option value="html">HTML</option></select><ChevronDown size={14} /></label></div></div>
    <div className="exercise-grid">{exercises.map((exercise) => {
      const result = exerciseResults.get(exercise.id)
      return <article className="exercise-card" key={exercise.id}><div className="exercise-card-top"><span className="exercise-number">{exercise.language === 'html' ? 'HTML' : 'JS'}</span><span className="difficulty-tag">{exercise.difficulty}</span></div><span className="lesson-tag">{exercise.topic}</span><h2>{exercise.title}</h2><p>{exercise.prompt}</p><div className="exercise-card-footer"><span className={result?.passed ? 'practice-result-passed' : result ? 'practice-result-retry' : ''}>{result?.passed ? <><CheckCircle2 size={14} />Passed</> : result ? <><RotateCcw size={14} />Needs another try</> : <><Clock3 size={14} />5 min</>}</span><Button onClick={() => setActiveId(exercise.id)}>Open exercise<ArrowRight size={14} /></Button></div></article>
    })}</div>
  </div>
}

const TUTOR_MODES = [
  { id: 'learning', label: 'Learning', icon: BookOpen, placeholder: 'Ask me to explain a concept step by step...' },
  { id: 'explain', label: 'Explain code', icon: Code2, placeholder: 'Attach code and ask what it does, line by line...' },
  { id: 'correct', label: 'Fix my code', icon: CheckCircle2, placeholder: 'Attach broken code and ask for the smallest fix...' },
  { id: 'debugging', label: 'Debugging', icon: Bug, placeholder: 'Paste an error, or describe what broke...' },
  { id: 'hint', label: 'Hint', icon: Lightbulb, placeholder: 'Ask for a nudge without the full answer...' },
  { id: 'quiz', label: 'Quiz', icon: ListChecks, placeholder: 'Ask me to quiz you, or answer the quiz question...' },
]

function TutorInline({ text }) {
  return parseInline(text).map((token, index) => {
    if (token.type === 'code') return <code className="tutor-inline-code" key={index}>{token.text}</code>
    if (token.type === 'strong') return <strong key={index}>{token.text}</strong>
    return token.text
  })
}

function TutorText({ text }) {
  return parseTutorLines(text).map((line, index) => {
    if (line.type === 'heading') {
      const Heading = `h${line.level}`
      return <Heading key={index}><TutorInline text={line.text} /></Heading>
    }
    if (line.type === 'bullet') return <div className="tutor-line tutor-bullet" key={index}><span aria-hidden="true">•</span><span><TutorInline text={line.text} /></span></div>
    if (line.type === 'numbered') return <div className="tutor-line tutor-numbered" key={index}><span>{line.marker}.</span><span><TutorInline text={line.text} /></span></div>
    return <p key={index}><TutorInline text={line.text} /></p>
  })
}

function TutorCodeBlock({ language, code, fileName, onSendCode }) {
  const [copied, setCopied] = useState(false)
  const [runId, setRunId] = useState(0)
  const [result, setResult] = useState(null)
  const runnable = runnableTutorLanguage(language)
  const label = fileName || (language ? language.toUpperCase() : 'CODE')
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return <div className="tutor-code">
    <div className="tutor-code-head"><span>{label}</span><div className="tutor-code-actions"><button type="button" onClick={copyCode}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button>{runnable && <button type="button" onClick={() => { setResult(null); setRunId((value) => value + 1) }}><Play size={13} />Run</button>}{onSendCode && <button type="button" onClick={() => onSendCode({ language, code, fileName })}><Braces size={13} />Open in Playground</button>}</div></div>
    <pre><code>{code}</code></pre>
    {runId > 0 && runnable && <div className={`tutor-run ${result?.error ? 'tutor-run-error' : ''}`}>
      <CodeRunner key={runId} code={code} language={language} runId={runId} onComplete={setResult} />
      {language !== 'html' && <pre>{result ? (result.error || result.output || '(No output yet)') : 'Running...'}</pre>}
      {language === 'html' && result?.error && <pre>{result.error}</pre>}
    </div>}
  </div>
}

function TutorRichText({ text, onSendCode }) {
  return <div className="tutor-rich">{parseTutorMarkdown(text).map((block, index) => (block.type === 'code'
    ? <TutorCodeBlock key={index} language={block.language} code={block.code} fileName={block.fileName} onSendCode={onSendCode} />
    : <TutorText key={index} text={block.text} />))}</div>
}

function TutorMessage({ message, displayName, onRetry, onSendCode }) {
  const isUser = message.role === 'user'
  const modeInfo = TUTOR_MODES.find((mode) => mode.id === message.tutorMode)
  return <div className={`chat-message message-${message.role} ${message.mode === 'error' ? 'message-error' : ''}`}>
    <span className="message-avatar">{isUser ? (displayName || 'L').slice(0, 1).toUpperCase() : <Sparkles size={14} />}</span>
    <div className="message-body">
      <div className="message-meta">
        <strong>{isUser ? displayName : 'Loopwise tutor'}</strong>
        {!isUser && modeInfo && <span className="message-mode">{modeInfo.label}</span>}
        {message.mode === 'demo' && <span>DEMO RESPONSE</span>}
        {message.mode === 'error' && <span>CONNECTION PROBLEM</span>}
        {!isUser && message.tutorLanguage && <span>{message.tutorLanguage === 'html' ? 'HTML' : 'JavaScript'} context</span>}
      </div>
      {isUser
        ? <p className="tutor-user-text">{message.content}</p>
        : message.mode === 'error'
          ? <div className="tutor-error"><p>{message.content}</p>{onRetry && <button type="button" className="tutor-retry" onClick={() => onRetry(message)}><RefreshCw size={13} />Try again</button>}</div>
          : <TutorRichText text={message.content} onSendCode={onSendCode} />}
    </div>
  </div>
}

function TutorPage({ progress, currentCode, currentLesson, tutorLanguage, isSignedIn = false, prefill = null, onPrefillHandled, onSendToPlayground, onMessagesChange, onNewConversation }) {
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [attachedCode, setAttachedCode] = useState(false)
  const [prefillCode, setPrefillCode] = useState('')
  const [tutorMode, setTutorMode] = useState('learning')
  const messages = progress.messages || []
  const bottomRef = useRef(null)
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
  const modeInfo = TUTOR_MODES.find((mode) => mode.id === tutorMode) || TUTOR_MODES[0]
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length, pending])
  useEffect(() => {
    if (!prefill?.text) return
    setDraft(prefill.text)
    if (prefill.mode && TUTOR_MODES.some((mode) => mode.id === prefill.mode)) setTutorMode(prefill.mode)
    if (prefill.code) {
      setPrefillCode(prefill.code)
      setAttachedCode(true)
    }
    onPrefillHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.id])

  async function requestReply(text, requestMode, code, baseMessages) {
    setPending(true)
    const cloudMistakes = (progress.errorHistory || []).filter((row) => !row.resolved).slice(0, 3).map((row) => `${row.topic}: ${row.errorMessage}`)
    const recentMistakes = cloudMistakes.length
      ? cloudMistakes
      : progress.attempts.filter((attempt) => !attempt.passed).slice(0, 3).map((attempt) => `${attempt.topic}: ${attempt.title}`)
    const recentAttempts = progress.attempts.slice(0, 3).map((attempt) => ({
      title: attempt.title,
      topic: attempt.topic,
      passed: Boolean(attempt.passed),
      output: String(attempt.output || '').slice(0, 400),
    }))
    const result = await askTutor({
      question: text,
      mode: requestMode,
      code,
      relatedLanguage: tutorLanguage,
      skillLevel: progress.skillLevel,
      context: { title: currentLesson.title, topic: currentLesson.topic, objective: currentLesson.objective, recentMistakes, recentAttempts },
      history: baseMessages.filter((message) => message.role !== 'system' && message.mode !== 'error').slice(-10).map(({ role, content }) => ({ role, content })),
    })
    onMessagesChange([...baseMessages, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: result.reply,
      mode: result.mode,
      tutorMode: requestMode,
      tutorLanguage,
      retryText: text,
      retryCode: code,
      createdAt: new Date().toISOString(),
    }])
    setAttachedCode(false)
    setPrefillCode('')
    setPending(false)
  }

  async function sendMessage(text = draft) {
    const trimmed = text.trim()
    if (!trimmed || pending) return
    const userMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed, tutorMode, tutorLanguage, createdAt: new Date().toISOString() }
    const nextMessages = [...messages, userMessage]
    onMessagesChange(nextMessages)
    setDraft('')
    await requestReply(trimmed, tutorMode, attachedCode ? (prefillCode || currentCode) : '', nextMessages)
  }

  async function retryMessage(message) {
    if (pending) return
    const without = messages.filter((entry) => entry.id !== message.id)
    onMessagesChange(without)
    const previousUser = [...without].reverse().find((entry) => entry.role === 'user')
    await requestReply(message.retryText || previousUser?.content || draft, message.tutorMode || tutorMode, message.retryCode ?? '', without)
  }

  const tutorStatus = !lastAssistant || lastAssistant.mode === 'demo'
    ? 'Demo mode'
    : lastAssistant.mode === 'error'
      ? 'AI unavailable'
      : 'AI connected'
  const tutorSubtitle = tutorStatus === 'AI connected'
    ? 'Ready to help'
    : tutorStatus === 'AI unavailable'
      ? 'The last reply failed. Try again.'
      : 'Learning mode · no API key needed'

  return <div className="page-content tutor-page"><PageIntro eyebrow="A PATIENT PAIR PROGRAMMER" title="AI tutor" description="Ask about a concept, share an error, or request a small hint." action={<span className={`tutor-mode-badge ${tutorStatus === 'AI unavailable' ? 'tutor-mode-badge-error' : ''}`}><span />{tutorStatus}</span>} /><div className="tutor-layout"><section className="tutor-chat"><div className="chat-header"><div className="tutor-avatar"><Sparkles size={17} /></div><div><strong>Loopwise tutor</strong><span><span className="online-dot" />{tutorSubtitle}</span></div><button className="icon-button" title="New conversation" aria-label="New conversation" onClick={onNewConversation}><Plus size={17} /></button></div><div className="chat-messages">{!messages.length && <div className="chat-welcome"><div className="chat-welcome-icon"><MessageCircle size={21} /></div><span className="eyebrow">LET'S FIGURE IT OUT</span><h2>What are you working on?</h2><p>Pick a mode below: I can teach a concept, explain or fix code you attach, debug an error, give a small hint, or quiz you.</p><div className="suggestion-list"><button onClick={() => sendMessage('Explain how loops work, step by step, with one small example.')}><span><BookOpen size={15} /></span>Teach me a concept<ArrowRight size={14} /></button><button onClick={() => sendMessage('I got an error. Can you help me understand it?')}><span><Bug size={15} /></span>Debug an error<ArrowRight size={14} /></button><button onClick={() => sendMessage('Quiz me on variables with three options.')}><span><ListChecks size={15} /></span>Check my knowledge<ArrowRight size={14} /></button></div></div>}{messages.map((message) => <TutorMessage key={message.id} message={message} displayName={progress.displayName} onRetry={retryMessage} onSendCode={onSendToPlayground} />)}{pending && <div className="chat-message message-assistant"><span className="message-avatar"><Sparkles size={14} /></span><div><div className="message-meta"><strong>Loopwise tutor</strong>{modeInfo && <span className="message-mode">{modeInfo.label}</span>}</div><div className="typing-indicator"><i /><i /><i /></div></div></div>}<div ref={bottomRef} /></div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); sendMessage() }}><div className="tutor-mode-row" role="group" aria-label="Tutor mode">{TUTOR_MODES.map((mode) => { const ModeIcon = mode.icon; return <button key={mode.id} type="button" className={`tutor-mode-button ${tutorMode === mode.id ? 'tutor-mode-active' : ''}`} onClick={() => setTutorMode(mode.id)}><ModeIcon size={13} />{mode.label}</button> })}</div><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={modeInfo.placeholder} rows={2} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() } }} /><div className="composer-tools"><button type="button" className={`editor-action ${attachedCode ? 'attach-active' : ''}`} onClick={() => { setAttachedCode((value) => !value); setPrefillCode('') }}><Code2 size={15} />{attachedCode ? (prefillCode ? 'Mistake code attached' : 'Code attached') : 'Attach code'}</button><span>Enter to send · Shift + Enter for a new line</span><Button variant="dark" type="submit" disabled={!draft.trim() || pending}><Send size={14} />Send</Button></div></form></section><aside className="tutor-context"><span className="eyebrow">LEARNING CONTEXT</span><h2>Made for your pace</h2><p>Your tutor uses your question, lesson, and skill level to keep its guidance approachable.</p><div className="context-row"><span className="context-icon"><GraduationCap size={16} /></span><div><small>Current level</small><strong>{progress.skillLevel}</strong></div></div><div className="context-row"><span className="context-icon"><BookOpen size={16} /></span><div><small>Lessons completed</small><strong>{progress.lessonsCompleted.length}</strong></div></div><div className="context-row"><span className="context-icon"><Code2 size={16} /></span><div><small>Practice attempts</small><strong>{progress.attempts.length}</strong></div></div><div className="context-row"><span className="context-icon"><Bug size={16} /></span><div><small>Unresolved mistakes</small><strong>{(progress.errorHistory || []).filter((row) => !row.resolved).length}</strong></div></div><div className="privacy-note"><LockKeyhole size={15} /><span>{isSignedIn ? 'Conversations are saved to your account and restored on any device.' : 'Sign in to save this conversation across devices.'}</span></div></aside></div></div>
}

function ProgressPage({ progress, lessons, loading = false }) {
  const builtInLessons = lessons.filter((lesson) => !lesson.isCustom)
  const personal = buildPersonalization(progress, { lessons: builtInLessons, exercises: practiceExercises })
  const courseStats = courseCatalog.map((course) => {
    const courseLessons = builtInLessons.filter((lesson) => lesson.language === course.id)
    const courseIds = new Set(courseLessons.map((lesson) => lesson.id))
    const languageAttempts = progress.attempts.filter((attempt) => attempt.language === course.id)
    const completed = progress.lessonsCompleted.filter((id) => courseIds.has(id)).length
    const graded = languageAttempts.filter((attempt) => Number.isFinite(Number(attempt.score)))
    return {
      ...course,
      total: courseLessons.length,
      completed,
      started: (progress.lessonsStarted || []).filter((id) => courseIds.has(id)).length,
      attempted: languageAttempts.length,
      passed: languageAttempts.filter((attempt) => attempt.passed).length,
      avgScore: graded.length ? Math.round(graded.reduce((total, attempt) => total + Number(attempt.score), 0) / graded.length) : null,
      percent: courseLessons.length ? Math.round((completed / courseLessons.length) * 100) : 0,
    }
  })
  const totalLessons = builtInLessons.length
  const totalCompleted = progress.lessonsCompleted.filter((id) => builtInLessons.some((lesson) => lesson.id === id)).length
  const plan = skillLevelPlan(totalCompleted, totalLessons)
  const corrected = countCorrectedAttempts(progress.attempts)
  const topics = [...new Set(builtInLessons.map((lesson) => lesson.topic))]
  const attemptsByTopic = topics.map((topic) => {
    const lesson = builtInLessons.find((item) => item.topic === topic)
    const topicAttempts = progress.attempts.filter((attempt) => attempt.topic === topic)
    return { topic, language: lesson?.language === 'html' ? 'HTML' : 'JS', count: topicAttempts.length, passed: topicAttempts.filter((attempt) => attempt.passed).length }
  })
  const levelSteps = [['Beginner', 0], ['Intermediate', plan.intermediateAt], ['Advanced', plan.advancedAt]]
  const activeMastery = personal.mastery.filter((entry) => entry.status !== 'Not Started')
  const activityMax = Math.max(1, ...personal.weekly.map((day) => day.count))
  const trendLabel = personal.improvement.trend === 'improving' ? 'Improving' : personal.improvement.trend === 'slipping' ? 'Needs review' : personal.improvement.trend === 'steady' ? 'Steady' : 'Not enough attempts yet'
  return <div className="page-content"><PageIntro eyebrow="NOTICE YOUR PROGRESS" title="My progress" description="A clear picture of what you have practiced, how strong it is, and what comes next." action={<span className="learning-count"><Activity size={15} />{totalCompleted} of {totalLessons} lessons complete</span>} />
    {loading && <div className="page-loading"><RefreshCw size={14} />Syncing your cloud progress…</div>}
    <div className="progress-metrics">
      <Metric label="Average score" value={personal.avgScore === null ? '—' : `${personal.avgScore}%`} icon={Award} detail={personal.avgScore === null ? 'Submit an exercise to start' : 'Across graded checks'} />
      <Metric label="Pass rate" value={personal.passRate === null ? '—' : `${Math.round(personal.passRate * 100)}%`} icon={CheckCircle2} detail={`${personal.passedAttempts} of ${personal.attempts} attempts passed`} />
      <Metric label="Practice time" value={formatDuration(personal.totalSeconds)} icon={Clock3} detail={`${formatDuration(personal.practiceSeconds)} coding · ${formatDuration(personal.lessonSeconds)} lessons`} />
      <Metric label="Exercises passed" value={`${personal.exercisesPassed}/${practiceExercises.length}`} icon={ListChecks} detail={`${personal.unresolvedMistakes} open mistake${personal.unresolvedMistakes === 1 ? '' : 's'}`} />
    </div>
    <div className="progress-language-grid">{courseStats.map((course) => {
      const CourseIcon = course.icon
      return <section className="progress-score-panel" key={course.id}>
        <div className="progress-score-heading"><div><span className="eyebrow"><CourseIcon size={12} />{`${course.name.toUpperCase()} PATH`}</span><h2>{course.title}</h2></div><div className="progress-ring" style={{ '--progress': `${course.percent}%` }}><strong>{course.percent}<small>%</small></strong></div></div>
        <div className="progress-track"><span style={{ width: `${course.percent}%` }} /></div>
        <div className="score-details"><span><CheckCircle2 size={15} />{course.completed} of {course.total} lessons completed</span><span><BookOpen size={15} />{course.started} started</span><span><Code2 size={15} />{course.attempted} exercises attempted</span><span><Award size={15} />{course.passed} passed{course.avgScore !== null ? ` · ${course.avgScore}% avg` : ''}</span></div>
      </section>
    })}</div>
    <div className="progress-top-grid">
      <section className="topic-progress-section"><div className="panel-heading"><div><span className="eyebrow">PRACTICE AREAS</span><h2>Topics explored</h2></div><span className="topics-caption">{topics.length} course topics</span></div><div className="topic-table"><div className="topic-table-header"><span>TOPIC</span><span>LANGUAGE</span><span>ATTEMPTS</span><span>PASSED</span><span>ACTIVITY</span></div>{attemptsByTopic.map((item) => <div className="topic-table-row" key={item.topic}><span>{item.topic}</span><span className={`topic-language topic-language-${item.language.toLowerCase()}`}>{item.language}</span><span>{item.count}</span><span>{item.passed}</span><span className="topic-mini-track"><i style={{ width: item.count ? `${(item.passed / item.count) * 100}%` : '0%' }} /></span></div>)}</div></section>
      <section className="progress-focus-panel"><span className="eyebrow">SKILL PROFILE</span><div className="skill-profile"><div className="skill-icon"><Target size={19} /></div><div><strong>{progress.skillLevel}</strong><span>Unlocked from lesson completion</span></div></div><div className="skill-level-steps">{levelSteps.map(([name, at]) => <span key={name} className={progress.skillLevel === name ? 'skill-step-active' : totalCompleted >= at ? 'skill-step-done' : ''}><strong>{name}</strong><small>{at ? `${at} lessons` : 'Start here'}</small></span>)}</div><p>{plan.nextLevel ? `${plan.lessonsToNext} more completed lesson${plan.lessonsToNext === 1 ? '' : 's'} to reach ${plan.nextLevel}.` : 'You have reached the highest level. Keep practicing to stay sharp.'} Levels unlock automatically: Intermediate at 15 completed lessons, Advanced at half of the built-in course.</p><div className="score-details"><span><ListChecks size={15} />{progress.quizAttempts.length} knowledge checks</span><span><CheckCircle2 size={15} />{corrected} errors corrected</span><span className={`trend-value trend-${personal.improvement.trend}`}><Activity size={15} />{trendLabel}</span></div></section>
    </div>
    <div className="progress-insights">
      <section className="dashboard-activity progress-week-panel">
        <div className="panel-heading"><div><span className="eyebrow">LAST 7 DAYS</span><h2>Weekly activity</h2></div><span className="topics-caption">{personal.weekActivities} activities</span></div>
        <div className="activity-body">
          <div className="activity-bars">{personal.weekly.map((day) => <div className="activity-bar" key={day.key}><div className="activity-bar-track"><span className={day.count ? 'activity-bar-filled' : ''} style={{ height: `${day.count ? Math.max(12, (day.count / activityMax) * 100) : 4}%` }} /></div><strong>{day.count}</strong><small>{day.label}</small></div>)}</div>
          <div className="activity-summary"><div><strong>{personal.weekActivities}</strong><span>activities this week</span></div><div><strong>{formatDuration(personal.practiceSeconds)}</strong><span>time spent coding</span></div><div><strong>{personal.masterySummary.mastered}</strong><span>topics mastered</span></div></div>
        </div>
      </section>
      <section className="mastery-panel progress-mastery-panel">
        <div className="panel-heading"><div><span className="eyebrow">MASTERY</span><h2>Topic strength</h2></div><span className="topics-caption">{personal.masterySummary.mastered} mastered · {personal.masterySummary.needsPractice} to review</span></div>
        {activeMastery.length ? <div className="mastery-strip">{activeMastery.map((entry) => <div key={entry.topic} className={`mastery-chip mastery-${entry.status.toLowerCase().replaceAll(' ', '-')}`}><span className="mastery-topic">{entry.topic}</span><strong>{entry.status}</strong><small>{entry.completed}/{entry.lessons || '—'} lessons · {entry.passed}/{entry.attempts} attempts{entry.unresolved ? ` · ${entry.unresolved} open` : ''}</small></div>)}</div> : <div className="empty-inline"><div className="empty-glyph"><Target size={18} /></div><div><strong>Mastery starts with practice</strong><span>Finish a lesson or attempt an exercise to build your topic profile.</span></div></div>}
      </section>
    </div>
    <div className="progress-note"><Lightbulb size={17} /><p><strong>A useful next step:</strong> {personal.recommendations.length ? `try “${personal.recommendations[0].exercise.title}” — ${personal.recommendations[0].reason}.` : 'revisit a topic where a recent attempt needed another try. Your mistakes are part of the learning record, not a score.'}</p></div></div>
}

function MistakeHistoryPage({ progress, lessons, loading = false, onOpenLesson, onNavigate, onPracticeExercise, onAskTutor }) {
  const rows = progress.errorHistory || []
  const summary = summarizeMistakes(rows)
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const search = query.trim().toLowerCase()
  const lessonsByTopic = new Map(lessons.filter((lesson) => !lesson.isCustom && lesson.topic).map((lesson) => [lesson.topic.toLowerCase(), lesson]))
  const exerciseByTopic = new Map(practiceExercises.map((exercise) => [exercise.topic.toLowerCase(), exercise]))
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]))
  const exerciseById = new Map(practiceExercises.map((exercise) => [exercise.id, exercise]))
  const visibleRows = rows.filter((row) => {
    if (status === 'open' && row.resolved) return false
    if (status === 'resolved' && !row.resolved) return false
    if (!search) return true
    return `${row.topic} ${row.errorType} ${row.errorMessage} ${row.language || ''} ${row.lessonRef || ''} ${row.exerciseRef || ''}`.toLowerCase().includes(search)
  })
  return <div className="page-content">
    <PageIntro eyebrow="TURN MISTAKES INTO PROGRESS" title="Mistake history" description="Every failed attempt is saved so you can spot patterns and close the gaps." action={<span className="learning-count"><Bug size={15} />{summary.total} recorded</span>} />
    {loading && <div className="page-loading"><RefreshCw size={14} />Syncing your cloud progress…</div>}
    <div className="mistake-metrics">
      <Metric label="To work on" value={summary.unresolved} icon={Target} detail="Unresolved mistakes" compact />
      <Metric label="Recurring topics" value={summary.recurring.length} icon={RefreshCw} detail="Topics with repeat mistakes" compact />
      <Metric label="Corrected" value={summary.resolved} icon={CheckCircle2} detail="Fixed by a later pass" compact />
    </div>
    {!rows.length
      ? <div className="empty-state"><Bug size={22} /><strong>No mistakes recorded yet</strong><span>When an exercise does not pass, it appears here with the topic and message so you can revisit it.</span></div>
      : <>
        <section className="mistake-topics"><div className="panel-heading"><div><span className="eyebrow">PATTERNS</span><h2>Topics to revisit</h2></div></div><div className="mistake-topic-grid">{summary.topics.map((entry) => {
          const lesson = lessonsByTopic.get(entry.topic.toLowerCase())
          const exercise = exerciseByTopic.get(entry.topic.toLowerCase())
          const primaryAction = lesson ? () => onOpenLesson(lesson) : exercise ? () => onPracticeExercise(exercise.id) : () => onNavigate('practice')
          return <article className={`mistake-topic-card ${entry.unresolved ? '' : 'mistake-topic-clear'}`} key={entry.topic}><div className="mistake-topic-head"><span className="lesson-tag">{entry.topic}</span><span className={`mistake-count ${entry.unresolved ? 'mistake-count-open' : ''}`}>{entry.unresolved ? `${entry.unresolved} open` : 'Resolved'}</span></div><strong>{entry.unresolved ? `${entry.total} mistake${entry.total === 1 ? '' : 's'} recorded` : 'Corrected in a later attempt'}</strong><small>{entry.lastError || 'No message recorded'}</small><div className="mistake-topic-actions"><Button onClick={primaryAction}>{lesson ? 'Revisit lesson' : exercise ? 'Practice exercise' : 'Practice this topic'}<ArrowRight size={14} /></Button>{lesson && exercise && <button className="text-link" onClick={() => onPracticeExercise(exercise.id)}>Practice exercise<ArrowUpRight size={13} /></button>}{!exercise && entry.unresolved > 0 && <button className="text-link" onClick={() => onNavigate('tutor')}>Ask the tutor<ArrowUpRight size={13} /></button>}</div></article>
        })}</div></section>
        <section className="mistake-log"><div className="panel-heading"><div><span className="eyebrow">THE LOG</span><h2>Recent mistakes</h2></div><span className="recommendation-icon"><History size={16} /></span></div>
          <div className="filter-row mistake-filters"><label className="search-wrap"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topic, message, or file" aria-label="Search mistakes" /></label><div className="filter-controls"><div className="mistake-filter-pills" role="group" aria-label="Filter mistakes">{['all', 'open', 'resolved'].map((value) => <button key={value} type="button" className={`mistake-filter-pill ${status === value ? 'mistake-filter-active' : ''}`} onClick={() => setStatus(value)}>{value === 'all' ? 'All' : value === 'open' ? `Open (${summary.unresolved})` : `Corrected (${summary.resolved})`}</button>)}</div><span className="topics-caption">{visibleRows.length} shown</span></div></div>
          {visibleRows.length ? <div className="mistake-table">{visibleRows.slice(0, 40).map((row) => {
            const lesson = row.lessonRef ? lessonById.get(row.lessonRef) : null
            const exercise = row.exerciseRef ? exerciseById.get(row.exerciseRef) : null
            return <div className={`mistake-row ${row.resolved ? 'mistake-row-resolved' : ''}`} key={row.id}>
              <span className={`attempt-status ${row.resolved ? 'attempt-passed' : 'attempt-review'}`}>{row.resolved ? <Check size={14} /> : <RotateCcw size={14} />}</span>
              <div className="mistake-row-copy">
                <strong>{row.topic || 'General practice'} <span className="mistake-type">{row.errorType || 'incorrect output'}</span>{row.language && <span className="mistake-language">{row.language === 'html' ? 'HTML' : row.language === 'javascript' ? 'JS' : row.language}</span>}{row.occurrences > 1 && <span className="mistake-occurrences">×{row.occurrences}</span>}</strong>
                <span className="mistake-message">{row.errorMessage || 'No message recorded'}</span>
                {(lesson || exercise) && <span className="mistake-refs">{lesson ? `Lesson: ${lesson.title}` : `Exercise: ${exercise.title}`}</span>}
                {row.suggestedFix && <span className="mistake-fix"><strong>Suggested fix:</strong> {row.suggestedFix}</span>}
                {row.aiExplanation && <details className="mistake-details"><summary>AI explanation</summary><p>{row.aiExplanation}</p></details>}
                {row.codeExcerpt && <details className="mistake-code"><summary>Show my code</summary><pre>{row.codeExcerpt}</pre></details>}
              </div>
              <div className="mistake-row-actions">
                {exercise && <button type="button" className="text-link" onClick={() => onPracticeExercise(exercise.id)}>Practice<ArrowRight size={13} /></button>}
                {lesson && <button type="button" className="text-link" onClick={() => onOpenLesson(lesson)}>Revisit<ArrowUpRight size={13} /></button>}
                <button type="button" className="text-link" onClick={() => onAskTutor(row)}><MessageCircle size={13} />Ask tutor</button>
              </div>
              <span className="mistake-date">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : ''}</span>
              <span className={`result-label mistake-inline-status ${row.resolved ? 'result-good' : 'result-retry'}`}>{row.resolved ? 'Corrected' : 'Open'}</span>
            </div>
          })}</div> : <div className="empty-inline"><Bug size={18} /><div><strong>No mistakes match this filter</strong><span>Try “All” or clear the search to see the full log.</span></div></div>}
        </section>
      </>}
  </div>
}

function HistoryPage({ progress, lessons = [], loading = false }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]))
  const completed = new Set(progress.lessonsCompleted || [])
  const entries = []
  for (const attempt of progress.attempts) {
    entries.push({
      id: `attempt-${attempt.id}`,
      kind: 'exercise',
      title: attempt.title || 'Coding attempt',
      topic: attempt.topic || 'Practice',
      detail: attempt.language === 'html' ? 'HTML exercise' : 'JavaScript exercise',
      result: attempt.passed ? 'Passed' : 'Needs another try',
      passed: attempt.passed,
      createdAt: attempt.createdAt,
    })
  }
  for (const quiz of progress.quizAttempts ?? []) {
    entries.push({
      id: `quiz-${quiz.id}`,
      kind: 'quiz',
      title: `${lessonById.get(quiz.lessonId)?.title || lessons.find((lesson) => lesson.id === quiz.lessonId)?.title || 'Lesson'} knowledge check`,
      topic: 'Knowledge check',
      detail: `Scored ${quiz.score} of ${quiz.totalQuestions}`,
      result: quiz.score === quiz.totalQuestions ? 'Passed' : 'Needs another try',
      passed: quiz.score === quiz.totalQuestions,
      createdAt: quiz.completedAt,
    })
  }
  for (const [lessonId, completedAt] of Object.entries(progress.lessonCompletedAt || {})) {
    const lesson = lessonById.get(lessonId)
    entries.push({
      id: `lesson-completed-${lessonId}`,
      kind: 'lesson',
      title: lesson?.title || lessonId,
      topic: lesson?.topic || 'Lesson',
      detail: lesson ? `${lesson.level} · ${lesson.language === 'html' ? 'HTML' : 'JavaScript'}` : 'Completed',
      result: 'Completed',
      passed: true,
      createdAt: completedAt,
    })
  }
  for (const [lessonId, startedAt] of Object.entries(progress.lessonStartedAt || {})) {
    if (completed.has(lessonId)) continue
    const lesson = lessonById.get(lessonId)
    entries.push({
      id: `lesson-opened-${lessonId}`,
      kind: 'lesson',
      title: lesson?.title || lessonId,
      topic: lesson?.topic || 'Lesson',
      detail: 'Opened lesson workspace',
      result: 'In progress',
      passed: null,
      createdAt: startedAt,
    })
  }
  for (const message of progress.messages || []) {
    if (message.role !== 'user') continue
    entries.push({
      id: `tutor-${message.id}`,
      kind: 'tutor',
      title: 'Tutor conversation',
      topic: 'AI tutor',
      detail: String(message.content || '').split('\n')[0].slice(0, 90),
      result: 'Asked',
      passed: null,
      createdAt: message.createdAt,
    })
  }
  const sorted = entries.sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0))
  const search = query.trim().toLowerCase()
  const visible = sorted.filter((entry) => {
    if (filter !== 'all' && entry.kind !== filter) return false
    if (!search) return true
    return `${entry.title} ${entry.topic} ${entry.detail}`.toLowerCase().includes(search)
  })
  const kindMeta = {
    exercise: { label: 'Exercise', icon: Code2 },
    lesson: { label: 'Lesson', icon: BookOpen },
    quiz: { label: 'Quiz', icon: ListChecks },
    tutor: { label: 'Tutor', icon: MessageCircle },
  }
  const filters = [['all', 'All'], ['lesson', 'Lessons'], ['exercise', 'Exercises'], ['quiz', 'Quizzes'], ['tutor', 'Tutor chats']]
  return <div className="page-content"><PageIntro eyebrow="EVERY TRY COUNTS" title="Learning history" description="Lessons, exercises, knowledge checks, and tutor conversations in one timeline." action={<span className="learning-count"><History size={15} />{sorted.length} events</span>} />
    {loading && <div className="page-loading"><RefreshCw size={14} />Syncing your cloud progress…</div>}
    {sorted.length ? <>
      <div className="filter-row history-filters"><label className="search-wrap"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your history" aria-label="Search learning history" /></label><div className="filter-controls"><div className="mistake-filter-pills" role="group" aria-label="Filter history">{filters.map(([value, label]) => <button key={value} type="button" className={`mistake-filter-pill ${filter === value ? 'mistake-filter-active' : ''}`} onClick={() => setFilter(value)}>{label}</button>)}</div><span className="topics-caption">{visible.length} shown</span></div></div>
      {visible.length ? <section className="history-table-wrap"><div className="history-table"><div className="history-header"><span>ACTIVITY</span><span>TOPIC</span><span>RESULT</span><span>DATE</span></div>{visible.map((entry) => {
        const meta = kindMeta[entry.kind]
        const EntryIcon = meta.icon
        return <div className="history-row" key={entry.id}>
          <div className="history-exercise"><span className={`attempt-status ${entry.passed === true ? 'attempt-passed' : entry.passed === false ? 'attempt-review' : 'attempt-neutral'}`}><EntryIcon size={14} /></span><span><strong>{entry.title}</strong><small>{meta.label} · {entry.detail}</small></span></div>
          <span>{entry.topic}</span>
          <span className={`history-result ${entry.passed === true ? 'result-good' : entry.passed === false ? 'result-retry' : 'result-neutral'}`}>{entry.result}</span>
          <span>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}</span>
        </div>
      })}</div></section> : <div className="empty-inline"><History size={18} /><div><strong>No events match these filters</strong><span>Try “All” or clear the search to see your timeline.</span></div></div>}
    </> : <div className="history-empty"><div className="empty-glyph"><History size={20} /></div><h2>Your learning history starts with your first attempt</h2><p>When you open a lesson, submit an exercise, answer a check, or ask the tutor, it appears here. Earlier activity stays visible so you can review your progress.</p><span><ShieldCheck size={15} />Saved while you are signed in</span></div>}</div>
}

function AuthPanel({ authUser, onSignOut }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function authenticate(mode) {
    if (!email.trim() || password.length < 8) {
      setMessage('Enter a valid email address and a password with at least 8 characters.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password })
      if (result.error) setMessage(result.error.message)
      else setMessage(mode === 'signup' && !result.data.session ? 'Check your email to confirm your new account.' : 'You are signed in.')
    } catch {
      setMessage('Could not reach Supabase. Check your connection and project settings.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="auth-panel"><div className="settings-section-heading"><span className="settings-section-icon"><LockKeyhole size={16} /></span><div><h2>Account & cloud sync</h2><p>{authUser ? 'Your learning records are linked to your account.' : 'Sign in to sync progress securely with Supabase.'}</p></div></div>{!isCloudConfigured ? <div className="auth-unavailable">Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then restart the app to enable authentication.</div> : authUser ? <div className="auth-signed-in"><div><span className="online-dot" /><strong>{authUser.email}</strong></div><Button onClick={onSignOut}><LockKeyhole size={14} />Sign out</Button></div> : <form onSubmit={(event) => { event.preventDefault(); authenticate('signin') }}><label className="field-label">Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="field-label">Password<input type="password" autoComplete="current-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><div className="auth-actions"><Button variant="dark" type="submit" disabled={busy}>{busy ? 'Please wait...' : 'Sign in'}</Button><button type="button" className="auth-signup" disabled={busy} onClick={() => authenticate('signup')}>Create account</button></div>{message && <p className="auth-message" role="status">{message}</p>}</form>}</section>
}

const countryOptions = ['Australia', 'Brazil', 'Canada', 'China', 'France', 'Germany', 'India', 'Indonesia', 'Italy', 'Japan', 'Mexico', 'Netherlands', 'Nigeria', 'Philippines', 'Poland', 'Singapore', 'South Africa', 'South Korea', 'Spain', 'Sweden', 'United Kingdom', 'United States', 'Other']

function SettingsPage({ progress, authUser, onSignOut, onSave }) {
  const [tab, setTab] = useState('profile')
  const [message, setMessage] = useState('')
  const fileRef = useRef(null)
  const [form, setForm] = useState(() => {
    const [first = '', ...rest] = (progress.displayName && progress.displayName !== 'Learner' ? progress.displayName : '').split(' ')
    return {
      firstName: progress.firstName || first,
      lastName: progress.lastName || rest.join(' '),
      skillLevel: progress.skillLevel,
      preferredLanguage: progress.preferredLanguage,
      country: progress.country || '',
      avatar: progress.avatar || '',
      notifications: { streakReminder: true, lessonUpdates: true, productNews: false, ...progress.notifications },
    }
  })

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function updateNotification(name) {
    setForm((current) => ({ ...current, notifications: { ...current.notifications, [name]: !current.notifications[name] } }))
  }

  function readAvatar(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setMessage('Choose a PNG, JPG, or GIF image.'); return }
    if (file.size > 500_000) { setMessage('Profile photo must be 500 KB or smaller.'); return }
    const reader = new FileReader()
    reader.onload = () => { setForm((current) => ({ ...current, avatar: String(reader.result || '') })); setMessage('Photo ready. Save changes to keep it.') }
    reader.readAsDataURL(file)
  }

  function saveChanges() {
    const displayName = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ') || 'Learner'
    onSave({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      displayName,
      skillLevel: form.skillLevel,
      preferredLanguage: form.preferredLanguage,
      country: form.country,
      avatar: form.avatar,
      notifications: form.notifications,
    })
    setMessage(authUser ? 'Your profile changes are saved.' : 'Saved on this device. Sign in to sync your profile.')
  }

  function cancelChanges() {
    const [first = '', ...rest] = (progress.displayName && progress.displayName !== 'Learner' ? progress.displayName : '').split(' ')
    setForm({
      firstName: progress.firstName || first,
      lastName: progress.lastName || rest.join(' '),
      skillLevel: progress.skillLevel,
      preferredLanguage: progress.preferredLanguage,
      country: progress.country || '',
      avatar: progress.avatar || '',
      notifications: { streakReminder: true, lessonUpdates: true, productNews: false, ...progress.notifications },
    })
    setMessage('Changes discarded.')
  }

  return <div className="page-content settings-page">
    <div className="settings-heading">
      <div><div className="eyebrow">YOUR ACCOUNT</div><h1>Settings</h1><p>Manage your profile, password, and notification preferences.</p></div>
      <div className="settings-heading-actions">
        <Button onClick={cancelChanges}>Cancel</Button>
        <Button variant="dark" onClick={saveChanges}><Check size={15} />Save changes</Button>
      </div>
    </div>
    <div className="settings-tabs" role="tablist">
      <button className={tab === 'profile' ? 'settings-tab-active' : ''} onClick={() => setTab('profile')}><UserRound size={15} />My profile</button>
      <button className={tab === 'password' ? 'settings-tab-active' : ''} onClick={() => setTab('password')}><KeyRound size={15} />Password</button>
      <button className={tab === 'notifications' ? 'settings-tab-active' : ''} onClick={() => setTab('notifications')}><Bell size={15} />Notifications</button>
    </div>
    <div className="settings-layout">
      <div className="settings-stack">
        {tab === 'profile' && <>
          <section className="settings-form">
            <div className="settings-section-heading"><span className="settings-section-icon"><Camera size={16} /></span><div><h2>Your photo</h2><p>This is shown in the sidebar and on shared lessons.</p></div></div>
            <div className="avatar-uploader">
              <span className="avatar-preview">{form.avatar ? <img src={form.avatar} alt="Profile preview" /> : <UserRound size={26} />}</span>
              <div className="avatar-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); readAvatar(event.dataTransfer.files?.[0]) }}>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif" hidden onChange={(event) => readAvatar(event.target.files?.[0])} />
                <button type="button" className="avatar-upload-button" onClick={() => fileRef.current?.click()}><Upload size={14} />Click to upload</button>
                <span>or drag and drop · PNG, JPG, GIF up to 500 KB</span>
              </div>
              {form.avatar && <button type="button" className="avatar-remove" onClick={() => setForm((current) => ({ ...current, avatar: '' }))}><Trash2 size={14} />Remove</button>}
            </div>
          </section>
          <section className="settings-form">
            <div className="settings-section-heading"><span className="settings-section-icon"><UserRound size={16} /></span><div><h2>Personal information</h2><p>Your name and learning level help the tutor tailor its guidance.</p></div></div>
            <div className="settings-field-grid">
              <label className="field-label">First name<input name="firstName" value={form.firstName} onChange={updateField} maxLength={50} placeholder="Alex" /></label>
              <label className="field-label">Last name<input name="lastName" value={form.lastName} onChange={updateField} maxLength={50} placeholder="Rivera" /></label>
            </div>
            <label className="field-label">Email address<span className="field-with-icon"><input value={authUser?.email || 'Sign in to link an email'} readOnly /><LockKeyhole size={14} /></span></label>
            <div className="settings-field-grid">
              <label className="field-label">Role<span className="field-with-icon"><input value={form.skillLevel} readOnly /><Target size={14} /></span><small className="field-hint">Unlocks automatically: 15 completed lessons for Intermediate, half the course for Advanced.</small></label>
              <label className="field-label">Preferred language<select name="preferredLanguage" value={form.preferredLanguage} onChange={updateField}><option>JavaScript</option><option>HTML</option><option>HTML &amp; CSS</option><option>Python</option></select></label>
            </div>
            <label className="field-label">Country<span className="field-with-icon"><Globe size={14} /><select name="country" value={form.country} onChange={updateField}><option value="">Select your country</option>{countryOptions.map((country) => <option key={country}>{country}</option>)}</select></span></label>
          </section>
        </>}
        {tab === 'password' && <PasswordForm authUser={authUser} />}
        {tab === 'notifications' && <section className="settings-form"><div className="settings-section-heading"><span className="settings-section-icon"><Bell size={16} /></span><div><h2>Notifications</h2><p>Choose what you want to hear about. Preferences are saved on this device.</p></div></div><div className="notification-list">{[
          ['streakReminder', 'Streak reminders', 'A nudge if your daily three-lesson goal is slipping.'],
          ['lessonUpdates', 'New lessons', 'Hear when new JavaScript or HTML lessons arrive.'],
          ['productNews', 'Product updates', 'Occasional news about Loopwise features.'],
        ].map(([key, title, description]) => <label className="notification-row" key={key}><div><strong>{title}</strong><span>{description}</span></div><button type="button" role="switch" aria-checked={form.notifications[key]} className={`switch ${form.notifications[key] ? 'switch-on' : ''}`} onClick={() => updateNotification(key)}><span /></button></label>)}</div></section>}
        {message && <p className="settings-message" role="status">{message}</p>}
      </div>
      <aside className="settings-side">
        <section className="settings-connection">
          <span className="eyebrow">ACCOUNT</span>
          <div className="settings-account"><span className="avatar avatar-large">{form.avatar ? <img src={form.avatar} alt="" /> : (form.firstName || 'L').slice(0, 1).toUpperCase()}</span><div><strong>{[form.firstName, form.lastName].filter(Boolean).join(' ') || 'Learner'}</strong><span>{authUser?.email || 'Not signed in'}</span></div></div>
          <h2>{authUser ? 'Your cloud account is active' : isCloudConfigured ? 'Sign in to sync' : 'Local learning mode'}</h2>
          <p>{authUser ? 'Progress, attempts, and custom lessons sync with your private account.' : isCloudConfigured ? 'Sign in to save progress and share custom lessons with other learners.' : 'Progress is only saved while you are signed in. Add Supabase keys to enable accounts.'}</p>
          <div className="connection-status"><span className={authUser ? 'connected-dot' : ''} />{authUser ? 'Signed in and syncing' : isCloudConfigured ? 'Not signed in' : 'No cloud credentials detected'}</div>
          {authUser && <Button onClick={onSignOut}><LockKeyhole size={14} />Sign out</Button>}
          <div className="privacy-note"><LockKeyhole size={15} /><span>Never put a Supabase service-role key or AI provider key in browser environment variables.</span></div>
        </section>
        <AuthPanel authUser={authUser} onSignOut={onSignOut} />
      </aside>
    </div>
  </div>
}

function PasswordForm({ authUser }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function updatePassword(event) {
    event.preventDefault()
    if (!authUser) { setMessage('Sign in first, then you can set a new password.'); return }
    if (password.length < 8) { setMessage('Use at least 8 characters for your new password.'); return }
    if (password !== confirm) { setMessage('The two passwords do not match.'); return }
    setBusy(true)
    setMessage('')
    const { error } = await supabase.auth.updateUser({ password })
    setMessage(error ? error.message : 'Password updated. Use it the next time you sign in.')
    setBusy(false)
  }

  return <section className="settings-form">
    <div className="settings-section-heading"><span className="settings-section-icon"><KeyRound size={16} /></span><div><h2>Change password</h2><p>{authUser ? 'Choose a new password for your account.' : 'Sign in to manage your password.'}</p></div></div>
    <form onSubmit={updatePassword}>
      <label className="field-label">New password<span className="field-with-icon"><input type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" className="field-icon-button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff size={15} /> : <Eye size={15} />}</button></span></label>
      <label className="field-label">Confirm new password<input type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>
      <Button variant="dark" type="submit" disabled={busy}>{busy ? 'Updating...' : 'Update password'}</Button>
    </form>
    {message && <p className="settings-message" role="status">{message}</p>}
  </section>
}

export default App