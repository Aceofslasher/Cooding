import { getAuthHeaders } from './supabase'

function localDraft({ topic, level = 'Beginner', language = 'javascript' }) {
  const subject = topic.trim() || 'A new idea'
  const lower = subject.toLowerCase()
  if (language === 'html') {
    return {
      title: `Practice ${subject}`,
      description: `A short ${level.toLowerCase()} HTML lesson about ${lower}.`,
      objective: `Build a small page section that uses ${lower}.`,
      objectives: [`Recognise the HTML for ${lower}`, `Write a labeled example`, 'Check the result in a browser'],
      explanation: `${subject} changes how a browser presents content. Start with the smallest correct markup, then add one useful detail such as a label or caption.`,
      example: `<section>\n  <h2>${subject}</h2>\n  <p>Replace this sentence with your own content.</p>\n</section>`,
      starterCode: `<section>\n  <!-- Add a heading and one paragraph about ${lower}. -->\n</section>`,
      expectedOutput: `<h2>${subject}</h2>\n<p>Your paragraph</p>`,
      hint: 'Open with a heading, then add a paragraph inside the same section.',
      hints: ['Start with a section element.', 'Headings describe the idea; paragraphs explain it.'],
      quiz: {
        question: `Which element gives the page section a visible title?`,
        choices: ['<h2>', '<p>', '<section>'],
        answer: 0,
        explanation: 'Heading elements create visible titles for readers.',
      },
    }
  }
  return {
    title: `Practice ${subject}`,
    description: `A short ${level.toLowerCase()} JavaScript lesson about ${lower}.`,
    objective: `Use ${lower} to produce a small, predictable result.`,
    objectives: [`Explain ${lower} in one sentence`, `Write a small working example`, 'Predict the printed output'],
    explanation: `${subject} lets you describe a result in code, then check it by printing the value. Keep the example small enough to trace by hand before you run it.`,
    example: `const example = "${subject}";\nconsole.log(example);`,
    starterCode: `const example = "${subject}";\n\n// Print the example value.\n`,
    expectedOutput: subject,
    hint: 'Use console.log with the variable name.',
    hints: ['Declare the value once.', 'Print it with console.log.'],
    quiz: {
      question: 'Which line prints a value to the console?',
      choices: ['console.log(value)', 'return value', 'value.console()'],
      answer: 0,
      explanation: 'console.log is the standard way to print a value while learning.',
    },
  }
}

export async function generateLessonDraft(payload) {
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_SERVERLESS !== 'true') {
    return { lesson: localDraft(payload), mode: 'demo' }
  }
  try {
    const authHeaders = await getAuthHeaders()
    const response = await fetch('/api/generate-lesson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      if (import.meta.env.DEV && response.status === 404) {
        return { lesson: localDraft(payload), mode: 'demo' }
      }
      const message = data && typeof data.error === 'string'
        ? data.error
        : `The lesson generator returned HTTP ${response.status}.`
      return { lesson: null, mode: 'error', error: message }
    }
    if (!data || !data.lesson || typeof data.lesson !== 'object') {
      return { lesson: null, mode: 'error', error: 'The lesson generator returned an empty draft.' }
    }
    return { lesson: data.lesson, mode: 'ai' }
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    const message = timedOut
      ? 'The lesson generator took too long. Try a shorter prompt.'
      : error instanceof Error && error.message
        ? error.message
        : 'An unexpected error occurred.'
    return { lesson: null, mode: 'error', error: message }
  }
}
