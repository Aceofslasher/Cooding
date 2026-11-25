# Loopwise

Loopwise is a small programming-learning workspace for students. It combines short JavaScript lessons, a Monaco editor, sandboxed browser previews, a contextual tutor, and a learning record that grows from real student activity.

## What works

- Responsive dashboard, learning path, lessons, practice, multi-file playground, tutor, progress, mistake history, history, and tabbed settings pages.
- The dashboard shows per-course completion, the lesson to continue (a lesson you started, the next incomplete lesson, or one matching an unresolved mistake), recently completed lessons, recent attempts, and a seven-day activity chart built from real timestamps.
- The AI tutor has Learning, Debugging, Hint, and Quiz modes, renders headings/lists/inline code/fenced code blocks, offers Copy on every snippet and Run for JavaScript and HTML, and shows a retry button when the provider fails. Signed-in conversations are stored in `ai_conversations`/`ai_messages` and restored on any device.
- Mistake history groups failed attempts by topic, flags recurring topics, and links back to the matching lesson or practice exercise. Failed attempts also feed the dashboard recommendation and the tutor's context.
- Seventy-two built-in lessons: sixty JavaScript lessons (20 each for beginner, intermediate, and advanced) and twelve HTML lessons. Each lesson links to a relevant W3Schools reference and has a knowledge check. These are educational starter content, not student results.
- Lessons are grouped by level with per-level completion counts and show the previous lesson as a recommended prerequisite (advisory, not a hard lock).
- A separate Lesson Studio for creating, importing, exporting, and removing custom JavaScript or HTML lessons. Custom lessons are stored in this browser; while signed in they are also published to the shared `custom_lessons` table so other accounts can open them from the learning path.
- Monaco editing, a playground workspace with an HTML/CSS/JavaScript file explorer and tabs, JavaScript execution in a sandboxed browser frame, and restricted HTML/CSS previews. The playground also has an AI chat tab: ask the tutor to explain or change code, and fenced file blocks in its reply get an Apply button that writes them into the matching file.
- A local tutor response mode that gives contextual hints without requiring an API key.
- Sign-in-gated progress: lesson completion, exercise attempts, tutor messages, and preferences are saved only while signed in; signed-out activity stays in memory for that session.
- A daily streak in the sidebar: sign in and finish three different lessons in a day to extend it. Missing a day resets it.
- Optional Supabase email sign-up/sign-in and cloud sync for profile settings, lesson progress, coding attempts, and quiz scores. Hosted AI and Python endpoints require Supabase token-verification settings and a student access token.
- Optional Vercel endpoints for an OpenAI-compatible AI provider and server-side Python execution through Judge0.
- Supabase schema, RLS policies, indexes, starter course content, exercises, and non-public test records.

## Requirements

- Node.js 20.19+ or 22.12+ and npm.
- A Supabase project for accounts and cloud persistence (optional).
- An OpenAI-compatible chat-completions API key for live AI tutoring (optional; Supabase auth is required for hosted access).
- A Judge0-compatible host and server API key for Python execution (optional; Supabase auth is required for hosted access).

## Run locally

```powershell
npm install
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`. Without credentials, lessons, JavaScript practice, and demo tutor replies work locally. Progress is only saved while signed in; signed-out work is session-only and is cleared on reload or sign-out.

Open **Lesson studio** in the sidebar to create a custom lesson or import a JSON lesson file. Use **Export JSON** to back up custom lessons. Signed-out custom lessons stay in the current browser; when you sign in, they are published to the shared lessons table and visible to other accounts (and their shared lessons appear in your learning path).

Vite's development server does not run Vercel serverless functions. To exercise `/api/tutor` and `/api/execute` locally, install/use the Vercel CLI, set `VITE_ENABLE_SERVERLESS=true` in `.env.local`, and run `npx vercel dev` after linking the project. Without that setting, AI uses its labeled demo response and Python explains how to start the configured runner.

## Configure Supabase

1. Create a Supabase project and open its SQL Editor.
2. Run the SQL files in `supabase/migrations` in filename order. Existing projects that already ran the initial schema should also apply `202611230001_balance_javascript_levels.sql` and `202611250001_html_custom_lessons.sql`, which adds the HTML course, profile name/country columns, and the shared `custom_lessons` table with owner-write RLS.
3. In Authentication settings, enable email/password sign-in and set the local Site URL to `http://localhost:5173` (or the Vercel preview URL when deployed).
4. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using the project's URL and public anon/publishable key.
5. Restart the dev server. Create an account from Profile & settings. New accounts receive a profile row through the database trigger.

RLS is enabled on every table. Published learning content is readable to visitors; student records require an authenticated matching `auth.uid()`. Hidden test cases have no student-read policy unless `visible_to_student` is true. Never place the Supabase service-role key in the browser.

