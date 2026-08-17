-- Add translated description columns to listings table
-- Run this in the Supabase SQL Editor

alter table listings
  add column if not exists description_en text,
  add column if not exists description_ru text,
  add column if not exists description_ar text,
  add column if not exists description_fr text;
