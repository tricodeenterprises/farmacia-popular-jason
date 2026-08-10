
-- Create storage bucket for backups
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('backups', 'backups', false, 524288000, ARRAY['application/zip', 'application/x-zip-compressed', 'application/octet-stream'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated masters to upload backups
CREATE POLICY "Masters can upload backups"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'backups' AND
  public.has_role(auth.uid(), 'master'::public.app_role)
);

-- Allow authenticated masters to read backups
CREATE POLICY "Masters can read backups"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'backups' AND
  public.has_role(auth.uid(), 'master'::public.app_role)
);

-- Allow masters to delete old backups
CREATE POLICY "Masters can delete backups"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'backups' AND
  public.has_role(auth.uid(), 'master'::public.app_role)
);