Current cloud sync persists the profile (including first/last name and country), lesson status and completion timestamps, coding-attempt records, unresolved/resolved error history, quiz scores, and tutor conversation messages. Published custom lessons are stored in Supabase. The profile photo, notification choices, and the streak counter are still kept in the browser snapshot. The UI remains usable while signed out, but progress is not persisted, and hosted AI endpoints require a signed-in session.

## Configure AI and Python

Set these as **server-side** environment variables in Vercel or in the local environment used by `vercel dev`:

- `AI_API_KEY`: provider secret. The endpoint expects an OpenAI-compatible `/chat/completions` API, or Gemini's native `generateContent` API.
- `AI_BASE_URL`: API base URL, defaulting to `https://api.openai.com/v1`. When it points at `generativelanguage.googleapis.com`, the tutor automatically uses Gemini's native endpoint with the `x-goog-api-key` header, which is required for newer AI Studio `AQ.` keys.
- `AI_GEMINI_NATIVE`: set to `true` to force Gemini's native endpoint even when `AI_BASE_URL` is a custom proxy.
- `AI_MODEL`: model name, defaulting to `gpt-4o-mini`.
- `AI_FALLBACK_MODELS`: optional comma-separated models tried in order when the provider answers with an overload status (429/5xx) or times out. Gemini defaults to `gemini-flash-lite-latest,gemini-3.1-flash-lite`.
- `JUDGE0_URL`: Judge0-compatible API base URL.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY`: server-side values used to validate access tokens before serverless requests. The browser also needs the matching `VITE_` values for sign-in.
- `JUDGE0_API_KEY`: Judge0 server credential.
- `JUDGE0_AUTH_HEADER`: authentication header name, default `X-Auth-Token` (RapidAPI hosts commonly use `X-RapidAPI-Key`).

Verify the AI credential before starting the app: `npm run check:ai` reads `.env.local`, calls the provider's model list with the same auth the tutor uses, and reports whether the key and `AI_MODEL` are valid.

The browser only calls `/api/tutor` and `/api/execute`; provider secrets are not prefixed with `VITE_` and are never sent to client code. Hosted endpoints fail closed without Supabase token verification, limit request sizes, and apply per-instance rate limits. For a public deployment, use a shared rate-limit store/API gateway as serverless instance memory is not a global quota.

Python is sent to Judge0 with a fixed Python 3 language ID and CPU, wall-time, and memory limits. JavaScript runs in a sandboxed iframe and HTML/CSS uses a restricted preview iframe. The current exercise checker compares captured output with the sample expected output; it is not a hidden-test grader and should not be used for high-stakes assessment.

## Tests and checks

```powershell
npm test
npm run lint
npm run build
```

Tests cover progress summaries, output comparison, corrected attempts, secure endpoint defaults, streak counting, automatic skill-level thresholds, playground reply parsing, tutor markdown parsing, mistake/recommendation/activity insights, tutor mode prompts and token budget, prerequisites, and the built-in curriculum. Browser QA verified the dashboard insights, mistake history with a real failed attempt, practice deep links, prerequisite banners, the new HTML knowledge check, tutor mode selection, inline-code rendering, and the multi-file playground. Manual follow-up is still needed for signed-in Supabase sync (`lesson_progress`, `ai_messages`, `error_history`) against a configured project, live provider failure/retry cases, code-block Run inside tutor replies, Python results from a configured Judge0 host, and hosted deployment.

## Deploy to Vercel

1. Push the project to a Git provider and import it into Vercel (or link it with the Vercel CLI).
2. Keep the default Vite build command, `npm run build`, and output directory, `dist`.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for browser sign-in, and `SUPABASE_URL` plus `SUPABASE_ANON_KEY` for serverless access-token verification.
4. Add `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, and/or `JUDGE0_*` as server environment variables as required.
5. Run the migration in the Supabase SQL Editor and add the production URL to Supabase Auth's allowed redirect URLs.
6. Redeploy after setting environment variables.

## Known limitations

- Authentication is optional for local learning; cloud data is protected by Supabase RLS.
- The frontend currently bundles sample lessons and their visible expected output. Hidden database tests are not exposed, but a secure exercise-grading endpoint is not yet implemented.
- Progress supports lesson completion, coding attempts, quiz scores, a daily three-lesson streak, unresolved-mistake tracking, and weakness-based recommendations. Recommendations are rule-based; semantic adaptation (for example, difficulty inference beyond completed-lesson counts) is not implemented.
- Cloud synchronization covers profiles, lesson status and timestamps, coding attempts, error history, quiz scores, tutor messages, and published custom lessons. The profile photo, notification settings, and the streak counter remain in the browser snapshot.
- Prerequisites are advisory. A learner can still open any lesson out of order, and custom lessons have no prerequisite chain.
- The tutor's built-in demo mode is rule-based. A real model is used only when the server endpoint and provider credentials are configured.
- There is no password-reset flow, OAuth provider, account deletion flow, or automated end-to-end auth test yet.