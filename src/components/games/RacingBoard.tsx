import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/utils/supabase';
import styles from './RacingBoard.module.css';

interface RacingBoardProps {
  room: any;
  roomId: string;
  players: any[];
  player: any;
  isHost: boolean;
}

const MAX_CLICKS = 100;

export default function RacingBoard({ room, roomId, players, player, isHost }: RacingBoardProps) {
  // state: mapping of player_id -> distance (0 to MAX_CLICKS)
  const [distances, setDistances] = useState<Record<string, number>>({});
  const [countdown, setCountdown] = useState<string | null>(null);
  const [isRaceActive, setIsRaceActive] = useState(false);
  const [localFinished, setLocalFinished] = useState(false);

  const channelRef = useRef<any>(null);
  
  const isPlaying = room.status === 'playing';
  const isFinished = room.status === 'finished';

  useEffect(() => {
    // Setup Supabase Presence for Realtime Racing Sync
    const channel = supabase.channel(`racing:${roomId}`, {
      config: {
        presence: {
          key: player?.id || 'spectator',
        },
      },
    });

    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        
        // Convert presence state into distances map
        setDistances((prev) => {
          const newDistances = { ...prev };
          for (const key in state) {
            const presences = state[key] as any[];
            // Take the most recent distance reported by this player
            if (presences && presences.length > 0) {
              const d = presences[0].distance || 0;
              newDistances[key] = Math.max(newDistances[key] || 0, d);
            }
          }
          return newDistances;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && player) {
          // Initialize my distance to 0
          await channel.track({ distance: distances[player.id] || 0 });
        }
      });

    // Listen for Countdown and Winner broadcasts
    channel.on('broadcast', { event: 'race_command' }, ({ payload }) => {
      if (payload.type === 'countdown') {
        setCountdown(payload.value);
        if (payload.value === 'GO!') {
          setIsRaceActive(true);
          setTimeout(() => setCountdown(null), 1000);
        }
      } else if (payload.type === 'winner') {
        setIsRaceActive(false);
        setLocalFinished(true);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, player]);

  const startCountdown = async () => {
    if (!channelRef.current || !isHost) return;
    
    const steps = ['3', '2', '1', 'GO!'];
    for (let i = 0; i < steps.length; i++) {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'race_command',
        payload: { type: 'countdown', value: steps[i] }
      });
      await new Promise(r => setTimeout(r, 1000));
    }
  };

  const handleRaceClick = async () => {
    if (!isPlaying || !player || !isRaceActive || localFinished) return;

    const currentDist = distances[player.id] || 0;
    if (currentDist >= MAX_CLICKS) return;

    const newDist = currentDist + 1;
    
    // Optimistic UI update
    setDistances(prev => ({ ...prev, [player.id]: newDist }));

    // Sync via Presence
    if (channelRef.current) {
      await channelRef.current.track({ distance: newDist });
    }

    // Check Win Condition
    if (newDist >= MAX_CLICKS) {
      // Instantly lock board locally and globally
      setIsRaceActive(false);
      setLocalFinished(true);
      
      await channelRef.current.send({
        type: 'broadcast',
        event: 'race_command',
        payload: { type: 'winner', playerId: player.id }
      });

      // Announce win and finish game
      await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId);
      
      await supabase.from('messages').insert([{
        room_id: roomId,
        player_id: player.id,
        content: `[System] 🏁 ${player.nickname} has WON the race! 🏁`
      }]);
    }
  };

  const gameIsOver = isFinished || localFinished;

  return (
    <div className={styles.container}>
      {isPlaying && !gameIsOver ? (
        <div className={styles.statusBanner}>
          {countdown ? (
            <span style={{ fontSize: '3rem', color: countdown === 'GO!' ? '#22c55e' : 'var(--accent)' }}>
              {countdown}
            </span>
          ) : isRaceActive ? (
            "RACE! Spam the button!"
          ) : isHost ? (
            "Ready to race!"
          ) : (
            "Waiting for Host to start the countdown..."
          )}
        </div>
      ) : gameIsOver ? (
        <div className={styles.statusBanner}>
          🏁 Race Finished! 🏁
        </div>
      ) : (
        <div className={styles.statusBanner}>
          Waiting for host to start...
        </div>
      )}

      <div className={styles.tracksWrapper}>
        {players.map(p => {
          const dist = distances[p.id] || 0;
          const percentage = Math.min((dist / MAX_CLICKS) * 100, 100);
          
          return (
            <div key={p.id} className={styles.trackRow}>
              <div className={styles.playerInfo} style={{color: p.id === player?.id ? 'var(--primary)' : 'inherit'}}>
                {p.nickname} {p.id === player?.id && '(You)'}
              </div>
              <div className={styles.track}>
                <div className={styles.progressFill} style={{ width: `${percentage}%` }} />
                <div className={styles.finishLine} />
                <div className={styles.car} style={{ left: `max(15px, calc(${percentage}% - 15px))` }}>
                  {p.nickname.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.controlsArea}>
        {!isRaceActive && !gameIsOver && isHost && !countdown ? (
          <button 
            className={styles.raceButton} 
            onClick={startCountdown}
            style={{background: 'var(--primary)', color: 'black'}}
          >
            Start Race
          </button>
        ) : (
          <button 
            className={styles.raceButton} 
            onClick={handleRaceClick}
            disabled={!isRaceActive || !player || gameIsOver}
          >
            {gameIsOver ? 'Game Over' : countdown && countdown !== 'GO!' ? 'Wait...' : 'GO!'}
          </button>
        )}
      </div>
    </div>
  );
}
