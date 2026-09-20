
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('heron-web', 'heron-web', true, 5242880, ARRAY['text/html', 'text/plain'])
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='heron-web public read') THEN
    CREATE POLICY "heron-web public read" ON storage.objects FOR SELECT USING (bucket_id = 'heron-web');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='heron-web authenticated upload') THEN
    CREATE POLICY "heron-web authenticated upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'heron-web' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='heron-web authenticated update') THEN
    CREATE POLICY "heron-web authenticated update" ON storage.objects FOR UPDATE USING (bucket_id = 'heron-web' AND auth.role() = 'authenticated');
  END IF;
END$$;
