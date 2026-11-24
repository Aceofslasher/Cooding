-- HTML learning path, shared custom lessons, and richer profiles.

alter table public.profiles add column if not exists first_name text not null default '' check (char_length(first_name) <= 50);
alter table public.profiles add column if not exists last_name text not null default '' check (char_length(last_name) <= 50);
alter table public.profiles add column if not exists country text not null default '' check (char_length(country) <= 60);

insert into public.courses (id, title, description, programming_language, difficulty, published)
values ('5a2c8e10-4b6d-4f9a-8c3e-1d2b3c4d5e6f', 'HTML, from the ground up', 'Build real pages with headings, links, lists, forms, and semantic structure. Every lesson links to W3Schools.', 'html', 'beginner', true)
on conflict (id) do nothing;

insert into public.lessons (id, course_id, title, content, topic, difficulty, lesson_order, estimated_minutes) values
('c6231034-0705-42ed-872a-bad7c0080a61', '5a2c8e10-4b6d-4f9a-8c3e-1d2b3c4d5e6f', 'Structure an HTML page', 'An HTML page starts with a doctype, an html element, a head for page information, and a body for visible content.', 'HTML Basics', 'beginner', 1, 8),
('c6231034-0705-42ed-872a-bad7c0080a62', '5a2c8e10-4b6d-4f9a-8c3e-1d2b3c4d5e6f', 'Nest HTML elements', 'Place elements inside other elements to describe how content belongs together.', 'HTML Basics', 'beginner', 2, 8),
('c6231034-0705-42ed-872a-bad7c0080a63', '5a2c8e10-4b6d-4f9a-8c3e-1d2b3c4d5e6f', 'Outline a page with headings', 'Use heading levels to show which ideas are the most important.', 'HTML Text', 'beginner', 3, 6),
('c6231034-0705-42ed-872a-bad7c0080a64', '5a2c8e10-4b6d-4f9a-8c3e-1d2b3c4d5e6f', 'Write paragraphs and emphasis', 'Group sentences into paragraphs and mark words that matter.', 'HTML Text', 'beginner', 4, 7),
('c6231034-0705-42ed-872a-bad7c0080a65', '5a2c8e10-4b6d-4f9a-8c3e-1d2b3c4d5e6f', 'Connect pages with links', 'Use anchors to move visitors to another page.', 'HTML Links', 'beginner', 5, 9),
('c6231034-0705-42ed-872a-bad7c0080a66', '5a2c8e10-4b6d-4f9a-8c3e-1d2b3c4d5e6f', 'Describe images', 'Embed an image and give it a caption that explains it.', 'HTML Media', 'beginner', 6, 9),
('c6231034-0705-42ed-872a-bad7c0080a67', '5a2c8e10-4b6d-4f9a-8c3e-1d2b3c4d5e6f', 'Make ordered and unordered lists', 'Group related items with bullets or numbers.', 'HTML Lists', 'beginner', 7, 8),
('c6231034-0705-42ed-872a-bad7c0080a68', '5a2c8e10-4b6d-4f9a-8c3e-1d2b3c4d5e6f', 'Arrange data in a table', 'Organise rows and columns with a caption and header cells.', 'HTML Tables', 'intermediate', 8, 12),
('c6231034-0705-42ed-872a-bad7c0080a69', '5a2c8e10-4b6d-4f9a-8c3e-1d2b3c4d5e6f', 'Collect input with forms', 'Ask a visitor for information with labels, inputs, and a button.', 'HTML Forms', 'intermediate', 9, 12),
('c6231034-0705-42ed-872a-bad7c0080a70', '5a2c8e10-4b6d-4f9a-8c3e-1d2b3c4d5e6f', 'Describe page regions', 'Replace generic containers with elements that explain their purpose.', 'HTML Semantics', 'intermediate', 10, 11),
('c6231034-0705-42ed-872a-bad7c0080a71', '5a2c8e10-4b6d-4f9a-8c3e-1d2b3c4d5e6f', 'Add audio and video', 'Embed media with controls and a helpful fallback message.', 'HTML Media', 'advanced', 11, 10),
('c6231034-0705-42ed-872a-bad7c0080a72', '5a2c8e10-4b6d-4f9a-8c3e-1d2b3c4d5e6f', 'Describe a page with meta tags', 'Give browsers and search engines accurate information about the page.', 'HTML Head', 'advanced', 12, 9)
on conflict (id) do nothing;

create table if not exists public.custom_lessons (
  id text primary key check (id ~ '^[a-zA-Z0-9-]{1,100}$'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  owner_name text not null default 'Learner' check (char_length(owner_name) between 1 and 80),
  title text not null check (char_length(title) between 1 and 120),
  topic text not null check (char_length(topic) between 1 and 80),
  level text not null check (level in ('Beginner', 'Intermediate', 'Advanced')),
  minutes integer not null check (minutes between 1 and 120),
  language text not null default 'javascript' check (language in ('javascript', 'html')),
  description text not null default '',
  objective text not null default '',
  explanation text not null default '',
  example text not null default '',
  starter_code text not null default '',
  expected_output text not null default '',
  hint text not null default '',
  reference_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_lessons_owner_idx on public.custom_lessons (owner_id);
create index if not exists custom_lessons_created_idx on public.custom_lessons (created_at desc);

drop trigger if exists custom_lessons_updated_at on public.custom_lessons;
create trigger custom_lessons_updated_at before update on public.custom_lessons
for each row execute function public.set_updated_at();

alter table public.custom_lessons enable row level security;

grant select on public.custom_lessons to anon, authenticated;
grant insert, update, delete on public.custom_lessons to authenticated;

drop policy if exists "Anyone reads shared custom lessons" on public.custom_lessons;
create policy "Anyone reads shared custom lessons" on public.custom_lessons
for select to anon, authenticated using (true);

drop policy if exists "Owners insert their custom lessons" on public.custom_lessons;
create policy "Owners insert their custom lessons" on public.custom_lessons
for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners update their custom lessons" on public.custom_lessons;
create policy "Owners update their custom lessons" on public.custom_lessons
for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners delete their custom lessons" on public.custom_lessons;
create policy "Owners delete their custom lessons" on public.custom_lessons
for delete to authenticated using ((select auth.uid()) = owner_id);
