import { useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { QRCodeSVG } from 'qrcode.react';
import { Users, Play, ArrowRight, Trophy, Loader2 } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { gameStore } from '../store/gameStore';
import type { Quiz } from '../../../src/types';

export function HostPresenter() {
  const { gameId } = useParams({ from: '/host/presenter/$gameId' });
  const { send } = useWebSocket(gameId, true);
  
  const state = useStore(gameStore);
  const { gameState, currentQuestion, questionIndex, totalQuestions, secondsLeft, leaderboard, podiumRevealed, reconnecting, isPaused, pauseReason } = state;
  
  // Count only connected players
  const connectedPlayers = gameState ? Object.values(gameState.players).filter(p => p.connected) : [];
  const playerCount = connectedPlayers.length;
  const joinUrl = `${window.location.origin}/play?pin=${gameState?.gamePin}`;

  // Send quiz on connect
  useEffect(() => {
    if (state.connected && state.isHost) {
      const pendingQuiz = sessionStorage.getItem('pending_quiz');
      if (pendingQuiz) {
        const quiz: Quiz = JSON.parse(pendingQuiz);
        send({ type: 'host_create_quiz', quiz });
        sessionStorage.removeItem('pending_quiz');
      }
    }
  }, [state.connected, state.isHost, send]);

  const handleStartGame = () => send({ type: 'host_start_game' });
  const handleNextQuestion = () => send({ type: 'host_next_question' });
  const handleShowPodium = () => send({ type: 'host_show_podium' });

  // Reconnecting overlay
  if (reconnecting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Loader2 className="w-16 h-16 text-brand-orange animate-spin mb-4" />
        <p className="text-white text-2xl">Reconnecting...</p>
      </div>
    );
  }

  // Lobby view
  if (gameState?.phase === 'lobby') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="card max-w-2xl w-full text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Join the Game!</h1>
          <p className="text-gray-300 mb-6">Go to {window.location.origin}/play</p>

          <div className="bg-white rounded-xl p-6 mb-6 inline-block">
            <QRCodeSVG value={joinUrl} size={200} />
          </div>

          <div className="mb-8">
            <p className="text-gray-400 mb-2">Game PIN</p>
            <p className="text-6xl font-extrabold text-brand-orange tracking-widest">
              {gameState.gamePin}
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-xl text-gray-300 mb-6">
            <Users className="w-6 h-6" />
            <span>{playerCount} player{playerCount !== 1 ? 's' : ''} joined</span>
          </div>

          {Object.keys(gameState.players).length > 0 && (
            <div className="mb-6">
              <div className="flex flex-wrap justify-center gap-2">
                {Object.values(gameState.players).map((player) => (
                  <span 
                    key={player.id} 
                    className={`px-3 py-1 rounded-full text-sm ${
                      player.connected 
                        ? 'bg-brand-orange/30 text-white' 
                        : 'bg-gray-600/30 text-gray-400 line-through'
                    }`}
                  >
                    {player.nickname}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleStartGame}
            disabled={playerCount === 0}
            className="btn btn-secondary text-xl flex items-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-6 h-6" />
            Start Game
          </button>
        </div>
      </div>
    );
  }

  // Question view
  if (gameState?.phase === 'question' && currentQuestion) {
    return (
      <div className="min-h-screen flex flex-col p-4">
        <div className="flex justify-between items-center mb-4">
          <span className="text-gray-400">
            Question {questionIndex + 1} of {totalQuestions}
          </span>
          <div className="text-4xl font-bold text-white bg-brand-orange rounded-full w-16 h-16 flex items-center justify-center">
            {secondsLeft}
          </div>
        </div>

        {/* Pause indicator */}
        {isPaused && (
          <div className="mb-4 p-4 bg-yellow-500/20 border-2 border-yellow-500 rounded-xl text-center animate-pulse">
            <p className="text-yellow-300 font-bold text-lg">⏸️ Game Paused - {pauseReason || 'Waiting to resume...'}</p>
          </div>
        )}

        <div className="flex gap-2 justify-center mb-4">
          {currentQuestion.doublePoints && (
            <span className="bg-brand-gold text-black px-4 py-2 rounded-full font-bold text-xl animate-pulse">
              🔥 DOUBLE POINTS 🔥
            </span>
          )}
          {currentQuestion.multipleChoice && (
            <span className="bg-brand-orange text-white px-4 py-1 rounded-full font-bold">
              SELECT ALL CORRECT
            </span>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          {currentQuestion.imageUrl && (
            <img
              src={currentQuestion.imageUrl}
              alt="Question"
              className="max-h-[50vh] max-w-full rounded-2xl border-4 border-white/30 shadow-2xl"
            />
          )}
          {currentQuestion.text && (
            <h2 className="text-4xl font-bold text-white text-center max-w-4xl">
              {currentQuestion.text}
            </h2>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mt-8">
          {currentQuestion.answers.map((answer, index) => (
            <div
              key={index}
              className={`p-6 rounded-xl text-white text-xl font-bold ${
                index === 0 ? 'bg-answer-red' :
                index === 1 ? 'bg-answer-blue' :
                index === 2 ? 'bg-answer-yellow' : 'bg-answer-green'
              }`}
            >
              {answer}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Leaderboard view
  if (gameState?.phase === 'leaderboard') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h2 className="text-4xl font-bold text-white mb-8">Leaderboard</h2>

        <div className="card max-w-xl w-full">
          {leaderboard.slice(0, 5).map((entry, index) => (
            <div
              key={entry.playerId}
              className={`flex items-center justify-between p-4 ${
                index !== leaderboard.length - 1 ? 'border-b border-white/10' : ''
              }`}
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl font-bold text-brand-orange w-8">
                  {entry.rank}
                </span>
                <span className="text-xl text-white">{entry.nickname}</span>
                {entry.lastAnswerCorrect && (
                  <span className="text-green-400 text-sm">✓</span>
                )}
              </div>
              <span className="text-xl font-bold text-brand-gold">{entry.score}</span>
            </div>
          ))}
        </div>

        <button
          onClick={questionIndex + 1 < totalQuestions ? handleNextQuestion : handleShowPodium}
          className="btn btn-primary mt-8 flex items-center gap-2 text-lg"
        >
          {questionIndex + 1 < totalQuestions ? (
            <>
              <ArrowRight className="w-5 h-5" />
              Next Question
            </>
          ) : (
            <>
              <Trophy className="w-5 h-5" />
              Show Podium
            </>
          )}
        </button>
      </div>
    );
  }

  // Podium view
  if (gameState?.phase === 'podium' || gameState?.phase === 'finished') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h2 className="text-4xl font-bold text-white mb-12">🏆 Final Results 🏆</h2>

        <div className="flex items-end justify-center gap-4 mb-8">
          {/* 2nd Place */}
          <div className="flex flex-col items-center">
            {podiumRevealed[1] && (
              <div className="text-center mb-2 animate-bounce-in">
                <p className="text-2xl font-bold text-white">{podiumRevealed[1].nickname}</p>
                <p className="text-brand-gold">{podiumRevealed[1].score} pts</p>
              </div>
            )}
            <div className="bg-gray-400 w-24 h-32 rounded-t-lg flex items-center justify-center">
              <span className="text-4xl font-bold text-white">2</span>
            </div>
          </div>

          {/* 1st Place */}
          <div className="flex flex-col items-center">
            {podiumRevealed[0] && (
              <div className="text-center mb-2 animate-bounce-in">
                <p className="text-3xl font-bold text-white">{podiumRevealed[0].nickname}</p>
                <p className="text-brand-gold text-xl">{podiumRevealed[0].score} pts</p>
              </div>
            )}
            <div className="bg-brand-gold w-28 h-44 rounded-t-lg flex items-center justify-center">
              <span className="text-5xl font-bold text-white">1</span>
            </div>
          </div>

          {/* 3rd Place */}
          <div className="flex flex-col items-center">
            {podiumRevealed[2] && (
              <div className="text-center mb-2 animate-bounce-in">
                <p className="text-xl font-bold text-white">{podiumRevealed[2].nickname}</p>
                <p className="text-brand-gold">{podiumRevealed[2].score} pts</p>
              </div>
            )}
            <div className="bg-amber-700 w-24 h-24 rounded-t-lg flex items-center justify-center">
              <span className="text-3xl font-bold text-white">3</span>
            </div>
          </div>
        </div>

        {gameState?.phase === 'finished' && (
          <p className="text-gray-400 text-xl animate-slide-up">Thanks for playing!</p>
        )}
      </div>
    );
  }

  // Loading / connecting
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-brand-orange mx-auto mb-4"></div>
        <p className="text-gray-400">Connecting...</p>
      </div>
    </div>
  );
}
