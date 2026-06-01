import React from 'react';
import { Clock } from 'lucide-react';
import styles from '@/app/room/[id]/room.module.css';

interface WordChainBoardProps {
  room: any;
  players: any[];
  player: any;
  words: any[];
  isMyTurn: boolean;
  isSubmitting: boolean;
  wordInput: string;
  setWordInput: (val: string) => void;
  submitWord: (e: React.FormEvent) => void;
  error: string | null;
  wordsEndRef: React.RefObject<HTMLDivElement | null>;
}

export default function WordChainBoard({
  room, players, player, words, isMyTurn, isSubmitting,
  wordInput, setWordInput, submitWord, error, wordsEndRef
}: WordChainBoardProps) {
  
  const currentTurnPlayer = players.find(p => p.id === room.current_turn_player_id);

  return (
    <>
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
            const isLatest = i === words.length - 1;
            
            return (
              <div 
                key={w.id} 
                className={`${styles.wordItem} ${isSystem ? styles.systemWord : ''} ${isLatest ? styles.latestWord : ''}`}
              >
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

      <div className={styles.inputArea}>
        <form onSubmit={submitWord} style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
          <div style={{display: 'flex', gap: '1rem'}}>
            <input 
              type="text" 
              className="input-base" 
              placeholder={isMyTurn ? "Type your word..." : "Waiting for your turn..."}
              value={wordInput}
              onChange={e => setWordInput(e.target.value)}
              disabled={!isMyTurn || room.status !== 'playing' || isSubmitting}
            />
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={!isMyTurn || room.status !== 'playing' || isSubmitting}
            >
              {isSubmitting ? '...' : 'Submit'}
            </button>
          </div>
          {error && <div className={styles.errorText}>{error}</div>}
        </form>
      </div>
    </>
  );
}
