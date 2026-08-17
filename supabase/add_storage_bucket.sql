-- ============================================================
-- Create a public storage bucket for listing images
-- Paste this into the Supabase SQL Editor and run it.
-- ============================================================

-- Create the bucket (public = anyone can read, auth required to upload)
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-images', 'listing-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload listing images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'listing-images');

-- Allow owners to update/delete their own images
CREATE POLICY "Owners can manage their listing images"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'listing-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow anyone to view listing images (public bucket)
CREATE POLICY "Public read access for listing images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'listing-images');
