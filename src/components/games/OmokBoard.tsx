import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import styles from './OmokBoard.module.css';
import { Clock } from 'lucide-react';

interface OmokBoardProps {
  room: any;
  roomId: string;
  players: any[];
  player: any;
  isMyTurn: boolean;
}

export default function OmokBoard({ room, roomId, players, player, isMyTurn }: OmokBoardProps) {
  const [moves, setMoves] = useState<any[]>([]);
  const [isPlacing, setIsPlacing] = useState(false);

  // The first player to join is Player 1 (Purple), the second is Player 2 (Pink)
  const player1 = players[0];
  const player2 = players[1];
  
  // Am I one of the two players? Or just a spectator?
  const isPlaying = player?.id === player1?.id || player?.id === player2?.id;

  useEffect(() => {
    const fetchMoves = async () => {
      const { data } = await supabase.from('omok_moves').select('*').eq('room_id', roomId).order('created_at', { ascending: true });
      if (data) setMoves(data);
    };

    fetchMoves();

    const channel = supabase.channel(`omok:${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'omok_moves', filter: `room_id=eq.${roomId}` }, payload => {
        setMoves(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const checkWinCondition = (newMoves: any[], lastX: number, lastY: number, pId: string) => {
    // 5 in a row check (horizontal, vertical, diagonal)
    const directions = [
      [[1, 0], [-1, 0]], // horizontal
      [[0, 1], [0, -1]], // vertical
      [[1, 1], [-1, -1]], // diagonal down-right
      [[1, -1], [-1, 1]] // diagonal up-right
    ];

    const isStoneHere = (x: number, y: number) => newMoves.some(m => m.x === x && m.y === y && m.player_id === pId);

    for (const [dir1, dir2] of directions) {
      let count = 1;
      // Check dir1
      let cx = lastX + dir1[0];
      let cy = lastY + dir1[1];
      while (isStoneHere(cx, cy)) {
        count++;
        cx += dir1[0];
        cy += dir1[1];
      }
      // Check dir2
      cx = lastX + dir2[0];
      cy = lastY + dir2[1];
      while (isStoneHere(cx, cy)) {
        count++;
        cx += dir2[0];
        cy += dir2[1];
      }

      if (count >= 5) return true;
    }
    return false;
  };

  const handleCellClick = async (x: number, y: number) => {
    if (!isPlaying || !isMyTurn || room.status !== 'playing' || isPlacing) return;
    
    // Check if cell is occupied
    if (moves.some(m => m.x === x && m.y === y)) return;

    setIsPlacing(true);

    const { error } = await supabase.from('omok_moves').insert([{
      room_id: roomId,
      player_id: player.id,
      x, y
    }]);

    if (!error) {
      // Optimistic check for win
      const newMoves = [...moves, { room_id: roomId, player_id: player.id, x, y }];
      const hasWon = checkWinCondition(newMoves, x, y, player.id);

      if (hasWon) {
        await supabase.from('rooms').update({
          status: 'finished'
        }).eq('id', roomId);
        
        await supabase.from('messages').insert([{
          room_id: roomId,
          player_id: player.id,
          content: `[System] 🎉 ${player.nickname} has won the game! 🎉`
        }]);
      } else {
        // Pass turn
        const nextPlayerId = player.id === player1.id ? player2.id : player1.id;
        await supabase.from('rooms').update({
          current_turn_player_id: nextPlayerId,
          last_turn_timestamp: new Date().toISOString()
        }).eq('id', roomId);
      }
    }

    setIsPlacing(false);
  };

  const currentTurnPlayer = players.find(p => p.id === room.current_turn_player_id);

  // Generate 15x15 grid
  const cells = [];
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      const move = moves.find(m => m.x === x && m.y === y);
      const isLastMove = moves.length > 0 && moves[moves.length - 1].x === x && moves[moves.length - 1].y === y;
      
      let stoneClass = '';
      if (move) {
        stoneClass = move.player_id === player1?.id ? styles.player1Stone : styles.player2Stone;
      }

      cells.push(
        <div 
          key={`${x}-${y}`} 
          className={styles.cell} 
          onClick={() => handleCellClick(x, y)}
        >
          {move && (
            <div className={`${styles.stone} ${stoneClass}`}>
              {isLastMove && <div className={styles.lastMoveIndicator} />}
            </div>
          )}
        </div>
      );
    }
  }

  return (
    <div className={styles.boardContainer}>
      {room.status === 'playing' ? (
        <div style={{marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', color: 'var(--primary)'}}>
          <Clock size={20} />
          <span>It is <strong>{currentTurnPlayer?.nickname}</strong>'s turn!</span>
        </div>
      ) : room.status === 'finished' ? (
        <div style={{marginBottom: '1rem', fontSize: '1.25rem', color: 'var(--accent)', fontWeight: 'bold'}}>
          Game Over!
        </div>
      ) : null}

      <div className={styles.grid}>
        {cells}
      </div>

      <div style={{marginTop: '2rem', display: 'flex', gap: '2rem'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
          <div className={`${styles.stone} ${styles.player1Stone}`} style={{position: 'relative'}} />
          <span style={{marginLeft: '1.5rem'}}>{player1?.nickname || 'Waiting...'} {player1?.id === player?.id ? '(You)' : ''}</span>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
          <div className={`${styles.stone} ${styles.player2Stone}`} style={{position: 'relative'}} />
          <span style={{marginLeft: '1.5rem'}}>{player2?.nickname || 'Waiting...'} {player2?.id === player?.id ? '(You)' : ''}</span>
        </div>
      </div>
      
      {!isPlaying && player && room.status !== 'waiting' && (
        <div style={{marginTop: '1rem', color: '#94a3b8', fontStyle: 'italic'}}>
          You are spectating this game.
        </div>
      )}
    </div>
  );
}
