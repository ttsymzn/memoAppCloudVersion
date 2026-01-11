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
    content TEXT DEFAULT '',
    tags UUID[] DEFAULT '{}',
    color TEXT DEFAULT 'rgba(255, 255, 255, 0.1)',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS) - Optional but recommended
-- For this demo, we'll keep it simple, but in production, you'd add policies.
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE memos ENABLE ROW LEVEL SECURITY;

-- Allow public access for now (Simplest setup for the user)
CREATE POLICY "Allow public select" ON tags FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert" ON tags FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update" ON tags FOR UPDATE TO public USING (true);
CREATE POLICY "Allow public delete" ON tags FOR DELETE TO public USING (true);

CREATE POLICY "Allow public select" ON memos FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert" ON memos FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update" ON memos FOR UPDATE TO public USING (true);
CREATE POLICY "Allow public delete" ON memos FOR DELETE TO public USING (true);

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
