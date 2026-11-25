import { matchesExpectedOutput } from './progress.js'
import { htmlToText } from './html.js'

export function normalizeOutput(value, language = 'javascript') {
  if (language === 'html') return htmlToText(String(value ?? '')).replace(/\s+/g, ' ').trim()
  return String(value ?? '').trim()
}

export function evaluateTestCases({ output, expectedOutput, language = 'javascript', testCases = [] }) {
  const actual = normalizeOutput(output, language)
  const cases = testCases.length
    ? testCases
    : [{ description: 'Program output matches the expected output', expectedOutput, mode: 'exact' }]
  return cases.map((testCase) => {
    const expected = normalizeOutput(testCase.expectedOutput ?? testCase.expected ?? '', language)
    const mode = testCase.mode || 'exact'
    const passed = mode === 'includes'
      ? actual.includes(expected)
      : mode === 'line'
        ? actual.split('\n').map((line) => line.trim()).includes(expected)
        : matchesExpectedOutput(actual, expected)
    return {
      description: testCase.description || 'Check the output',
      passed,
      expected,
      actual,
    }
  })
}

export function passedAllTests(results = []) {
  return results.length > 0 && results.every((result) => result.passed)
}
