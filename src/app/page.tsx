'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import { Play, Users, LogOut, Plus } from 'lucide-react';
import styles from './page.module.css';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  
  const [roomNameInput, setRoomNameInput] = useState('');
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
        .eq('status', 'waiting')
        .order('created_at', { ascending: false });
      
      if (data) setActiveRooms(data);
    };

    fetchRooms();

    const channel = supabase.channel('public:rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: "status=eq.waiting" }, fetchRooms)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms' }, fetchRooms) // to remove started rooms
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
          name: rName
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
          <input 
            type="text" 
            className="input-base" 
            placeholder={`${username}'s Game`}
            value={roomNameInput}
            onChange={e => setRoomNameInput(e.target.value)}
            maxLength={30}
          />
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
                  <div>
                    <div className={styles.roomName}>{room.name || 'Unnamed Game'}</div>
                    <div className={styles.roomHost}>Host: {room.users?.username || 'Unknown'}</div>
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
