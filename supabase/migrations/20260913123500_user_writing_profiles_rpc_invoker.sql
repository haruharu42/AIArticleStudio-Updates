begin;

alter function public.record_my_personalization_signal(text, text, text, text)
    security invoker;

grant execute on function private.increment_jsonb_counter(jsonb, text) to authenticated;

commit;
