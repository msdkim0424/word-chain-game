'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import { Play, Users, LogOut, Plus, Trash2 } from 'lucide-react';
import styles from './page.module.css';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  
  const [roomNameInput, setRoomNameInput] = useState('');
  const [gameType, setGameType] = useState('wordchain');
  const [activeRooms, setActiveRooms] = useState<any[]>([]);

  useEffect(() => {
    const storedUserId = localStorage.getItem('wollu_user_id');
    const storedUsername = localStorage.getItem('wollu_username');

    if (!storedUserId) {
      router.push('/login');
    } else {
      setUserId(storedUserId);
      setUsername(storedUsername);
    }
  }, [router]);

  useEffect(() => {
    const fetchRooms = async () => {
      const { data } = await supabase
        .from('rooms')
        .select('*, users(username)')
        .in('status', ['waiting', 'playing'])
        .order('created_at', { ascending: false });
      
      if (data) setActiveRooms(data);
    };

    fetchRooms();

    const channel = supabase.channel('public:rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, fetchRooms)
      .subscribe();

    // Re-fetch on window focus and pageshow (handles browser Back button cache issues)
    window.addEventListener('focus', fetchRooms);
    window.addEventListener('pageshow', fetchRooms);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', fetchRooms);
      window.removeEventListener('pageshow', fetchRooms);
    };
  }, []);

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !username) return;
    
    setLoading(true);
    setError(null);
    try {
      const rName = roomNameInput.trim() || `${username}'s Game`;
      
      const { data, error: roomError } = await supabase
        .from('rooms')
        .insert([{ 
          status: 'waiting',
          host_id: userId,
          name: rName,
          game_type: gameType
        }])
        .select()
        .single();

      if (roomError) throw roomError;

      router.push(`/room/${data.id}`);
    } catch (err: any) {
      console.error(err);
      setError('Failed to create room. Make sure Supabase is connected and updated.');
    } finally {
      setLoading(false);
    }
  };

  const deleteRoom = async (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this game?")) return;
    
    try {
      const { error: err } = await supabase.from('rooms').delete().eq('id', roomId);
      if (err) throw err;
      // Realtime listener will automatically remove it from the UI!
    } catch (err) {
      console.error(err);
      alert("Failed to delete the game.");
    }
  };

  const logout = () => {
    localStorage.removeItem('wollu_user_id');
    localStorage.removeItem('wollu_username');
    router.push('/login');
  };

  if (!userId) return null; // Will redirect in useEffect

  return (
    <main className={styles.container}>
      <div className={`glass-panel animate-fade-in ${styles.hero}`}>
        
        <div className={styles.headerRow}>
          <div className={styles.userInfo}>
            <div style={{width: 40, height: 40, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'}}>
              {username?.charAt(0).toUpperCase()}
            </div>
            <div style={{textAlign: 'left'}}>
              <div style={{fontSize: '0.875rem', color: '#94a3b8'}}>Logged in as</div>
              <div style={{fontWeight: 'bold'}}>{username}</div>
            </div>
          </div>
          <button onClick={logout} className={styles.logoutBtn}><LogOut size={16} /> Logout</button>
        </div>

        <div>
          <h1 className={styles.title}>WolLu Game</h1>
          <p className={styles.subtitle}>
            (월급루팡게임) The ultimate real-time word chain game.
          </p>
        </div>

        <form onSubmit={createRoom} className={styles.createRoomArea}>
          <div style={{display: 'flex', gap: '1rem', width: '100%'}}>
            <input 
              type="text" 
              className="input-base" 
              placeholder={`${username}'s Game`}
              value={roomNameInput}
              onChange={e => setRoomNameInput(e.target.value)}
              maxLength={30}
              style={{flex: 2}}
            />
            <select 
              className="input-base" 
              value={gameType}
              onChange={e => setGameType(e.target.value)}
              style={{flex: 1, cursor: 'pointer', appearance: 'none', background: 'rgba(0,0,0,0.3)'}}
            >
              <option value="wordchain">Word Chain</option>
              <option value="omok">Omok (5-in-a-Row)</option>
              <option value="racing">Mini Racing (Clicker)</option>
            </select>
          </div>
          <button 
            type="submit"
            className={`btn-primary ${styles.btnLarge}`} 
            disabled={loading}
          >
            {loading ? 'Creating...' : <><Plus size={20} /> Create New Game</>}
          </button>
        </form>
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.roomListArea}>
          <h2><Users size={24} /> Active Lobbies</h2>
          
          {activeRooms.length === 0 ? (
            <div className={styles.emptyState}>
              No active lobbies right now. Be the first to create one!
            </div>
          ) : (
            <div className={styles.roomGrid}>
              {activeRooms.map(room => (
                <div key={room.id} className={styles.roomCard} onClick={() => router.push(`/room/${room.id}`)}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                    <div>
                      <div className={styles.roomName}>
                        {room.name || 'Unnamed Game'}
                        <span style={{marginLeft: '0.5rem', fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '1rem', verticalAlign: 'middle'}}>
                          {room.game_type === 'omok' ? 'Omok' : room.game_type === 'racing' ? 'Racing' : 'Word Chain'}
                        </span>
                      </div>
                      <div className={styles.roomHost}>Host: {room.users?.username || 'Unknown'}</div>
                    </div>
                    {room.host_id === userId && (
                      <button 
                        onClick={(e) => deleteRoom(e, room.id)}
                        style={{background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: '0.25rem', borderRadius: '4px'}}
                        title="Delete Game"
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(236, 72, 153, 0.1)'}
                        onMouseOut={e => e.currentTarget.style.background = 'none'}
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                  <div style={{color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.875rem', marginTop: 'auto'}}>
                    Click to join →
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
