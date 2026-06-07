import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/utils/supabase';
import styles from './RacingBoard.module.css';

interface RacingBoardProps {
  room: any;
  roomId: string;
  players: any[];
  player: any;
}

const MAX_CLICKS = 100;

export default function RacingBoard({ room, roomId, players, player }: RacingBoardProps) {
  // state: mapping of player_id -> distance (0 to MAX_CLICKS)
  const [distances, setDistances] = useState<Record<string, number>>({});
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, player]);

  const handleRaceClick = async () => {
    if (!isPlaying || !player) return;

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
      // Announce win and finish game
      await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId);
      
      await supabase.from('messages').insert([{
        room_id: roomId,
        player_id: player.id,
        content: `[System] 🏁 ${player.nickname} has WON the race! 🏁`
      }]);
    }
  };

  return (
    <div className={styles.container}>
      {isPlaying ? (
        <div className={styles.statusBanner}>
          RACE! Spam the button!
        </div>
      ) : isFinished ? (
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
        <button 
          className={styles.raceButton} 
          onClick={handleRaceClick}
          disabled={!isPlaying || !player}
        >
          {isFinished ? 'Game Over' : 'GO!'}
        </button>
      </div>
    </div>
  );
}
