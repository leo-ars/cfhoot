import { useState, useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { Triangle, Square, Circle, Star, CheckCircle, XCircle, Send, Loader2 } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { gameStore } from '../store/gameStore';

const answerIcons = [Triangle, Square, Circle, Star];
const answerColors = ['bg-answer-red', 'bg-answer-blue', 'bg-answer-yellow', 'bg-answer-green'];

// Session storage for auto-rejoin
interface PlayerSession {
  playerId: string;
  nickname: string;
}

function getStoredSession(gameId: string): PlayerSession | null {
  try {
    const stored = localStorage.getItem(`cfhoot_session_${gameId}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function storeSession(gameId: string, session: PlayerSession): void {
  try {
    localStorage.setItem(`cfhoot_session_${gameId}`, JSON.stringify(session));
  } catch (error) {
    console.warn('Failed to store session in localStorage:', error);
    // Silently fail - not critical for gameplay
  }
}

export function PlayerGame() {
  const { gameId } = useParams({ from: '/play/$gameId' });
  const { send } = useWebSocket(gameId, false);
  
  const state = useStore(gameStore);
  const { gameState, currentQuestion, secondsLeft, hasAnswered, selectedAnswers, lastCorrectIndices, leaderboard, error, connected, reconnecting, isPaused, pauseReason, showingAnswerReveal, answerDistribution, lastQuestionText, lastQuestionAnswers } = state;
  
  const [nickname, setNickname] = useState('');
  const [joined, setJoined] = useState(false);
  const [rejoinSentThisConnection, setRejoinSentThisConnection] = useState(false);

  // Reset rejoin tracking when disconnected (enables rejoin on reconnect)
  useEffect(() => {
    if (!connected) {
      setRejoinSentThisConnection(false);
    }
  }, [connected]);

  // Auto-rejoin on connect if we have a stored session
  useEffect(() => {
    if (!connected || rejoinSentThisConnection) return;

    const storedSession = getStoredSession(gameId);
    if (storedSession) {
      setNickname(storedSession.nickname);
      send({ type: 'player_rejoin', playerId: storedSession.playerId, nickname: storedSession.nickname });
      setRejoinSentThisConnection(true);
    }
  }, [connected, rejoinSentThisConnection, gameId, send]);

  // Handle successful rejoin - detect from gameState players
  useEffect(() => {
    if (!gameState || joined) return;

    const storedSession = getStoredSession(gameId);
    if (storedSession && rejoinSentThisConnection) {
      const player = gameState.players[storedSession.playerId];
      if (player && player.connected) {
        setNickname(player.nickname);
        setJoined(true);
        
        // Check if player already answered current question
        if (currentQuestion && player.answers[currentQuestion.id]) {
          gameStore.setState((s) => ({ 
            ...s, 
            hasAnswered: true,
            selectedAnswers: player.answers[currentQuestion.id].answerIndices 
          }));
        }
      }
    }
  }, [gameState, joined, gameId, rejoinSentThisConnection, currentQuestion]);

  // Store session when we join and find our playerId
  useEffect(() => {
    if (!gameState || !joined || !nickname) return;

    const myPlayer = Object.values(gameState.players).find(
      (p) => p.nickname.toLowerCase() === nickname.toLowerCase()
    );

    if (myPlayer) {
      storeSession(gameId, { playerId: myPlayer.id, nickname: myPlayer.nickname });
    }
  }, [gameState, joined, nickname, gameId]);

  // Find player's rank
  const myRank = leaderboard.find((e) => 
    e.nickname.toLowerCase() === nickname.toLowerCase()
  );

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    send({ type: 'player_join', nickname: nickname.trim() });
    setJoined(true);
  };

  const toggleAnswer = (index: number) => {
    if (hasAnswered || !currentQuestion) return;
    gameStore.setState((s) => {
      const answers = new Set(s.selectedAnswers);
      if (answers.has(index)) {
        answers.delete(index);
      } else {
        answers.add(index);
      }
      return { ...s, selectedAnswers: Array.from(answers) };
    });
  };

  const submitAnswer = () => {
    if (hasAnswered || !currentQuestion || selectedAnswers.length === 0) return;
    gameStore.setState((s) => ({ ...s, hasAnswered: true }));
    send({ type: 'player_answer', questionId: currentQuestion.id, answerIndices: selectedAnswers });
  };

  // For single-choice, auto-submit
  const handleAnswer = (index: number) => {
    if (hasAnswered || !currentQuestion) return;
    if (currentQuestion.multipleChoice) {
      toggleAnswer(index);
    } else {
      gameStore.setState((s) => ({ ...s, hasAnswered: true, selectedAnswers: [index] }));
      send({ type: 'player_answer', questionId: currentQuestion.id, answerIndices: [index] });
    }
  };

  // Reconnecting overlay
  if (reconnecting && joined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-brand-orange animate-spin mb-4" />
        <p className="text-white text-xl">Reconnecting...</p>
      </div>
    );
  }

  // Game paused overlay
  if (isPaused && joined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="card max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-yellow-500/30 flex items-center justify-center mx-auto mb-4">
            <div className="w-12 h-12 border-4 border-yellow-500 rounded-full"></div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Game Paused</h2>
          <p className="text-gray-300">{pauseReason || 'Waiting to resume...'}</p>
          <div className="mt-4 animate-pulse">
            <div className="w-12 h-12 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        </div>
      </div>
    );
  }

  // Nickname entry
  if (!joined || (error && !gameState)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="text-4xl font-extrabold text-white mb-8">
          CF<span className="text-brand-orange">Hoot</span>
        </h1>

        {/* Show if attempting auto-rejoin */}
        {rejoinSentThisConnection && !error && !joined && (
          <div className="card max-w-sm w-full mb-4 text-center">
            <Loader2 className="w-8 h-8 text-brand-orange animate-spin mx-auto mb-2" />
            <p className="text-gray-300">Reconnecting to game...</p>
          </div>
        )}

        <form onSubmit={handleJoin} className="card max-w-sm w-full">
          <label className="block text-gray-300 mb-2">Choose your nickname</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 20))}
            placeholder="Cool Nickname"
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-4 text-xl text-white text-center placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-orange mb-4"
            autoFocus
          />

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300 text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!nickname.trim() || (rejoinSentThisConnection && !error)}
            className="btn btn-primary w-full text-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Join Game
          </button>
        </form>
      </div>
    );
  }

  // Waiting in lobby
  if (gameState?.phase === 'lobby') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-4">You're in!</h2>
          <p className="text-6xl font-extrabold text-brand-orange mb-4">{nickname}</p>
          <p className="text-gray-400">Waiting for host to start the game...</p>
          <div className="mt-8 animate-pulse">
            <div className="w-16 h-16 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        </div>
      </div>
    );
  }

  // Answering question
  if (gameState?.phase === 'question' && currentQuestion && !hasAnswered) {
    return (
      <div className="min-h-screen flex flex-col p-4">
        <div className="flex justify-between items-center mb-4">
          <span className="text-gray-400 flex-1">{currentQuestion.text}</span>
          <div className="text-2xl font-bold text-white bg-brand-orange rounded-full w-12 h-12 flex items-center justify-center">
            {secondsLeft}
          </div>
        </div>

        <div className="flex gap-2 justify-center mb-4">
          {currentQuestion.doublePoints && (
            <span className="bg-brand-gold text-black px-3 py-1 rounded-full text-sm font-bold animate-pulse">
              🔥 DOUBLE POINTS 🔥
            </span>
          )}
          {currentQuestion.multipleChoice && (
            <span className="bg-brand-orange text-white px-3 py-1 rounded-full text-sm font-bold">
              SELECT MULTIPLE
            </span>
          )}
        </div>

        <div className="flex-1 grid grid-cols-2 gap-3">
          {currentQuestion.answers.map((_, index) => {
            const Icon = answerIcons[index];
            const isSelected = selectedAnswers.includes(index);
            return (
              <button
                key={index}
                onClick={() => handleAnswer(index)}
                className={`answer-btn ${answerColors[index]} justify-center relative ${isSelected ? 'ring-4 ring-white' : ''}`}
              >
                <Icon className="w-12 h-12" fill="white" />
                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {currentQuestion.multipleChoice && selectedAnswers.length > 0 && (
          <button
            onClick={submitAnswer}
            className="mt-4 btn btn-primary flex items-center justify-center gap-2 text-lg"
          >
            <Send className="w-5 h-5" />
            Submit ({selectedAnswers.length} selected)
          </button>
        )}
      </div>
    );
  }

  // Waiting for results (answered)
  if (gameState?.phase === 'question' && hasAnswered) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="w-24 h-24 rounded-full bg-brand-orange/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-16 h-16 text-brand-orange" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Answer submitted!</h2>
          <p className="text-gray-400">Waiting for time to run out...</p>
        </div>
      </div>
    );
  }

  // Answer reveal screen (shown after question ends)
  if (showingAnswerReveal && lastQuestionAnswers) {
    const wasCorrect = 
      selectedAnswers.length === lastCorrectIndices.length &&
      selectedAnswers.every(a => lastCorrectIndices.includes(a));
    const answerColors = ['bg-answer-red', 'bg-answer-blue', 'bg-answer-yellow', 'bg-answer-green'];
    const maxCount = Math.max(...answerDistribution, 1);
    
    return (
      <div className="min-h-screen flex flex-col p-4">
        {/* Result indicator at top */}
        <div className="text-center mb-6">
          {wasCorrect ? (
            <div className="inline-flex items-center gap-2 bg-green-500/20 px-6 py-3 rounded-full animate-bounce-in">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <span className="text-2xl font-bold text-green-500">Correct!</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 bg-red-500/20 px-6 py-3 rounded-full animate-bounce-in">
              <XCircle className="w-8 h-8 text-red-500" />
              <span className="text-2xl font-bold text-red-500">Wrong!</span>
            </div>
          )}
        </div>

        {/* Answer distribution */}
        <div className="flex-1 grid grid-cols-2 gap-3">
          {lastQuestionAnswers.map((answer, index) => {
            const count = answerDistribution[index] || 0;
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const isCorrect = lastCorrectIndices.includes(index);
            const wasSelected = selectedAnswers.includes(index);
            
            return (
              <div key={index} className="relative flex flex-col">
                <div className={`${answerColors[index]} rounded-xl p-4 text-white relative overflow-hidden flex-1 ${isCorrect ? 'ring-4 ring-green-400' : ''} ${wasSelected ? 'ring-2 ring-white' : ''}`}>
                  {/* Background bar */}
                  <div 
                    className="absolute inset-0 bg-white/20 transition-all duration-1000 ease-out"
                    style={{ width: `${percentage}%` }}
                  />
                  
                  {/* Content */}
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold opacity-75">#{index + 1}</span>
                      <div className="flex gap-1">
                        {isCorrect && <span className="text-xl">✓</span>}
                        {wasSelected && <span className="text-lg opacity-75">👆</span>}
                      </div>
                    </div>
                    <p className="text-sm font-bold mb-auto line-clamp-3">{answer}</p>
                    <div className="flex items-baseline gap-1 mt-2">
                      <span className="text-2xl font-extrabold">{count}</span>
                      <span className="text-xs opacity-75">
                        {count === 1 ? 'player' : 'players'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-4">
          <p className="text-gray-400 text-sm">Results coming up...</p>
        </div>
      </div>
    );
  }

  // Question results / Leaderboard
  if (lastCorrectIndices.length > 0 || gameState?.phase === 'leaderboard') {
    const wasCorrect = 
      selectedAnswers.length === lastCorrectIndices.length &&
      selectedAnswers.every(a => lastCorrectIndices.includes(a));
    
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center">
          {wasCorrect ? (
            <>
              <div className="w-24 h-24 rounded-full bg-green-500/30 flex items-center justify-center mx-auto mb-6 animate-bounce-in">
                <CheckCircle className="w-16 h-16 text-green-500" />
              </div>
              <h2 className="text-3xl font-bold text-green-500 mb-2">Correct!</h2>
            </>
          ) : (
            <>
              <div className="w-24 h-24 rounded-full bg-red-500/30 flex items-center justify-center mx-auto mb-6 animate-bounce-in">
                <XCircle className="w-16 h-16 text-red-500" />
              </div>
              <h2 className="text-3xl font-bold text-red-500 mb-2">Wrong!</h2>
            </>
          )}

          {myRank && (
            <div className="mt-6">
              <p className="text-gray-400">Your score</p>
              <p className="text-4xl font-bold text-brand-gold">{myRank.score}</p>
              <p className="text-gray-400 mt-2">Position: {myRank.rank}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Podium / Finished
  if (gameState?.phase === 'podium' || gameState?.phase === 'finished') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-6">🎉 Game Over! 🎉</h2>
          
          {myRank && (
            <>
              <p className="text-gray-400 mb-2">Your final position</p>
              <p className="text-6xl font-extrabold text-brand-orange mb-4">#{myRank.rank}</p>
              <p className="text-2xl text-brand-gold font-bold">{myRank.score} points</p>
            </>
          )}

          <p className="text-gray-400 mt-8">Thanks for playing!</p>
        </div>
      </div>
    );
  }

  // Loading
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-brand-orange mx-auto mb-4"></div>
        <p className="text-gray-400">Loading...</p>
      </div>
    </div>
  );
}
