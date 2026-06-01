'use client';

import { useEffect, useState, useRef, use } from 'react';
import { supabase } from '@/utils/supabase';
import styles from './room.module.css';
import { Send, Users, Clock, AlertCircle } from 'lucide-react';

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const roomId = resolvedParams.id;
  
  const [player, setPlayer] = useState<{ id: string, nickname: string } | null>(null);
  const [nicknameInput, setNicknameInput] = useState('');
  
  const [room, setRoom] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [words, setWords] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  
  const [wordInput, setWordInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wordsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logic
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    wordsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [words]);

  useEffect(() => {
    const fetchInitialData = async () => {
      // Room
      const { data: roomData } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      if (roomData) setRoom(roomData);
      
      // Players
      const { data: playersData } = await supabase.from('players').select('*').eq('room_id', roomId).order('joined_at', { ascending: true });
      if (playersData) setPlayers(playersData);
      
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
        setRoom(payload.new);
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
  }, [roomId]);

  const joinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nicknameInput.trim()) return;
    
    const { data, error: err } = await supabase.from('players').insert([{
      room_id: roomId,
      nickname: nicknameInput.trim()
    }]).select().single();
    
    if (err) {
      console.error(err);
      return;
    }
    setPlayer(data);
  };

  const startGame = async () => {
    if (players.length < 2) return;
    const firstPlayerId = players[0].id;
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
      const lastWord = words[words.length - 1].word;
      const lastChar = lastWord.charAt(lastWord.length - 1);
      const firstChar = word.charAt(0);
      
      // Simple strict match (no dueum beopchik logic yet)
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

  if (!room) {
    return <div className={styles.container}><div style={{margin: 'auto'}}>Loading...</div></div>;
  }

  const isMyTurn = room.current_turn_player_id === player?.id;
  const currentTurnPlayer = players.find(p => p.id === room.current_turn_player_id);

  return (
    <div className={styles.container}>
      {/* Join Overlay */}
      {!player && (
        <div className={styles.joinOverlay}>
          <div className={`glass-panel ${styles.joinModal}`}>
            <h2 className={styles.sidebarTitle}>Join Game</h2>
            <form onSubmit={joinRoom} style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
              <input 
                type="text" 
                className="input-base" 
                placeholder="Enter your nickname..."
                value={nicknameInput}
                onChange={e => setNicknameInput(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn-primary">Join Room</button>
            </form>
          </div>
        </div>
      )}

      {/* Sidebar: Player List */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Players</h2>
          <div style={{color: '#94a3b8', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
            <Users size={16} /> {players.length} in room
          </div>
        </div>
        <div className={styles.playerList}>
          {players.map(p => (
            <div key={p.id} className={`${styles.playerItem} ${room.current_turn_player_id === p.id ? styles.activeTurn : ''}`}>
              <div className={styles.playerAvatar}>
                {p.nickname.charAt(0).toUpperCase()}
              </div>
              <div style={{flex: 1}}>{p.nickname} {p.id === player?.id && '(You)'}</div>
              {room.current_turn_player_id === p.id && <Clock size={16} color="var(--primary)" />}
            </div>
          ))}
        </div>
      </div>

      {/* Main Game Area */}
      <div className={styles.mainArea}>
        <div className={styles.statusHeader}>
          <div>
            <span style={{color: '#94a3b8'}}>Status: </span>
            <span style={{fontWeight: 'bold', textTransform: 'capitalize'}}>{room.status}</span>
          </div>
          {room.status === 'waiting' && players.length >= 2 && (
            <button className="btn-primary" onClick={startGame}>Start Game</button>
          )}
          {room.status === 'playing' && (
            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <Clock size={16} /> 
              <span>Turn: <strong>{currentTurnPlayer?.nickname}</strong></span>
              <button onClick={checkTimeout} style={{marginLeft: '1rem', color: 'var(--accent)', textDecoration: 'underline'}}>
                Check Timeout
              </button>
            </div>
          )}
        </div>

        <div className={styles.gameBoard}>
          {words.length === 0 && room.status === 'playing' && (
            <div style={{margin: 'auto', color: '#94a3b8', textAlign: 'center'}}>
              <p>Game started!</p>
              <p>{currentTurnPlayer?.nickname}, play the first word.</p>
            </div>
          )}
          <div className={styles.wordList}>
            {words.map((w, i) => (
              <div key={w.id} className={styles.wordItem}>
                {w.word}
                <div style={{fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem', fontWeight: 'normal'}}>
                  {players.find(p => p.id === w.player_id)?.nickname}
                </div>
              </div>
            ))}
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
