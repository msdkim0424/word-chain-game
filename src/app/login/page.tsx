'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import styles from './login.module.css';

// Simple client-side hash for basic obfuscation
const hashPassword = async (password: string) => {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If already logged in, redirect to lobby
    if (localStorage.getItem('wollu_user_id')) {
      router.push('/');
    }
  }, [router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password.trim()) {
      setError('Please enter a username and password.');
      return;
    }

    setLoading(true);
    try {
      const hashedPass = await hashPassword(password);

      // Check if user exists
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('username', username.trim())
        .single();

      if (user) {
        // Login attempt
        if (user.password === hashedPass) {
          // Success
          localStorage.setItem('wollu_user_id', user.id);
          localStorage.setItem('wollu_username', user.username);
          router.push('/');
        } else {
          setError('Incorrect password.');
        }
      } else {
        // Register attempt
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert([{ username: username.trim(), password: hashedPass }])
          .select()
          .single();

        if (insertError) throw insertError;

        localStorage.setItem('wollu_user_id', newUser.id);
        localStorage.setItem('wollu_username', newUser.username);
        router.push('/');
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to authenticate. Make sure the database schema is updated.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.container}>
      <div className={`glass-panel animate-fade-in ${styles.loginBox}`}>
        <div>
          <h1 className={styles.title}>WolLu Game</h1>
          <p className={styles.subtitle}>Enter a username and password to join. If the username doesn't exist, we'll create a new account for you instantly!</p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleAuth} className={styles.form}>
          <input 
            type="text" 
            className="input-base" 
            placeholder="Username" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={16}
          />
          <input 
            type="password" 
            className="input-base" 
            placeholder="Password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Authenticating...' : 'Login / Register'}
          </button>
        </form>
      </div>
    </main>
  );
}
