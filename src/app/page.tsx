'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import { Play } from 'lucide-react';
import styles from './page.module.css';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRoom = async () => {
    setLoading(true);
    setError(null);
    try {
      // Create a new room
      const { data, error: roomError } = await supabase
        .from('rooms')
        .insert([{ status: 'waiting' }])
        .select()
        .single();

      if (roomError) throw roomError;

      // Redirect to the new room
      router.push(`/room/${data.id}`);
    } catch (err: any) {
      console.error(err);
      setError('Failed to create room. Make sure Supabase is connected.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.container}>
      <div className={`glass-panel animate-fade-in ${styles.hero}`}>
        <div>
          <h1 className={styles.title}>끝말잇기</h1>
          <p className={styles.subtitle}>
            Challenge your friends in the ultimate real-time word chain game.
            Create a room, share the link, and let the battle begin!
          </p>
        </div>

        <div className={styles.actionArea}>
          <button 
            className={`btn-primary ${styles.btnLarge}`} 
            onClick={createRoom}
            disabled={loading}
          >
            {loading ? 'Creating Room...' : 'Create New Game'}
            {!loading && <Play size={20} />}
          </button>
          {error && <div className={styles.error}>{error}</div>}
        </div>
      </div>
    </main>
  );
}
