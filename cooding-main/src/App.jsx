import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Award,
  Bell, BookOpen, Braces, Bug, Camera, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Code2, Copy, Eye, EyeOff, FileCode2, FileText, Flame, FolderOpen, Globe, GraduationCap,
  History, KeyRound, LayoutDashboard, Lightbulb, ListChecks, LockKeyhole,
  Menu, MessageCircle, Moon, Play, Plus, RefreshCw, RotateCcw, Send, Settings,
  ShieldCheck, Sparkles, Target, Terminal, Trash2, Upload, UserRound, X,
} from 'lucide-react'
import { emptyProgress, lessonQuizzes, lessons, practiceExercises, readProgress } from './data/learningContent'
import LessonStudio from './components/LessonStudio'
import { askTutor } from './services/tutorService'
import { isCloudConfigured, supabase } from './services/supabase'
import { loadCloudProgress, saveCloudAttempt, saveCloudLessonProgress, saveCloudProfile, saveCloudQuizAttempt } from './services/progressService'
import { loadTutorHistory, saveTutorMessage, startTutorConversation } from './services/tutorHistory'
import { deleteSharedCustomLesson, loadSharedCustomLessons, publishCustomLessons } from './services/customLessonService'
import { readCustomLessons, saveCustomLessons } from './services/lessonLibrary'
import { countCorrectedAttempts, matchesExpectedOutput } from './utils/progress'
import { htmlToText } from './utils/html'
import { deriveSkillLevel, skillLevelPlan } from './utils/skill'
import { PLAYGROUND_AI_NOTE, playgroundFilePayload, resolvePlaygroundFile, splitAssistantReply } from './utils/playground'
import { parseInline, parseTutorLines, parseTutorMarkdown, runnableTutorLanguage } from './utils/tutorMarkdown'
import { buildPrerequisiteMap, recentActivity, recentCompletions, recommendNextLesson, summarizeMistakes } from './utils/insights'
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

function comparableOutput(value, language) {
  if (language === 'html') return htmlToText(String(value ?? '')).replace(/\s+/g, ' ').trim()
  return String(value ?? '').trim()
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
  const tutorConversationRef = useRef(null)
  const tutorConversationPromise = useRef(null)
  const savedMessageIds = useRef(new Set())
  const tutorLanguage = currentLesson?.language === 'html' ? 'html' : 'javascript'
  const localCustomIds = new Set(customLessons.map((lesson) => lesson.id))
  const builtInIds = new Set(lessons.map((lesson) => lesson.id))
  const communityLessons = sharedLessons.filter((lesson) => !localCustomIds.has(lesson.id) && !builtInIds.has(lesson.id))
  const allLessons = [...lessons, ...customLessons, ...communityLessons]
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
    if (!authUser) return
    loadCloudProgress(authUser.id).then((cloudProgress) => {
      const customIds = new Set(customLessons.map((lesson) => lesson.id))
      setProgress((previous) => ({
        ...previous,
        ...cloudProgress,
        lessonsStarted: [...new Set([...(cloudProgress.lessonsStarted || []), ...previous.lessonsStarted.filter((id) => customIds.has(id))])],
        lessonsCompleted: [...new Set([...(cloudProgress.lessonsCompleted || []), ...previous.lessonsCompleted.filter((id) => customIds.has(id))])],
        lessonStartedAt: { ...previous.lessonStartedAt, ...cloudProgress.lessonStartedAt },
        lessonCompletedAt: { ...previous.lessonCompletedAt, ...cloudProgress.lessonCompletedAt },
        errorHistory: cloudProgress.errorHistory || [],
        attempts: [...(cloudProgress.attempts || []), ...previous.attempts.filter((attempt) => customIds.has(attempt.lessonId))],
      }))
    }).catch((error) => setToast(error instanceof Error ? `Could not load cloud progress: ${error.message}` : 'Could not load cloud progress'))
  }, [authUser, customLessons])

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
    setProgress((previous) => {
      const attempts = [savedAttempt, ...previous.attempts]
      let errorHistory = previous.errorHistory || []
      if (savedAttempt.topic) {
        if (savedAttempt.passed) {
          errorHistory = errorHistory.map((row) => (row.topic === savedAttempt.topic && !row.resolved
            ? { ...row, resolved: true, correctionSummary: 'A later attempt for this topic passed.' }
            : row))
        } else {
          errorHistory = [{
            id: `local-${savedAttempt.id}`,
            attemptId: savedAttempt.id,
            topic: savedAttempt.topic,
            errorType: savedAttempt.executionStatus === 'wrong_answer' ? 'incorrect_output' : savedAttempt.executionStatus,
            errorMessage: savedAttempt.output || 'The program ran, but its output did not match the exercise requirement.',
            resolved: false,
            createdAt: savedAttempt.createdAt,
          }, ...errorHistory]
        }
      }
      return { ...previous, attempts, errorHistory }
    })
    if (authUser && !savedAttempt.lessonId?.startsWith('custom-')) saveCloudAttempt(authUser.id, savedAttempt).catch(() => setToast('Attempt saved locally, but cloud sync failed'))
  }

  function completeLesson(lesson) {
    const completedAt = new Date().toISOString()
    if (authUser) {
      setProgress((previous) => ({ ...previous, streak: recordStreakCompletion(previous.streak, new Date(), lesson.id) }))
    }
    setProgress((previous) => ({
      ...previous,
      lessonsCompleted: previous.lessonsCompleted.includes(lesson.id)
        ? previous.lessonsCompleted
        : [...previous.lessonsCompleted, lesson.id],
      lessonCompletedAt: { ...previous.lessonCompletedAt, [lesson.id]: previous.lessonCompletedAt?.[lesson.id] || completedAt },
    }))
    if (authUser && !lesson.isCustom) saveCloudLessonProgress(authUser.id, lesson.id, 'completed').catch(() => setToast('Lesson completed locally, but cloud sync failed'))
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

        {page === 'dashboard' && <Dashboard progress={progressView} lessons={allLessons} onOpenLesson={openLesson} onNavigate={changePage} />}
        {page === 'learn' && <LearningPath progress={progress} lessons={allLessons} authUser={authUser} onOpenLesson={openLesson} />}
        {page === 'lesson-studio' && <LessonStudio lessons={customLessons} allLessons={allLessons} onAddLessons={addCustomLessons} onDeleteLesson={deleteCustomLesson} onOpenLesson={openLesson} />}
        {page === 'lesson' && <LessonWorkspace key={currentLesson.id} lesson={currentLesson} lessons={allLessons} progress={progressView} authUser={authUser} onCodeChange={setCurrentCode} onComplete={completeLesson} onRecordAttempt={recordAttempt} onRecordQuiz={recordQuiz} onBack={() => changePage('learn')} onPrevious={() => openLesson(allLessons[Math.max(0, allLessons.findIndex((lesson) => lesson.id === currentLesson.id) - 1)])} onNext={() => openLesson(allLessons[(allLessons.findIndex((lesson) => lesson.id === currentLesson.id) + 1) % allLessons.length])} onOpenPrerequisite={openLesson} />}
        {page === 'playground' && <Playground onCodeChange={setCurrentCode} isSignedIn={Boolean(authUser)} skillLevel={progressView.skillLevel} />}
        {page === 'practice' && <Practice progress={progressView} authUser={authUser} onRecordAttempt={recordAttempt} focusExerciseId={practiceFocus} onFocusHandled={() => setPracticeFocus(null)} />}
        {page === 'tutor' && <TutorPage progress={progressView} currentCode={currentCode} currentLesson={currentLesson} tutorLanguage={tutorLanguage} isSignedIn={Boolean(authUser)} onMessagesChange={updateTutorMessages} onNewConversation={newTutorConversation} />}
        {page === 'progress' && <ProgressPage progress={progressView} lessons={allLessons} />}
        {page === 'mistakes' && <MistakeHistoryPage progress={progressView} lessons={allLessons} onOpenLesson={openLesson} onNavigate={changePage} onPracticeExercise={(exerciseId) => { setPracticeFocus(exerciseId); changePage('practice') }} />}
        {page === 'history' && <HistoryPage progress={progress} />}
        {page === 'settings' && <SettingsPage progress={progressView} authUser={authUser} onSignOut={() => supabase?.auth.signOut()} onSave={(updates) => { setProgress((previous) => ({ ...previous, ...updates })); if (authUser) saveCloudProfile(authUser.id, updates).catch((error) => setToast(error instanceof Error ? `Profile saved locally, but cloud sync failed: ${error.message}` : 'Profile saved locally, but cloud sync failed')); setToast('Profile preferences saved') }} />}
      </main>
      {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  )
}

