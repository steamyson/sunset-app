alter table public.messages
  add column if not exists capture_window text;

comment on column public.messages.capture_window is 'Optional tag: sunrise | sunset golden-hour window at capture time.';
