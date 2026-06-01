-- 1. Add Game Type to Rooms
ALTER TABLE rooms ADD COLUMN game_type TEXT DEFAULT 'wordchain';

-- 2. Create Omok Moves Table
CREATE TABLE omok_moves (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(room_id, x, y)
);

-- 3. Enable Realtime for omok_moves
alter publication supabase_realtime add table omok_moves;

-- 4. Enable RLS and permissive policy for omok_moves
ALTER TABLE omok_moves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read/insert on omok_moves" ON omok_moves FOR ALL USING (true) WITH CHECK (true);
