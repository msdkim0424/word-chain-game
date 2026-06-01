-- 1. Create Users Table
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Update Rooms Table
ALTER TABLE rooms ADD COLUMN host_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE rooms ADD COLUMN name TEXT;

-- 3. Update Players Table
ALTER TABLE players ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- 4. Enable Realtime for users (optional, but good for lobby updates)
alter publication supabase_realtime add table users;

-- 5. Set permissive RLS for users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read/insert on users" ON users FOR ALL USING (true) WITH CHECK (true);
