export function lessonActivityState(progress = {}, lesson = {}, quiz = null) {
  const attempts = (progress.attempts || []).filter((attempt) => !attempt.exerciseId
    && (attempt.lessonId === lesson.id || (!attempt.lessonId && lesson.title && attempt.title === lesson.title)))
  const exercisePassed = attempts.some((attempt) => attempt.passed)
  const quizAttempts = (progress.quizAttempts || []).filter((attempt) => attempt.lessonId === lesson.id)
  const quizPassed = quiz ? quizAttempts.some((attempt) => attempt.score === attempt.totalQuestions) : true
  const complete = (progress.lessonsCompleted || []).includes(lesson.id)
  const required = quiz ? 2 : 1
  const done = (exercisePassed ? 1 : 0) + (quizPassed ? 1 : 0)
  return {
    exercisePassed,
    quizPassed,
    needsQuiz: Boolean(quiz),
    complete,
    required,
    done,
    ready: exercisePassed && quizPassed,
  }
}

export function lessonsReadyToComplete(progress = {}, lessons = [], quizzes = {}) {
  const completed = new Set(progress.lessonsCompleted || [])
  return lessons.filter((lesson) => {
    if (completed.has(lesson.id)) return false
    const quiz = quizzes[lesson.id] || lesson.quiz || null
    return lessonActivityState(progress, lesson, quiz).ready
  })
}
