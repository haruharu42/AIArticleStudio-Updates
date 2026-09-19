-- note operations profile builder presets
-- Remote migration: 20260919125425 note_operations_profile_builder_presets

alter table public.note_operation_profiles
  add column if not exists account_genre text not null default 'ai'
    check (account_genre in ('ai','sidejob','business','lifestyle','gadget','learning','parenting','health_beauty','money','creative','entertainment','other')),
  add column if not exists custom_genre text not null default '',
  add column if not exists account_style text not null default 'beginner'
    check (account_style in ('beginner','howto','experience','essay','review','trend','expert','creative','other')),
  add column if not exists custom_account_style text not null default '',
  add column if not exists audience_preset text not null default 'beginner'
    check (audience_preset in ('beginner','employee','sidejob_beginner','student','parent','senior','creator','business_owner','broad','other')),
  add column if not exists custom_audience text not null default '',
  add column if not exists tone_preset text not null default 'friendly'
    check (tone_preset in ('friendly','gentle','professional','casual','expert','energetic','other')),
  add column if not exists custom_tone text not null default '',
  add column if not exists monetization_style text not null default 'free_to_paid'
    check (monetization_style in ('free_first','free_to_paid','paid_expertise','membership_future','no_monetization','other')),
  add column if not exists custom_monetization_style text not null default '';

alter table public.note_operation_profiles
  drop constraint if exists note_operation_profiles_custom_fields_length;

alter table public.note_operation_profiles
  add constraint note_operation_profiles_custom_fields_length check (
    char_length(custom_genre) <= 120
    and char_length(custom_account_style) <= 180
    and char_length(custom_audience) <= 300
    and char_length(custom_tone) <= 120
    and char_length(custom_monetization_style) <= 180
  );
