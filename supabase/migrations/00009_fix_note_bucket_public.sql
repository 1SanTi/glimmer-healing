-- 将 note-attachments bucket 设为 public
UPDATE storage.buckets SET public = true WHERE id = 'note-attachments';