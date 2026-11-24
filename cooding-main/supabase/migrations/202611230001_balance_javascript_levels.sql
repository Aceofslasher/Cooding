update public.lessons
set difficulty = case id
  when 'c6231034-0705-42ed-872a-bad7c0080a14' then 'beginner'
  when 'c6231034-0705-42ed-872a-bad7c0080a17' then 'beginner'
  when 'c6231034-0705-42ed-872a-bad7c0080a25' then 'beginner'
  when 'c6231034-0705-42ed-872a-bad7c0080a27' then 'beginner'
  when 'c6231034-0705-42ed-872a-bad7c0080a30' then 'beginner'
  when 'c6231034-0705-42ed-872a-bad7c0080a29' then 'intermediate'
  when 'c6231034-0705-42ed-872a-bad7c0080a33' then 'intermediate'
end
where id in (
  'c6231034-0705-42ed-872a-bad7c0080a14',
  'c6231034-0705-42ed-872a-bad7c0080a17',
  'c6231034-0705-42ed-872a-bad7c0080a25',
  'c6231034-0705-42ed-872a-bad7c0080a27',
  'c6231034-0705-42ed-872a-bad7c0080a29',
  'c6231034-0705-42ed-872a-bad7c0080a30',
  'c6231034-0705-42ed-872a-bad7c0080a33'
);