function PageIntro({ eyebrow, title, description, action }) {
  return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function Dashboard({ progress, lessons, onOpenLesson, onNavigate }) {
  const builtInLessons = lessons.filter((lesson) => !lesson.isCustom)
  const builtInIds = new Set(builtInLessons.map((lesson) => lesson.id))
  const completed = progress.lessonsCompleted.filter((id) => builtInIds.has(id)).length
  const attempted = progress.attempts.length
  const passed = progress.attempts.filter((attempt) => attempt.passed).length
  const recommendation = recommendNextLesson(progress, builtInLessons)
  const nextLesson = recommendation?.lesson || lessons[0]
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
          <Metric label="Exercises tried" value={attempted} icon={Code2} detail={attempted ? `${passed} passed so far` : 'Your attempts show here'} />
          <Metric label="Current level" value={progress.skillLevel} icon={Target} detail="Unlocks as you complete lessons" compact />
          <Metric label="Latest quiz" value={progress.quizAttempts.length ? `${progress.quizAttempts[0].score}/${progress.quizAttempts[0].totalQuestions}` : '—'} icon={Award} detail={progress.quizAttempts.length ? 'Most recent knowledge check' : 'No checks completed'} compact />
        </div>
        <div className="course-progress-list">{courses.map((course) => <div className="course-progress-row" key={course.id}><div className="course-progress-label"><span>{course.name}</span><strong>{course.completed}/{course.total} · {course.percent}%</strong></div><div className="progress-track"><span style={{ width: `${course.percent}%` }} /></div></div>)}</div>
        <span className="snapshot-footnote">{completed} of {builtInLessons.length} learning path lessons completed</span>
      </section>
      <section className="next-panel">
        <div className="panel-heading"><div><span className="eyebrow">{progress.lessonStartedAt?.[nextLesson.id] ? 'PICK UP WHERE YOU LEFT OFF' : 'RECOMMENDED FOR YOU'}</span><h2>Recommended next</h2></div><span className="recommendation-icon"><ArrowDownRight size={17} /></span></div>
        <div className="recommendation-body"><div className="recommendation-number">{String(builtInLessons.findIndex((lesson) => lesson.id === nextLesson.id) + 1).padStart(2, '0')}</div><div><span className="lesson-tag">{nextLesson.topic}</span><h3>{nextLesson.title}</h3><p>{recommendation?.reason || nextLesson.description}</p></div></div>
        <div className="recommendation-footer"><span><Clock3 size={14} />{nextLesson.minutes} min <i /> {nextLesson.level}</span><Button onClick={() => onOpenLesson(nextLesson)}>{progress.lessonStartedAt?.[nextLesson.id] ? 'Resume lesson' : 'Start lesson'}<ArrowRight size={15} /></Button></div>
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
          <div className="activity-summary"><div><strong>{weekTotal}</strong><span>activities this week</span></div><div><strong>{weekLessons}</strong><span>lessons completed</span></div><div><strong>{mistakes.unresolved}</strong><span>mistakes to revisit</span></div></div>
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
  const builtInLessons = lessons.filter((lesson) => !lesson.isCustom)
  const prerequisites = buildPrerequisiteMap(builtInLessons)
  const myCustomLessons = lessons.filter((lesson) => lesson.isCustom && !lesson.ownerId)
  const sharedLessons = lessons.filter((lesson) => lesson.isCustom && lesson.ownerId)
  const matchesFilters = (lesson) => (language === 'Custom lessons' || language === 'All languages' || lesson.language === language.toLowerCase()) && (level === 'All levels' || lesson.level === level)
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
  return <div className="page-content">
    <PageIntro eyebrow="THE CURRICULUM" title="Learning path" description={`${totalBuiltIn} built-in lessons across JavaScript and HTML, plus your own custom and shared lessons.`} action={<div className="learning-count"><BookOpen size={15} />{progress.lessonsCompleted.length} / {lessons.length} complete</div>} />
    <div className="filter-row"><div className="filter-caption">COURSE <span>All learning paths</span></div><div className="filter-controls"><label className="select-wrap"><span className="sr-only">Programming language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option>All languages</option><option value="javascript">JavaScript</option><option value="html">HTML</option><option>Custom lessons</option></select><ChevronDown size={14} /></label><label className="select-wrap"><span className="sr-only">Difficulty</span><select value={level} onChange={(event) => setLevel(event.target.value)}><option>All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select><ChevronDown size={14} /></label></div></div>
    {courses.map((course) => {
      const CourseIcon = course.icon
      const percent = course.lessons.length ? Math.round((course.completed / course.lessons.length) * 100) : 0
      return <div className="course-block" key={course.id}>
        <section className="course-overview"><div className="course-symbol"><CourseIcon size={22} /></div><div className="course-summary"><div><span className="course-label">{course.lessons.length} BUILT-IN LESSONS · {course.name.toUpperCase()}</span><h2>{course.title}</h2><p>{course.description}</p></div><div className="course-progress-wrap"><div className="course-progress-label"><span>Your progress</span><strong>{course.completed}/{course.lessons.length}</strong></div><div className="progress-track"><span style={{ width: `${percent}%` }} /></div></div></div></section>
        {course.groups.map((group) => {
          const groupDone = group.lessons.filter((lesson) => progress.lessonsCompleted.includes(lesson.id)).length
          return <section key={`${course.id}-${group.level}`} className="lesson-level-group"><div className="lesson-list-heading"><h2>{group.level}</h2><span>{groupDone} of {group.lessons.length} complete</span></div><LessonRows lessons={group.lessons} progress={progress} onOpenLesson={onOpenLesson} prerequisites={prerequisites} /></section>
        })}
      </div>
    })}
    {visibleCustom.length > 0 && <section className="lesson-level-group custom-lesson-group"><div className="lesson-list-heading"><h2>Your custom lessons</h2><span>{visibleCustom.length} lessons</span></div><LessonRows lessons={visibleCustom} progress={progress} onOpenLesson={onOpenLesson} /></section>}
    {visibleShared.length > 0 && <section className="lesson-level-group custom-lesson-group"><div className="lesson-list-heading"><h2>Shared custom lessons</h2><span>{visibleShared.length} lessons</span></div><LessonRows lessons={visibleShared} progress={progress} onOpenLesson={onOpenLesson} showAuthor authUserId={authUser?.id} /></section>}
    {!visibleCount && <div className="empty-state"><BookOpen size={22} /><strong>No lessons match these filters</strong><span>Try another level or language.</span></div>}
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
  const complete = progress.lessonsCompleted.includes(lesson.id)
  const courseLessons = lessons.filter((item) => !item.isCustom && item.language === lesson.language)
  const courseIndex = courseLessons.findIndex((item) => item.id === lesson.id)
  const prerequisite = courseIndex > 0 ? courseLessons[courseIndex - 1] : null
  const prerequisiteOpen = Boolean(prerequisite && !progress.lessonsCompleted.includes(prerequisite.id))
  const referenceUrl = lesson.referenceUrl || (lesson.language === 'html' ? 'https://www.w3schools.com/html/' : 'https://www.w3schools.com/js/')
  return <div className="page-content workspace-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15} />Back to learning path</button>
    <div className="workspace-heading"><div><div className="lesson-row-meta"><span>{lesson.topic}</span><i />{lesson.level}<i /><Clock3 size={13} />{lesson.minutes} min</div><h1>{lesson.title}</h1><p>{lesson.description}</p></div><span className={`lesson-state ${complete ? 'lesson-state-done' : ''}`}>{complete ? <CheckCircle2 size={15} /> : <BookOpen size={15} />}{complete ? 'Completed' : 'In progress'}</span></div>
    {prerequisiteOpen && <div className="prereq-banner"><span className="prereq-icon"><LockKeyhole size={15} /></span><div><strong>This lesson builds on “{prerequisite.title}”</strong><span>Finish the earlier lesson first for the smoothest ride, or continue if you feel ready.</span></div><button className="text-link" onClick={() => onOpenPrerequisite(prerequisite)}>Open prerequisite<ArrowRight size={14} /></button></div>}
    <div className="workspace-grid"><section className="lesson-instructions"><div className="workspace-section-title"><span className="step-number">01</span><div><span className="eyebrow">THE IDEA</span><h2>What you will learn</h2></div></div><p className="lesson-explanation">{lesson.explanation}</p><div className="objective-box"><div className="objective-icon"><Target size={17} /></div><div><span>YOUR OBJECTIVE</span><strong>{lesson.objective}</strong></div></div><a className="reference-link" href={referenceUrl} target="_blank" rel="noreferrer">Read the W3Schools reference<ArrowUpRight size={14} /></a><div className="instruction-divider" /><div className="workspace-section-title compact-title"><span className="step-number">02</span><div><span className="eyebrow">YOUR TURN</span><h2>Try it yourself</h2></div></div><p className="exercise-prompt">Update the starter code so it produces the expected result. Run it to check your output.</p><div className="expected-output"><span>EXPECTED OUTPUT</span><code>{lesson.expectedOutput.split('\n').map((line, index) => <span key={index}>{line}</span>)}</code></div><button className="example-toggle" onClick={() => setShowExample((value) => !value)}><Lightbulb size={15} />{showExample ? 'Hide example' : 'Show example'}<ChevronDown className={showExample ? 'rotate-icon' : ''} size={14} /></button>{showExample && <pre className="example-code">{lesson.example}</pre>}</section>
      <EditorWorkspace key={lesson.id} starterCode={lesson.starterCode} language={lesson.language} expectedOutput={lesson.expectedOutput} title={lesson.title} topic={lesson.topic} onCodeChange={onCodeChange} onRecordAttempt={onRecordAttempt} hint={lesson.hint} context={lesson} lessons={lessons} isSignedIn={Boolean(authUser)} skillLevel={progress.skillLevel} onComplete={() => onComplete(lesson)} onPrevious={onPrevious} onNext={onNext} />
    </div>
    <QuizCheck lesson={lesson} onRecordQuiz={onRecordQuiz} />
  </div>
}

function QuizCheck({ lesson, onRecordQuiz }) {
  const quiz = lessonQuizzes[lesson.id]
  const [selected, setSelected] = useState(null)
  const [result, setResult] = useState('')
  if (!quiz) return null
  function checkAnswer() {
    if (selected === null) return
    const correct = selected === quiz.answer
    setResult(correct ? 'Correct. You can explain this idea now.' : 'Not quite. Revisit the explanation and try another answer.')
    onRecordQuiz({ lessonId: lesson.id, score: correct ? 1 : 0, totalQuestions: 1 })
  }
  return <section className="quiz-panel"><div className="quiz-heading"><span className="quiz-icon"><ListChecks size={17} /></span><div><span className="eyebrow">QUICK KNOWLEDGE CHECK</span><h2>Pause and check your understanding</h2></div></div><p>{quiz.question}</p><div className="quiz-options">{quiz.choices.map((choice, index) => <label className={`quiz-option ${selected === index ? 'quiz-option-selected' : ''}`} key={choice}><input type="radio" name={`quiz-${lesson.id}`} checked={selected === index} onChange={() => { setSelected(index); setResult('') }} /><span>{choice}</span></label>)}</div><div className="quiz-footer"><span className={result.startsWith('Correct') ? 'quiz-result quiz-result-correct' : 'quiz-result'}>{result}</span><Button onClick={checkAnswer} disabled={selected === null}>Check answer<ArrowRight size={14} /></Button></div></section>
}

function PlaygroundMessage({ message, files, onApply }) {
  if (message.role === 'user') return <div className="pg-msg pg-msg-user"><span className="pg-avatar">You</span><div className="pg-bubble">{message.content}</div></div>
  const parts = splitAssistantReply(message.content)
  return <div className="pg-msg"><span className="pg-avatar pg-avatar-ai"><Sparkles size={12} /></span><div className="pg-bubble">{message.mode === 'demo' && <span className="pg-mode">DEMO</span>}{message.mode === 'error' && <span className="pg-mode pg-mode-error">CONNECTION ERROR</span>}{parts.map((part, index) => part.type === 'text' ? (part.text.trim() ? <p key={index}>{part.text.trim()}</p> : null) : <div className="pg-code" key={index}><div className="pg-code-head"><span>{part.fileName || (part.language ? part.language.toUpperCase() : 'SNIPPET')}</span><button type="button" className="pg-apply" onClick={() => onApply(message.id, index, part)}>{message.applied?.includes(index) ? 'Applied' : resolvePlaygroundFile(part, files) ? `Apply to ${resolvePlaygroundFile(part, files).name}` : 'No matching file'}</button></div><pre>{part.code}</pre></div>)}</div></div>
}

function Playground({ onCodeChange, isSignedIn, skillLevel = 'Beginner' }) {
  const [files, setFiles] = useState(defaultPlaygroundFiles)
  const [activeName, setActiveName] = useState(defaultPlaygroundFiles[0].name)
  const [openTabs, setOpenTabs] = useState([defaultPlaygroundFiles[0].name])
  const [runId, setRunId] = useState(0)
  const [output, setOutput] = useState('')
  const [runStatus, setRunStatus] = useState('idle')
  const [activeOutputTab, setActiveOutputTab] = useState('output')
  const [chat, setChat] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const chatEndRef = useRef(null)

  const activeFile = files.find((file) => file.name === activeName) || files[0]

  useEffect(() => { onCodeChange?.(activeFile.content) }, [activeFile, onCodeChange])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat.length, busy])

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
    const nextCode = value ?? ''
    setFiles((current) => current.map((file) => file.name === activeName ? { ...file, content: nextCode } : file))
  }

  function runCode() {
    setActiveOutputTab('output')
    setOutput('')
    setRunStatus('running')
    setRunId((value) => value + 1)
  }

  function receiveRun(result) {
    setOutput([result.error, result.output].filter((value) => typeof value === 'string' && value.trim()).join('\n') || '(No output yet)')
    setRunStatus(result.error ? 'error' : 'success')
  }

  function resetProject() {
    setFiles(defaultPlaygroundFiles)
    setActiveName(defaultPlaygroundFiles[0].name)
    setOpenTabs([defaultPlaygroundFiles[0].name])
    setOutput('')
    setRunStatus('idle')
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
      relatedLanguage: activeFile.language,
      context: { title: 'Playground', topic: 'Playground', objective: 'Build and refine the page in index.html, styles.css, and script.js' },
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
    <PageIntro eyebrow="A SPACE TO EXPERIMENT" title="Playground" description="A small multi-file workspace: edit HTML, CSS, and JavaScript, then run the page." />
    <div className="playground-workbench">
      <aside className="file-explorer">
        <div className="explorer-head"><span>EXPLORER</span><button className="icon-button" aria-label="Reset project" title="Reset project" onClick={resetProject}><RotateCcw size={14} /></button></div>
        <div className="explorer-folder"><FolderOpen size={14} /><span>src</span></div>
        <div className="explorer-files">{files.map((file) => (
          <button key={file.name} className={`explorer-file ${file.name === activeName ? 'explorer-file-active' : ''}`} onClick={() => openFile(file.name)}>
            {fileIcon(file)}<span>{file.name}</span>
          </button>
        ))}</div>
        <div className="explorer-foot"><span>{files.length} files</span><span>Saved in this browser</span></div>
      </aside>
      <section className="editor-workspace editor-workspace-wide">
        <div className="editor-toolbar">
          <div className="editor-tabs">{openTabs.map((name) => {
            const file = files.find((item) => item.name === name)
            return <div key={name} className={`editor-tab ${name === activeName ? 'editor-tab-active' : ''}`}><button type="button" onClick={() => setActiveName(name)}>{fileIcon(file)}<span>{name}</span></button>{openTabs.length > 1 && <button type="button" className="editor-tab-close" aria-label={`Close ${name}`} onClick={() => closeTab(name)}><X size={12} /></button>}</div>
          })}</div>
          <div className="editor-controls"><span className="editor-language">{activeIcon}</span><Button variant="run" onClick={runCode} disabled={runStatus === 'running'}><Play size={14} fill="currentColor" />Run Code</Button></div>
        </div>
        <div className="monaco-wrap"><Editor height="380px" language={activeFile.language} theme="vs-dark" value={activeFile.content} onChange={updateCode} options={{ minimap: { enabled: false }, fontSize: 13, lineHeight: 22, padding: { top: 16, bottom: 12 }, scrollBeyondLastLine: false, wordWrap: 'on', automaticLayout: true, fontFamily: '"IBM Plex Mono", Consolas, monospace', lineNumbersMinChars: 3, renderLineHighlight: 'gutter', scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 }, suggestOnTriggerCharacters: true }} /></div>
        <CodeRunner key={runId} code={buildPreviewDocument(files)} language="html" runId={runId} onComplete={receiveRun} />
        <div className="output-panel"><div className="output-header"><div className="output-tabs"><button className={activeOutputTab === 'output' ? 'output-tab-active' : ''} onClick={() => setActiveOutputTab('output')}><Terminal size={14} />Output</button><button className={activeOutputTab === 'chat' ? 'output-tab-active' : ''} onClick={() => setActiveOutputTab('chat')}><Sparkles size={14} />AI chat</button></div><span className={`execution-status execution-${runStatus}`}>{runStatus === 'running' ? 'Running' : runStatus === 'success' ? 'Preview rendered' : runStatus === 'error' ? 'Error' : 'Ready'}</span></div>
          {activeOutputTab === 'output' ? <pre className={`output-content ${runStatus === 'error' ? 'output-error' : ''}`}>{output || 'Run your code to preview the page and see its visible text.'}</pre> : <div className="pg-chat">
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
        <div className="editor-footer"><div className="editor-footer-left"><button className="editor-action" onClick={() => askPlaygroundTutor('hint')} disabled={busy}><Lightbulb size={15} />Get a hint</button><button className="editor-action" onClick={() => askPlaygroundTutor('error')} disabled={busy}><CircleHelp size={15} />Explain my error</button></div><div className="editor-footer-right"><span className="safe-runtime"><ShieldCheck size={14} />Runs in an isolated browser frame</span></div></div>
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

function EditorWorkspace({ starterCode, language, expectedOutput, title, topic, onCodeChange, onRecordAttempt, hint, context, lessons = [], onComplete, onPrevious, onNext, isSignedIn = false, skillLevel = 'Beginner' }) {
  const [code, setCode] = useState(starterCode)
  const [runId, setRunId] = useState(0)
  const [output, setOutput] = useState('')
  const [runStatus, setRunStatus] = useState('idle')
  const [executionStatus, setExecutionStatus] = useState('idle')
  const [feedback, setFeedback] = useState('')
  const [activeOutputTab, setActiveOutputTab] = useState('output')
  const [busy, setBusy] = useState(false)

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
    setOutput([result.error, result.output].filter((value) => typeof value === 'string' && value.trim()).join('\n') || '(No output yet)')
    setRunStatus(result.error ? 'error' : 'success')
    setExecutionStatus(result.error ? result.executionStatus || 'runtime_error' : 'success')
  }

  function submitAnswer() {
    if (!expectedOutput) {
      setFeedback('Run your program first. Execution output and exercise correctness are tracked separately.')
      return
    }
    if (!output || runStatus === 'running') {
      setFeedback('Run your code first, then submit it for a check.')
      return
    }
    const passed = runStatus === 'success' && (language === 'html'
      ? matchesExpectedOutput(comparableOutput(output, 'html'), comparableOutput(expectedOutput, 'html'))
      : matchesExpectedOutput(output, expectedOutput))
    onRecordAttempt({ lessonId: context?.id, title, topic, passed, output, expectedOutput, language, code, executionStatus: passed ? 'accepted' : runStatus === 'error' ? executionStatus : 'wrong_answer' })
    setFeedback(passed ? 'That matches the expected output. Nice work!' : 'Not quite yet. Compare your output with the expected result, then make another attempt.')
    setActiveOutputTab('feedback')
    if (passed) onComplete?.()
  }

  async function getHint() {
    setActiveOutputTab('feedback')
    if (!isSignedIn) {
      setFeedback('Sign in from Profile & settings to use AI hints and error explanations.')
      return
    }
    setBusy(true)
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
    <div className="output-panel"><div className="output-header"><div className="output-tabs"><button className={activeOutputTab === 'output' ? 'output-tab-active' : ''} onClick={() => setActiveOutputTab('output')}><Terminal size={14} />Output</button><button className={activeOutputTab === 'feedback' ? 'output-tab-active' : ''} onClick={() => setActiveOutputTab('feedback')}><Sparkles size={14} />Feedback</button></div><span className={`execution-status execution-${runStatus}`}>{runStatus === 'running' ? 'Running' : runStatus === 'success' ? 'Execution succeeded' : runStatus === 'error' ? executionStatus === 'compile_error' ? 'Compile error' : executionStatus === 'runtime_error' ? 'Runtime error' : executionStatus === 'timeout' || executionStatus === 'time_limit' ? 'Time limit' : executionStatus === 'infrastructure_error' ? 'Service unavailable' : 'Execution failed' : 'Ready'}</span></div>
      {activeOutputTab === 'output' ? <pre className={`output-content ${runStatus === 'error' ? 'output-error' : ''}`}>{output || 'Run your code to see what happens.'}</pre> : <div className={`feedback-content ${feedback.includes('matches') ? 'feedback-success' : ''}`}>{feedback ? <TutorRichText text={feedback} /> : 'Submit your answer for a check, or ask for a hint when you need a nudge.'}</div>}
    </div>
    <div className="editor-footer"><div className="editor-footer-left"><button className="editor-action" onClick={getHint} disabled={busy}><Lightbulb size={15} />Get a hint</button><button className="editor-action" onClick={explainError} disabled={busy}><CircleHelp size={15} />Explain my error</button><button className="editor-action" onClick={submitAnswer}><CheckCircle2 size={15} />Submit answer</button></div><div className="editor-footer-right"><span className="safe-runtime"><ShieldCheck size={14} />Runs in an isolated browser frame</span>{onPrevious && <Button onClick={onPrevious} disabled={lessons.findIndex((lesson) => lesson.id === context?.id) <= 0}><ArrowLeft size={14} />Previous</Button>}{onNext && <Button onClick={onNext}>Next lesson<ArrowRight size={14} /></Button>}</div></div>
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
      iframeRef.current?.contentWindow?.stop()
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
    documentContent = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"><meta name="viewport" content="width=device-width"><style>body{font:14px system-ui;padding:16px;color:#17221e}</style>${code}<script>const runId=${runId};let sent=false;const finish=(result)=>{if(sent)return;sent=true;parent.postMessage({source:'loopwise-sandbox',runId,...result},'*')};window.onerror=()=>finish({error:'A script on the page threw an error. Check the console panel or simplify your code.',executionStatus:'runtime_error'});setTimeout(()=>{const clean=document.body.cloneNode(true);clean.querySelectorAll('script,style,noscript,template').forEach((node)=>node.remove());finish({output:((clean.innerText||clean.textContent||'').trim())||'(The page rendered without visible text)',executionStatus:'success'})},80)</script>`
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
  const attemptedTitles = new Set(progress.attempts.map((attempt) => attempt.title))
  const exercises = language === 'All languages' ? practiceExercises : practiceExercises.filter((exercise) => exercise.language === language.toLowerCase())
  const active = practiceExercises.find((exercise) => exercise.id === activeId)

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
        <p className="exercise-prompt">Run your code, compare the output, then submit your answer.</p>
        <div className="expected-output"><span>EXPECTED OUTPUT</span><code>{active.expectedOutput.split('\n').map((line, index) => <span key={index}>{line}</span>)}</code></div>
        <button className="example-toggle" onClick={() => setShowHint((value) => !value)}><Lightbulb size={15} />{showHint ? 'Hide hint' : 'Show hint'}<ChevronDown className={showHint ? 'rotate-icon' : ''} size={14} /></button>
        {showHint && <pre className="example-code">{active.hint}</pre>}
      </section>
      <EditorWorkspace key={active.id} starterCode={active.starterCode} language={active.language} expectedOutput={active.expectedOutput} title={active.title} topic={active.topic} onRecordAttempt={onRecordAttempt} hint={active.hint} context={active} isSignedIn={Boolean(authUser)} skillLevel={progress.skillLevel} />
    </div>
  </div>

  return <div className="page-content"><PageIntro eyebrow="RETRIEVE, APPLY, IMPROVE" title="Practice" description="Short exercises help new ideas stick. Try, check, and try again." action={<span className="learning-count"><Target size={15} />{practiceExercises.length} exercises</span>} /><div className="practice-summary"><div className="practice-summary-icon"><Award size={20} /></div><div><strong>Practice at your own pace</strong><span>These starter exercises use the same concepts as your lessons.</span></div><span className="practice-summary-count">{progress.attempts.filter((attempt) => attempt.passed).length} passed</span></div>
    <div className="filter-row"><div className="filter-caption">FILTER <span>{language === 'All languages' ? 'All exercises' : language === 'html' ? 'HTML exercises' : 'JavaScript exercises'}</span></div><div className="filter-controls"><label className="select-wrap"><span className="sr-only">Practice language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option>All languages</option><option value="javascript">JavaScript</option><option value="html">HTML</option></select><ChevronDown size={14} /></label></div></div>
    <div className="exercise-grid">{exercises.map((exercise) => <article className="exercise-card" key={exercise.id}><div className="exercise-card-top"><span className="exercise-number">{exercise.language === 'html' ? 'HTML' : 'JS'}</span><span className="difficulty-tag">{exercise.difficulty}</span></div><span className="lesson-tag">{exercise.topic}</span><h2>{exercise.title}</h2><p>{exercise.prompt}</p><div className="exercise-card-footer"><span>{attemptedTitles.has(exercise.title) ? <><CheckCircle2 size={14} />Attempted</> : <><Clock3 size={14} />5 min</>}</span><Button onClick={() => setActiveId(exercise.id)}>Open exercise<ArrowRight size={14} /></Button></div></article>)}</div>
  </div>
}

const TUTOR_MODES = [
  { id: 'learning', label: 'Learning', icon: BookOpen, placeholder: 'Ask me to explain a concept step by step...' },
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

function TutorCodeBlock({ language, code, fileName }) {
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
    <div className="tutor-code-head"><span>{label}</span><div className="tutor-code-actions"><button type="button" onClick={copyCode}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button>{runnable && <button type="button" onClick={() => { setResult(null); setRunId((value) => value + 1) }}><Play size={13} />Run</button>}</div></div>
    <pre><code>{code}</code></pre>
    {runId > 0 && runnable && <div className={`tutor-run ${result?.error ? 'tutor-run-error' : ''}`}>
      <CodeRunner key={runId} code={code} language={language} runId={runId} onComplete={setResult} />
      {language !== 'html' && <pre>{result ? (result.error || result.output || '(No output yet)') : 'Running...'}</pre>}
      {language === 'html' && result?.error && <pre>{result.error}</pre>}
    </div>}
  </div>
}

function TutorRichText({ text }) {
  return <div className="tutor-rich">{parseTutorMarkdown(text).map((block, index) => (block.type === 'code'
    ? <TutorCodeBlock key={index} language={block.language} code={block.code} fileName={block.fileName} />
    : <TutorText key={index} text={block.text} />))}</div>
}

function TutorMessage({ message, displayName, onRetry }) {
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
          : <TutorRichText text={message.content} />}
    </div>
  </div>
}

function TutorPage({ progress, currentCode, currentLesson, tutorLanguage, isSignedIn = false, onMessagesChange, onNewConversation }) {
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [attachedCode, setAttachedCode] = useState(false)
  const [tutorMode, setTutorMode] = useState('learning')
  const messages = progress.messages || []
  const bottomRef = useRef(null)
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
  const modeInfo = TUTOR_MODES.find((mode) => mode.id === tutorMode) || TUTOR_MODES[0]
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length, pending])

  async function requestReply(text, requestMode, code, baseMessages) {
    setPending(true)
    const cloudMistakes = (progress.errorHistory || []).filter((row) => !row.resolved).slice(0, 3).map((row) => `${row.topic}: ${row.errorMessage}`)
    const recentMistakes = cloudMistakes.length
      ? cloudMistakes
      : progress.attempts.filter((attempt) => !attempt.passed).slice(0, 3).map((attempt) => `${attempt.topic}: ${attempt.title}`)
    const result = await askTutor({
      question: text,
      mode: requestMode,
      code,
      relatedLanguage: tutorLanguage,
      skillLevel: progress.skillLevel,
      context: { title: currentLesson.title, topic: currentLesson.topic, objective: currentLesson.objective, recentMistakes },
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
    setPending(false)
  }

  async function sendMessage(text = draft) {
    const trimmed = text.trim()
    if (!trimmed || pending) return
    const userMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed, tutorMode, tutorLanguage, createdAt: new Date().toISOString() }
    const nextMessages = [...messages, userMessage]
    onMessagesChange(nextMessages)
    setDraft('')
    await requestReply(trimmed, tutorMode, attachedCode ? currentCode : '', nextMessages)
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

  return <div className="page-content tutor-page"><PageIntro eyebrow="A PATIENT PAIR PROGRAMMER" title="AI tutor" description="Ask about a concept, share an error, or request a small hint." action={<span className={`tutor-mode-badge ${tutorStatus === 'AI unavailable' ? 'tutor-mode-badge-error' : ''}`}><span />{tutorStatus}</span>} /><div className="tutor-layout"><section className="tutor-chat"><div className="chat-header"><div className="tutor-avatar"><Sparkles size={17} /></div><div><strong>Loopwise tutor</strong><span><span className="online-dot" />{tutorSubtitle}</span></div><button className="icon-button" title="New conversation" aria-label="New conversation" onClick={onNewConversation}><Plus size={17} /></button></div><div className="chat-messages">{!messages.length && <div className="chat-welcome"><div className="chat-welcome-icon"><MessageCircle size={21} /></div><span className="eyebrow">LET'S FIGURE IT OUT</span><h2>What are you working on?</h2><p>Pick a mode below: I can teach a concept step by step, debug an error, give a small hint, or quiz you.</p><div className="suggestion-list"><button onClick={() => sendMessage('Explain how loops work, step by step, with one small example.')}><span><BookOpen size={15} /></span>Teach me a concept<ArrowRight size={14} /></button><button onClick={() => sendMessage('I got an error. Can you help me understand it?')}><span><Bug size={15} /></span>Debug an error<ArrowRight size={14} /></button><button onClick={() => sendMessage('Quiz me on variables with three options.')}><span><ListChecks size={15} /></span>Check my knowledge<ArrowRight size={14} /></button></div></div>}{messages.map((message) => <TutorMessage key={message.id} message={message} displayName={progress.displayName} onRetry={retryMessage} />)}{pending && <div className="chat-message message-assistant"><span className="message-avatar"><Sparkles size={14} /></span><div><div className="message-meta"><strong>Loopwise tutor</strong>{modeInfo && <span className="message-mode">{modeInfo.label}</span>}</div><div className="typing-indicator"><i /><i /><i /></div></div></div>}<div ref={bottomRef} /></div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); sendMessage() }}><div className="tutor-mode-row" role="group" aria-label="Tutor mode">{TUTOR_MODES.map((mode) => { const ModeIcon = mode.icon; return <button key={mode.id} type="button" className={`tutor-mode-button ${tutorMode === mode.id ? 'tutor-mode-active' : ''}`} onClick={() => setTutorMode(mode.id)}><ModeIcon size={13} />{mode.label}</button> })}</div><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={modeInfo.placeholder} rows={2} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() } }} /><div className="composer-tools"><button type="button" className={`editor-action ${attachedCode ? 'attach-active' : ''}`} onClick={() => setAttachedCode((value) => !value)}><Code2 size={15} />{attachedCode ? 'Code attached' : 'Attach code'}</button><span>Enter to send · Shift + Enter for a new line</span><Button variant="dark" type="submit" disabled={!draft.trim() || pending}><Send size={14} />Send</Button></div></form></section><aside className="tutor-context"><span className="eyebrow">LEARNING CONTEXT</span><h2>Made for your pace</h2><p>Your tutor uses your question, lesson, and skill level to keep its guidance approachable.</p><div className="context-row"><span className="context-icon"><GraduationCap size={16} /></span><div><small>Current level</small><strong>{progress.skillLevel}</strong></div></div><div className="context-row"><span className="context-icon"><BookOpen size={16} /></span><div><small>Lessons completed</small><strong>{progress.lessonsCompleted.length}</strong></div></div><div className="context-row"><span className="context-icon"><Code2 size={16} /></span><div><small>Practice attempts</small><strong>{progress.attempts.length}</strong></div></div><div className="context-row"><span className="context-icon"><Bug size={16} /></span><div><small>Unresolved mistakes</small><strong>{(progress.errorHistory || []).filter((row) => !row.resolved).length}</strong></div></div><div className="privacy-note"><LockKeyhole size={15} /><span>{isSignedIn ? 'Conversations are saved to your account and restored on any device.' : 'Sign in to save this conversation across devices.'}</span></div></aside></div></div>
}

function ProgressPage({ progress, lessons }) {
  const builtInLessons = lessons.filter((lesson) => !lesson.isCustom)
  const courseStats = courseCatalog.map((course) => {
    const courseLessons = builtInLessons.filter((lesson) => lesson.language === course.id)
    const courseIds = new Set(courseLessons.map((lesson) => lesson.id))
    const languageAttempts = progress.attempts.filter((attempt) => attempt.language === course.id)
    const completed = progress.lessonsCompleted.filter((id) => courseIds.has(id)).length
    return {
      ...course,
      total: courseLessons.length,
      completed,
      started: (progress.lessonsStarted || []).filter((id) => courseIds.has(id)).length,
      attempted: languageAttempts.length,
      passed: languageAttempts.filter((attempt) => attempt.passed).length,
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
  return <div className="page-content"><PageIntro eyebrow="NOTICE YOUR PROGRESS" title="My progress" description="A clear picture of what you have practiced and what comes next." action={<span className="learning-count"><Activity size={15} />{totalCompleted} of {totalLessons} lessons complete</span>} />
    <div className="progress-language-grid">{courseStats.map((course) => {
      const CourseIcon = course.icon
      return <section className="progress-score-panel" key={course.id}>
        <div className="progress-score-heading"><div><span className="eyebrow"><CourseIcon size={12} />{`${course.name.toUpperCase()} PATH`}</span><h2>{course.title}</h2></div><div className="progress-ring" style={{ '--progress': `${course.percent}%` }}><strong>{course.percent}<small>%</small></strong></div></div>
        <div className="progress-track"><span style={{ width: `${course.percent}%` }} /></div>
        <div className="score-details"><span><CheckCircle2 size={15} />{course.completed} of {course.total} lessons completed</span><span><BookOpen size={15} />{course.started} started</span><span><Code2 size={15} />{course.attempted} exercises attempted</span><span><Award size={15} />{course.passed} passed</span></div>
      </section>
    })}</div>
    <div className="progress-top-grid">
      <section className="topic-progress-section"><div className="panel-heading"><div><span className="eyebrow">PRACTICE AREAS</span><h2>Topics explored</h2></div><span className="topics-caption">{topics.length} course topics</span></div><div className="topic-table"><div className="topic-table-header"><span>TOPIC</span><span>LANGUAGE</span><span>ATTEMPTS</span><span>PASSED</span><span>ACTIVITY</span></div>{attemptsByTopic.map((item) => <div className="topic-table-row" key={item.topic}><span>{item.topic}</span><span className={`topic-language topic-language-${item.language.toLowerCase()}`}>{item.language}</span><span>{item.count}</span><span>{item.passed}</span><span className="topic-mini-track"><i style={{ width: item.count ? `${(item.passed / item.count) * 100}%` : '0%' }} /></span></div>)}</div></section>
      <section className="progress-focus-panel"><span className="eyebrow">SKILL PROFILE</span><div className="skill-profile"><div className="skill-icon"><Target size={19} /></div><div><strong>{progress.skillLevel}</strong><span>Unlocked from lesson completion</span></div></div><div className="skill-level-steps">{levelSteps.map(([name, at]) => <span key={name} className={progress.skillLevel === name ? 'skill-step-active' : totalCompleted >= at ? 'skill-step-done' : ''}><strong>{name}</strong><small>{at ? `${at} lessons` : 'Start here'}</small></span>)}</div><p>{plan.nextLevel ? `${plan.lessonsToNext} more completed lesson${plan.lessonsToNext === 1 ? '' : 's'} to reach ${plan.nextLevel}.` : 'You have reached the highest level. Keep practicing to stay sharp.'} Levels unlock automatically: Intermediate at 15 completed lessons, Advanced at half of the built-in course.</p><div className="score-details"><span><ListChecks size={15} />{progress.quizAttempts.length} knowledge checks</span><span><CheckCircle2 size={15} />{corrected} errors corrected</span></div></section>
    </div>
    <div className="progress-note"><Lightbulb size={17} /><p><strong>A useful next step:</strong> revisit a topic where a recent attempt needed another try. Your mistakes are part of the learning record, not a score.</p></div></div>
}

function MistakeHistoryPage({ progress, lessons, onOpenLesson, onNavigate, onPracticeExercise }) {
  const rows = progress.errorHistory || []
  const summary = summarizeMistakes(rows)
  const lessonsByTopic = new Map(lessons.filter((lesson) => !lesson.isCustom && lesson.topic).map((lesson) => [lesson.topic.toLowerCase(), lesson]))
  const exerciseByTopic = new Map(practiceExercises.map((exercise) => [exercise.topic.toLowerCase(), exercise]))
  return <div className="page-content">
    <PageIntro eyebrow="TURN MISTAKES INTO PROGRESS" title="Mistake history" description="Every failed attempt is saved so you can spot patterns and close the gaps." action={<span className="learning-count"><Bug size={15} />{summary.total} recorded</span>} />
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
        <section className="mistake-log"><div className="panel-heading"><div><span className="eyebrow">THE LOG</span><h2>Recent mistakes</h2></div><span className="recommendation-icon"><History size={16} /></span></div><div className="mistake-table">{rows.slice(0, 40).map((row) => <div className={`mistake-row ${row.resolved ? 'mistake-row-resolved' : ''}`} key={row.id}><span className={`attempt-status ${row.resolved ? 'attempt-passed' : 'attempt-review'}`}>{row.resolved ? <Check size={14} /> : <RotateCcw size={14} />}</span><div className="mistake-row-copy"><strong>{row.topic} <span className="mistake-type">{row.errorType}</span></strong><span>{row.errorMessage}</span></div><span className="mistake-date">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : ''}</span><span className={`result-label ${row.resolved ? 'result-good' : 'result-retry'}`}>{row.resolved ? 'Corrected' : 'Open'}</span></div>)}</div></section>
      </>}
  </div>
}

function HistoryPage({ progress }) {
  const attempts = [...progress.attempts, ...(progress.quizAttempts ?? []).map((quiz) => ({
    id: quiz.id,
    title: `${lessons.find((lesson) => lesson.id === quiz.lessonId)?.title || 'Lesson'} knowledge check`,
    topic: 'Quiz',
    language: `${quiz.score}/${quiz.totalQuestions} correct`,
    passed: quiz.score === quiz.totalQuestions,
    createdAt: quiz.completedAt,
  }))].sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
  return <div className="page-content"><PageIntro eyebrow="EVERY TRY COUNTS" title="Learning history" description="Review your past exercise attempts and see how your solutions changed." action={<span className="learning-count"><History size={15} />{attempts.length} recorded</span>} />{attempts.length ? <section className="history-table-wrap"><div className="history-table"><div className="history-header"><span>EXERCISE</span><span>TOPIC</span><span>RESULT</span><span>DATE</span></div>{attempts.map((attempt) => <div className="history-row" key={attempt.id}><div className="history-exercise"><span className={`attempt-status ${attempt.passed ? 'attempt-passed' : 'attempt-review'}`}>{attempt.passed ? <Check size={14} /> : <RotateCcw size={14} />}</span><span><strong>{attempt.title}</strong><small>{attempt.language}</small></span></div><span>{attempt.topic || 'Playground'}</span><span className={`history-result ${attempt.passed ? 'result-good' : 'result-retry'}`}>{attempt.passed ? 'Passed' : 'Needs another try'}</span><span>{new Date(attempt.createdAt).toLocaleString()}</span></div>)}</div></section> : <div className="history-empty"><div className="empty-glyph"><History size={20} /></div><h2>Your learning history starts with your first attempt</h2><p>When you submit an exercise, its result and date will appear here. Earlier attempts stay visible so you can review your progress.</p><span><ShieldCheck size={15} />Saved while you are signed in</span></div>}</div>
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