import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/utils/supabase';
import styles from './RacingBoard.module.css';

interface RacingBoardProps {
  room: any;
  roomId: string;
  players: any[];
  player: any;
  isHost: boolean;
}

const TOTAL_LAPS = 3;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

interface CarState {
  x: number;
  y: number;
  angle: number;
  lap: number;
  checkpoint: number;
  nickname: string;
  color: string;
}

export default function RacingBoard({ room, roomId, players, player, isHost }: RacingBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const channelRef = useRef<any>(null);
  
  const [countdown, setCountdown] = useState<string | null>(null);
  const [isRaceActive, setIsRaceActive] = useState(false);
  const [localFinished, setLocalFinished] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{nickname: string, lap: number}[]>([]);
  
  const isPlaying = room.status === 'playing';
  const isFinished = room.status === 'finished';
  const gameIsOver = isFinished || localFinished;

  // My car state
  const myCar = useRef({
    x: 400, y: 100,
    vx: 0, vy: 0,
    speed: 0, angle: 0,
    lap: 1, checkpoint: 0,
    color: '#a855f7' // default purple
  });

  // Other players' state
  const otherCars = useRef<Record<string, CarState>>({});

  // Input state
  const keys = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    // Determine color based on player index
    const pIndex = players.findIndex(p => p.id === player?.id);
    const colors = ['#a855f7', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
    if (pIndex >= 0) {
      myCar.current.color = colors[pIndex % colors.length];
      myCar.current.y = 100 + (pIndex * 30); // Stagger starting positions vertically
    }

    // Setup network
    const channel = supabase.channel(`racing:${roomId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'race_command' }, ({ payload }) => {
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
      })
      .on('broadcast', { event: 'update' }, ({ payload }) => {
        if (payload.playerId !== player?.id) {
          otherCars.current[payload.playerId] = {
            x: payload.x,
            y: payload.y,
            angle: payload.angle,
            lap: payload.lap,
            checkpoint: payload.checkpoint,
            nickname: payload.nickname,
            color: payload.color
          };
          updateLeaderboard();
        }
      })
      .subscribe();

    // Broadcast loop (10Hz)
    const broadcastInterval = setInterval(() => {
      if (!isRaceActive && !localFinished && !gameIsOver) return;
      channel.send({
        type: 'broadcast',
        event: 'update',
        payload: {
          playerId: player?.id,
          nickname: player?.nickname,
          x: myCar.current.x,
          y: myCar.current.y,
          angle: myCar.current.angle,
          lap: myCar.current.lap,
          checkpoint: myCar.current.checkpoint,
          color: myCar.current.color
        }
      });
    }, 100);

    return () => {
      clearInterval(broadcastInterval);
      supabase.removeChannel(channel);
    };
  }, [roomId, player, isRaceActive, localFinished, gameIsOver, players]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.key] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.key] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const updateLeaderboard = useCallback(() => {
    const arr = [{ nickname: player?.nickname || 'You', lap: myCar.current.lap, cp: myCar.current.checkpoint }];
    for (const key in otherCars.current) {
      arr.push({ 
        nickname: otherCars.current[key].nickname, 
        lap: otherCars.current[key].lap, 
        cp: otherCars.current[key].checkpoint 
      });
    }
    // Sort by lap descending, then checkpoint descending
    arr.sort((a, b) => {
      if (a.lap !== b.lap) return b.lap - a.lap;
      return b.cp - a.cp;
    });
    setLeaderboard(arr.map(a => ({ nickname: a.nickname, lap: a.lap })));
  }, [player]);

  // Main Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      // 1. Physics Update
      if (isRaceActive && !localFinished && !gameIsOver) {
        let maxSpeed = 5;
        
        // Track collision/grass detection
        // Track center: 400, 300
        // Outer oval: rx=350, ry=250. Inner oval: rx=200, ry=100.
        // Approx distance from center based on ellipse equation: (dx/rx)^2 + (dy/ry)^2
        const dx = myCar.current.x - 400;
        const dy = myCar.current.y - 300;
        // Check outer boundary (radius 300 vs 200 for simplicity)
        const distanceToCenter = Math.sqrt((dx/1.5)**2 + dy**2); 
        
        // Simple ring detection: if too far or too close to center, you are on grass
        const isOnRoad = distanceToCenter > 100 && distanceToCenter < 240;
        if (!isOnRoad) maxSpeed = 1.5;

        // Acceleration
        if (keys.current['ArrowUp'] || keys.current['w']) {
          myCar.current.speed += 0.2;
        } else if (keys.current['ArrowDown'] || keys.current['s']) {
          myCar.current.speed -= 0.3; // Brake / Reverse
        } else {
          // Friction
          myCar.current.speed *= 0.95;
        }

        // Speed caps
        if (myCar.current.speed > maxSpeed) myCar.current.speed -= 0.1; // Slow down gradually on grass
        if (myCar.current.speed < -2) myCar.current.speed = -2;

        // Steering (only when moving)
        if (Math.abs(myCar.current.speed) > 0.1) {
          const steerDir = myCar.current.speed > 0 ? 1 : -1;
          if (keys.current['ArrowLeft'] || keys.current['a']) myCar.current.angle -= 0.05 * steerDir;
          if (keys.current['ArrowRight'] || keys.current['d']) myCar.current.angle += 0.05 * steerDir;
        }

        // Apply velocity
        myCar.current.vx = Math.cos(myCar.current.angle) * myCar.current.speed;
        myCar.current.vy = Math.sin(myCar.current.angle) * myCar.current.speed;
        myCar.current.x += myCar.current.vx;
        myCar.current.y += myCar.current.vy;

        // Wall collisions (screen bounds)
        if (myCar.current.x < 10) myCar.current.x = 10;
        if (myCar.current.x > CANVAS_WIDTH - 10) myCar.current.x = CANVAS_WIDTH - 10;
        if (myCar.current.y < 10) myCar.current.y = 10;
        if (myCar.current.y > CANVAS_HEIGHT - 10) myCar.current.y = CANVAS_HEIGHT - 10;

        // Checkpoints logic (to prevent cheating)
        // 0: top right, 1: bottom right, 2: bottom left, 3: top left
        if (myCar.current.checkpoint === 0 && myCar.current.x > 600 && myCar.current.y > 200) myCar.current.checkpoint = 1;
        if (myCar.current.checkpoint === 1 && myCar.current.x < 600 && myCar.current.y > 400) myCar.current.checkpoint = 2;
        if (myCar.current.checkpoint === 2 && myCar.current.x < 200 && myCar.current.y < 400) myCar.current.checkpoint = 3;
        
        // Finish Line
        if (myCar.current.checkpoint === 3 && myCar.current.x > 350 && myCar.current.x < 450 && myCar.current.y < 200) {
          myCar.current.lap++;
          myCar.current.checkpoint = 0;
          updateLeaderboard();
          
          if (myCar.current.lap > TOTAL_LAPS) {
            handleWin();
          }
        }
      }

      // 2. Render Loop
      // Draw Grass
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw Road (Outer)
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.ellipse(400, 300, 350, 250, 0, 0, 2 * Math.PI);
      ctx.fill();

      // Draw Grass (Inner)
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.ellipse(400, 300, 150, 100, 0, 0, 2 * Math.PI);
      ctx.fill();

      // Draw Finish Line
      ctx.fillStyle = 'white';
      for(let i=0; i<10; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'white' : 'black';
        ctx.fillRect(400, 50 + (i * 10), 10, 10);
        ctx.fillStyle = i % 2 === 0 ? 'black' : 'white';
        ctx.fillRect(410, 50 + (i * 10), 10, 10);
      }

      // Draw Other Cars
      for (const key in otherCars.current) {
        const car = otherCars.current[key];
        drawCar(ctx, car.x, car.y, car.angle, car.color, car.nickname);
      }

      // Draw My Car
      drawCar(ctx, myCar.current.x, myCar.current.y, myCar.current.angle, myCar.current.color, player?.nickname || 'You');

      animationFrameId = window.requestAnimationFrame(render);
    };

    render();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [isRaceActive, localFinished, gameIsOver, player, updateLeaderboard]);

  const drawCar = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, name: string) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    // Draw body
    ctx.fillStyle = color;
    ctx.fillRect(-15, -10, 30, 20);
    
    // Draw windshield
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, -8, 10, 16);

    ctx.restore();

    // Draw Name tag
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(name, x, y - 20);
  };

  const handleWin = async () => {
    setIsRaceActive(false);
    setLocalFinished(true);
    
    if (channelRef.current) {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'race_command',
        payload: { type: 'winner', playerId: player.id }
      });
    }

    await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId);
    await supabase.from('messages').insert([{
      room_id: roomId,
      player_id: player.id,
      content: `[System] 🏁 ${player.nickname} has WON the race! 🏁`
    }]);
  };

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

  // Mobile controls mapping
  const btnDown = (key: string) => { keys.current[key] = true; };
  const btnUp = (key: string) => { keys.current[key] = false; };

  return (
    <div className={styles.container}>
      <div className={styles.canvasWrapper}>
        <canvas 
          ref={canvasRef} 
          width={CANVAS_WIDTH} 
          height={CANVAS_HEIGHT} 
          className={styles.canvas} 
        />
        
        <div className={styles.uiLayer}>
          <div className={styles.lapCounter}>
            Lap: {Math.min(myCar.current.lap, TOTAL_LAPS)} / {TOTAL_LAPS}
          </div>

          <div className={styles.leaderboard}>
            <div style={{fontWeight: 'bold', marginBottom: '5px', borderBottom: '1px solid gray', paddingBottom: '5px'}}>Leaderboard</div>
            {leaderboard.map((lb, i) => (
              <div key={i} style={{marginTop: '5px'}}>
                {i+1}. {lb.nickname} (Lap {Math.min(lb.lap, TOTAL_LAPS)})
              </div>
            ))}
          </div>

          {isPlaying && !gameIsOver && (
            <div className={styles.statusBanner}>
              {countdown ? (
                <span style={{ fontSize: '6rem', color: countdown === 'GO!' ? '#22c55e' : 'var(--accent)' }}>
                  {countdown}
                </span>
              ) : isHost && !isRaceActive ? (
                <button 
                  className="btn-primary" 
                  onClick={startCountdown}
                  style={{fontSize: '2rem', padding: '1rem 3rem'}}
                >
                  Start Race
                </button>
              ) : !isRaceActive ? (
                "Waiting for Host..."
              ) : null}
            </div>
          )}

          {gameIsOver && (
            <div className={styles.statusBanner} style={{background: 'rgba(0,0,0,0.8)', padding: '2rem', borderRadius: '20px'}}>
              🏁 Race Finished! 🏁
            </div>
          )}
        </div>
      </div>

      <div className={styles.controlsArea}>
        <div style={{color: '#94a3b8'}}>Use <strong style={{color: 'white'}}>WASD</strong> or <strong style={{color: 'white'}}>Arrow Keys</strong> to drive.</div>
        
        <div className={styles.mobileControls}>
          <div className={styles.dpad}>
            <button className={`${styles.controlBtn} ${styles.btnUp}`} onPointerDown={() => btnDown('ArrowUp')} onPointerUp={() => btnUp('ArrowUp')} onPointerLeave={() => btnUp('ArrowUp')}>W</button>
            <button className={`${styles.controlBtn} ${styles.btnLeft}`} onPointerDown={() => btnDown('ArrowLeft')} onPointerUp={() => btnUp('ArrowLeft')} onPointerLeave={() => btnUp('ArrowLeft')}>A</button>
            <button className={`${styles.controlBtn} ${styles.btnDown}`} onPointerDown={() => btnDown('ArrowDown')} onPointerUp={() => btnUp('ArrowDown')} onPointerLeave={() => btnUp('ArrowDown')}>S</button>
            <button className={`${styles.controlBtn} ${styles.btnRight}`} onPointerDown={() => btnDown('ArrowRight')} onPointerUp={() => btnUp('ArrowRight')} onPointerLeave={() => btnUp('ArrowRight')}>D</button>
          </div>
        </div>
      </div>
    </div>
  );
}
