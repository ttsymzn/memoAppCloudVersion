-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    tag_group TEXT DEFAULT 'General',
    sort_order INTEGER DEFAULT 0,
    color TEXT DEFAULT '#3b82f6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create memos table
CREATE TABLE IF NOT EXISTS memos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    content TEXT DEFAULT '',
    tags UUID[] DEFAULT '{}',
    color TEXT DEFAULT 'rgba(255, 255, 255, 0.1)',
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE memos ENABLE ROW LEVEL SECURITY;

-- Tags policies: Allow all authenticated users to manage tags
CREATE POLICY "Allow authenticated select" ON tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON tags FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete" ON tags FOR DELETE TO authenticated USING (true);

-- Memos policies: Users can only see their own memos or public memos
CREATE POLICY "Users can view own memos" ON memos 
    FOR SELECT TO authenticated 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view public memos" ON memos 
    FOR SELECT TO authenticated 
    USING (is_public = true);

-- Users can only insert their own memos
CREATE POLICY "Users can insert own memos" ON memos 
    FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = user_id);

-- Users can only update their own memos
CREATE POLICY "Users can update own memos" ON memos 
    FOR UPDATE TO authenticated 
    USING (auth.uid() = user_id);

-- Users can only delete their own memos
CREATE POLICY "Users can delete own memos" ON memos 
    FOR DELETE TO authenticated 
    USING (auth.uid() = user_id);

-- Function to handle updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for memos table
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON memos
FOR EACH ROW
EXECUTE PROCEDURE handle_updated_at();
