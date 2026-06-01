'use client';

import { useEffect, useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import styles from './room.module.css';
import { Send, Clock, Play, Copy, Users, ArrowLeft } from 'lucide-react';

const STARTING_WORDS = ['사과', '학교', '컴퓨터', '바나나', '기차', '우주', '자전거', '피아노', '호랑이', '고양이', '대한민국', '소방관', '경찰관', '우주선'];

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const roomId = resolvedParams.id;
  
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [player, setPlayer] = useState<any | null>(null);
  
  const [room, setRoom] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [words, setWords] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  
  const [wordInput, setWordInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wordsEndRef = useRef<HTMLDivElement>(null);

  // Check login
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

  // Auto-scroll logic
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    wordsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [words]);

  useEffect(() => {
    if (!userId) return;

    const fetchInitialData = async () => {
      // Room
      const { data: roomData } = await supabase.from('rooms').select('*, users(username)').eq('id', roomId).single();
      if (roomData) setRoom(roomData);
      
      // Players
      const { data: playersData } = await supabase.from('players').select('*').eq('room_id', roomId).order('joined_at', { ascending: true });
      if (playersData) {
        setPlayers(playersData);
        // Check if current user is already a player
        const existingPlayer = playersData.find((p: any) => p.user_id === userId);
        if (existingPlayer) setPlayer(existingPlayer);
      }
      
      // Words
      const { data: wordsData } = await supabase.from('words').select('*').eq('room_id', roomId).order('created_at', { ascending: true });
      if (wordsData) setWords(wordsData);
      
      // Messages
      const { data: msgsData } = await supabase.from('messages').select('*, players(nickname)').eq('room_id', roomId).order('created_at', { ascending: true });
      if (msgsData) setMessages(msgsData);
    };

    fetchInitialData();

    // Set up Realtime subscriptions
    const channel = supabase.channel(`room:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, payload => {
        // Fetch full room to get users(username) relation easily, or just update status
        supabase.from('rooms').select('*, users(username)').eq('id', roomId).single().then(({data}) => {
          if (data) setRoom(data);
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, async () => {
        const { data } = await supabase.from('players').select('*').eq('room_id', roomId).order('joined_at', { ascending: true });
        if (data) setPlayers(data);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'words', filter: `room_id=eq.${roomId}` }, async () => {
        const { data } = await supabase.from('words').select('*').eq('room_id', roomId).order('created_at', { ascending: true });
        if (data) setWords(data);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, async () => {
        const { data } = await supabase.from('messages').select('*, players(nickname)').eq('room_id', roomId).order('created_at', { ascending: true });
        if (data) setMessages(data);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, userId]);

  const autoJoinRoom = async () => {
    if (!userId || !username || player || isJoining) return;
    setIsJoining(true);
    
    try {
      const { data, error: err } = await supabase.from('players').insert([{
        room_id: roomId,
        user_id: userId,
        nickname: username
      }]).select().single();
      
      if (err) throw err;
      setPlayer(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsJoining(false);
    }
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startGame = async () => {
    if (!player) return;
    const firstPlayerId = players[0]?.id || player.id;
    const randomStartingWord = STARTING_WORDS[Math.floor(Math.random() * STARTING_WORDS.length)];

    // Insert the starting word with the host's player_id but formatted special
    await supabase.from('words').insert([{
      room_id: roomId,
      player_id: player.id,
      word: `[System] ${randomStartingWord}`
    }]);

    await supabase.from('rooms').update({ 
      status: 'playing', 
      current_turn_player_id: firstPlayerId,
      last_turn_timestamp: new Date().toISOString()
    }).eq('id', roomId);
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !player) return;
    
    await supabase.from('messages').insert([{
      room_id: roomId,
      player_id: player.id,
      content: chatInput.trim()
    }]);
    
    setChatInput('');
  };

  const submitWord = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!wordInput.trim() || !player) return;
    
    const word = wordInput.trim();
    
    // Validate turn
    if (room?.current_turn_player_id !== player.id) {
      setError("It's not your turn!");
      return;
    }

    // Basic Korean Word Chain Validation
    if (words.length > 0) {
      // Extract the actual last word if it was a system word (e.g. "[System] 사과" -> "사과")
      let lastWordStr = words[words.length - 1].word;
      if (lastWordStr.startsWith('[System] ')) {
        lastWordStr = lastWordStr.replace('[System] ', '');
      }

      const lastChar = lastWordStr.charAt(lastWordStr.length - 1);
      const firstChar = word.charAt(0);
      
      if (firstChar !== lastChar) {
        setError(`Word must start with '${lastChar}'.`);
        return;
      }
    }

    // Determine next player
    const currentPlayerIndex = players.findIndex(p => p.id === player.id);
    const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
    const nextPlayerId = players[nextPlayerIndex].id;

    // Submit word
    const { error: insertErr } = await supabase.from('words').insert([{
      room_id: roomId,
      player_id: player.id,
      word
    }]);

    if (insertErr) {
      setError("Failed to submit word.");
      return;
    }

    // Update room state
    await supabase.from('rooms').update({
      current_turn_player_id: nextPlayerId,
      last_turn_timestamp: new Date().toISOString()
    }).eq('id', roomId);

    setWordInput('');
  };

  const checkTimeout = async () => {
    if (!room || room.status !== 'playing') return;
    
    const lastTurnTime = new Date(room.last_turn_timestamp).getTime();
    const now = new Date().getTime();
    const diffHours = (now - lastTurnTime) / (1000 * 60 * 60);
    
    if (diffHours >= 1) {
      await supabase.from('rooms').update({
        status: 'finished'
      }).eq('id', roomId);
      alert("Game over! Someone timed out.");
    }
  };

  if (!userId) return null; // Wait for redirect
  if (!room) return <div className={styles.container}><div style={{margin: 'auto'}}>Loading...</div></div>;

  const isMyTurn = room.current_turn_player_id === player?.id;
  const currentTurnPlayer = players.find(p => p.id === room.current_turn_player_id);
  const isHost = room.host_id === userId;

  return (
    <div className={styles.container}>
      {/* Join Overlay (Simplified now that we have global users) */}
      {!player && (
        <div className={styles.joinOverlay}>
          <div className={`glass-panel ${styles.joinModal}`}>
            <h2 className={styles.joinModalTitle}>Join {room.name || 'Game'}</h2>
            <p className={styles.joinModalSubtitle}>You will join as <strong>{username}</strong>.</p>
            
            <div className={styles.avatarPreview}>
              {username?.charAt(0).toUpperCase()}
            </div>

            <button 
              className="btn-primary" 
              onClick={autoJoinRoom} 
              disabled={isJoining}
              style={{marginTop: '1rem'}}
            >
              {isJoining ? 'Joining...' : 'Click to Join Room'}
            </button>
            <button 
              className="btn-primary" 
              onClick={() => router.push('/')} 
              style={{marginTop: '0.5rem', background: 'transparent', border: '1px solid var(--border)'}}
            >
              Back to Lobby
            </button>
          </div>
        </div>
      )}

      {/* Main Game Area */}
      <div className={styles.mainArea}>
        {/* Top Header */}
        <div className={styles.topHeader}>
          <div className={styles.gameInfo}>
            <button 
              onClick={() => router.push('/')} 
              style={{background: 'rgba(255,255,255,0.1)', padding: '0.5rem', borderRadius: '50%', color: 'white', display: 'flex'}}
              title="Back to Lobby"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className={styles.headerTitle} style={{fontSize: '1.25rem'}}>{room.name || 'WolLu Game'}</h2>
              <div style={{fontSize: '0.75rem', color: '#94a3b8'}}>Host: {room.users?.username || 'Unknown'}</div>
            </div>

            {room.status === 'playing' && (
              <button onClick={checkTimeout} style={{marginLeft: '1rem', color: 'var(--accent)', textDecoration: 'underline', fontSize: '0.875rem', background: 'none', border: 'none', cursor: 'pointer'}}>
                Check Timeout
              </button>
            )}
          </div>

          <div className={styles.playerProfiles}>
            {players.map(p => (
              <div key={p.id} className={`${styles.profileItem} ${room.current_turn_player_id === p.id ? styles.activeTurn : ''}`}>
                <div className={styles.profileAvatar}>
                  {p.nickname.charAt(0).toUpperCase()}
                </div>
                <span style={{fontWeight: 600, fontSize: '0.875rem'}}>{p.nickname} {p.id === player?.id && '(You)'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* LOBBY VIEW */}
        {room.status === 'waiting' && (
          <div className={styles.lobbyContainer}>
            <div className={styles.lobbyBox}>
              <div>
                <h2 className={styles.lobbyTitle}>{room.name || 'Game Lobby'}</h2>
                <p className={styles.lobbySubtitle}>
                  Waiting for host to begin. Anyone can join at any time!
                </p>
              </div>

              <div className={styles.linkBox}>
                <div className={styles.linkText}>{typeof window !== 'undefined' ? window.location.href : ''}</div>
                <button className="btn-primary" onClick={copyInviteLink} style={{padding: '0.5rem 1rem'}}>
                  {copied ? 'Copied!' : <><Copy size={16} /> Copy Link</>}
                </button>
              </div>

              {isHost ? (
                <div style={{display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem'}}>
                  <button 
                    className="btn-primary" 
                    onClick={startGame} 
                    style={{fontSize: '1.25rem', padding: '1rem 3rem'}}
                  >
                    <Play size={20} style={{marginRight: '0.5rem', display: 'inline-block', verticalAlign: 'middle'}}/> 
                    Start Game
                  </button>
                </div>
              ) : (
                <div style={{marginTop: '1rem', color: 'var(--primary)', fontWeight: 'bold'}}>
                  Waiting for host ({room.users?.username}) to start the game...
                </div>
              )}
            </div>
          </div>
        )}

        {/* ACTIVE GAME VIEW */}
        {room.status !== 'waiting' && (
          <>
            {/* Turn Indicator Banner */}
            {room.status === 'playing' && (
              <div className={styles.turnBanner}>
                <Clock size={20} />
                <span>It is <strong>{currentTurnPlayer?.nickname}</strong>'s turn!</span>
              </div>
            )}

            <div className={styles.gameBoard}>
              <div className={styles.wordList}>
                {words.map((w, i) => {
                  const isSystem = w.word.startsWith('[System]');
                  const displayWord = isSystem ? w.word.replace('[System] ', '') : w.word;
                  
                  return (
                    <div key={w.id} className={styles.wordItem} style={isSystem ? { borderColor: 'var(--accent)', background: 'rgba(236, 72, 153, 0.1)' } : {}}>
                      {displayWord}
                      <div style={{fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem', fontWeight: 'normal'}}>
                        {isSystem ? '🤖 System' : players.find(p => p.id === w.player_id)?.nickname}
                      </div>
                    </div>
                  );
                })}
                <div ref={wordsEndRef} />
              </div>
            </div>

            {/* Input Area */}
            <div className={styles.inputArea}>
              <form onSubmit={submitWord} style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
                <div style={{display: 'flex', gap: '1rem'}}>
                  <input 
                    type="text" 
                    className="input-base" 
                    placeholder={isMyTurn ? "Type your word..." : "Waiting for your turn..."}
                    value={wordInput}
                    onChange={e => setWordInput(e.target.value)}
                    disabled={!isMyTurn || room.status !== 'playing'}
                  />
                  <button 
                    type="submit" 
                    className="btn-primary" 
                    disabled={!isMyTurn || room.status !== 'playing'}
                  >
                    Submit
                  </button>
                </div>
                {error && <div className={styles.errorText}>{error}</div>}
              </form>
            </div>
          </>
        )}
      </div>

      {/* Chat Sidebar */}
      <div className={styles.chatSidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Chat</h2>
        </div>
        <div className={styles.chatMessages}>
          {messages.map(m => (
            <div key={m.id} className={styles.chatMessage}>
              <div className={styles.sender}>{m.players?.nickname || 'Unknown'}</div>
              <div>{m.content}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <form className={styles.chatInputArea} onSubmit={sendChat}>
          <input 
            type="text" 
            className="input-base" 
            placeholder="Say something..."
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            disabled={!player}
          />
          <button type="submit" className="btn-primary" style={{padding: '0.75rem'}} disabled={!player}>
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
