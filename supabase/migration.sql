-- Migration script to add user authentication and ownership to existing memos table
-- Run this if you already have a memos table without user_id and is_public columns

-- Add user_id column (nullable first, we'll update it later)
ALTER TABLE memos ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add is_public column with default false
ALTER TABLE memos ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- Drop old policies
DROP POLICY IF EXISTS "Allow public select" ON memos;
DROP POLICY IF EXISTS "Allow public insert" ON memos;
DROP POLICY IF EXISTS "Allow public update" ON memos;
DROP POLICY IF EXISTS "Allow public delete" ON memos;

DROP POLICY IF EXISTS "Allow public select" ON tags;
DROP POLICY IF EXISTS "Allow public insert" ON tags;
DROP POLICY IF EXISTS "Allow public update" ON tags;
DROP POLICY IF EXISTS "Allow public delete" ON tags;

-- Create new policies for tags (authenticated users only)
CREATE POLICY "Allow authenticated select" ON tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON tags FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete" ON tags FOR DELETE TO authenticated USING (true);

-- Create new policies for memos (user-based access control)
CREATE POLICY "Users can view own memos" ON memos 
    FOR SELECT TO authenticated 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view public memos" ON memos 
    FOR SELECT TO authenticated 
    USING (is_public = true);

CREATE POLICY "Users can insert own memos" ON memos 
    FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memos" ON memos 
    FOR UPDATE TO authenticated 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own memos" ON memos 
    FOR DELETE TO authenticated 
    USING (auth.uid() = user_id);

-- Note: If you have existing memos without user_id, you'll need to either:
-- 1. Delete them: DELETE FROM memos WHERE user_id IS NULL;
-- 2. Or assign them to a specific user: UPDATE memos SET user_id = 'your-user-id' WHERE user_id IS NULL;
-- After that, you can make user_id NOT NULL:
-- ALTER TABLE memos ALTER COLUMN user_id SET NOT NULL;
