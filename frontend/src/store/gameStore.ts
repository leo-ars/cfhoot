import { Store } from '@tanstack/react-store';
import type { GameState, ServerMessage, LeaderboardEntry, QuestionForPlayer } from '../../../src/types';

export interface UIState {
  // Connection state
  connected: boolean;
  playerId: string | null;
  nickname: string | null;
  isHost: boolean;
  
  // Game state from server
  gameState: GameState | null;
  
  // Question state
  currentQuestion: QuestionForPlayer | null;
  questionIndex: number;
  totalQuestions: number;
  secondsLeft: number;
  hasAnswered: boolean;
  selectedAnswer: number | null;
  
  // Results
  leaderboard: LeaderboardEntry[];
  lastCorrectIndex: number | null;
  
  // Podium
  podiumRevealed: (LeaderboardEntry | null)[];
  
  // Errors
  error: string | null;
}

const initialState: UIState = {
  connected: false,
  playerId: null,
  nickname: null,
  isHost: false,
  gameState: null,
  currentQuestion: null,
  questionIndex: 0,
  totalQuestions: 0,
  secondsLeft: 0,
  hasAnswered: false,
  selectedAnswer: null,
  leaderboard: [],
  lastCorrectIndex: null,
  podiumRevealed: [null, null, null],
  error: null,
};

export const gameStore = new Store<UIState>(initialState);

export function resetStore() {
  gameStore.setState(() => initialState);
}

export function handleServerMessage(message: ServerMessage) {
  switch (message.type) {
    case 'error':
      gameStore.setState((state) => ({ ...state, error: message.message }));
      break;
      
    case 'game_state':
      gameStore.setState((state) => ({ ...state, gameState: message.state, error: null }));
      break;
      
    case 'player_joined':
      gameStore.setState((state) => ({
        ...state,
        gameState: state.gameState
          ? { ...state.gameState, players: { ...state.gameState.players, [message.player.id]: message.player } }
          : null,
      }));
      break;
      
    case 'player_left':
      gameStore.setState((state) => {
        if (!state.gameState) return state;
        const { [message.playerId]: _, ...players } = state.gameState.players;
        return { ...state, gameState: { ...state.gameState, players } };
      });
      break;
      
    case 'game_starting':
      gameStore.setState((state) => ({
        ...state,
        gameState: state.gameState ? { ...state.gameState, phase: 'question' } : null,
      }));
      break;
      
    case 'question_start':
      gameStore.setState((state) => ({
        ...state,
        currentQuestion: message.question,
        questionIndex: message.questionIndex,
        totalQuestions: message.totalQuestions,
        secondsLeft: message.question.timerSeconds,
        hasAnswered: false,
        selectedAnswer: null,
        lastCorrectIndex: null,
        gameState: state.gameState ? { ...state.gameState, phase: 'question' } : null,
      }));
      break;
      
    case 'timer_tick':
      gameStore.setState((state) => ({ ...state, secondsLeft: message.secondsLeft }));
      break;
      
    case 'answer_received':
      // Could track who answered for display
      break;
      
    case 'question_end':
      gameStore.setState((state) => ({
        ...state,
        lastCorrectIndex: message.correctIndex,
        leaderboard: message.scores,
      }));
      break;
      
    case 'leaderboard_update':
      gameStore.setState((state) => ({
        ...state,
        leaderboard: message.leaderboard,
        gameState: state.gameState ? { ...state.gameState, phase: 'leaderboard' } : null,
      }));
      break;
      
    case 'podium_reveal':
      gameStore.setState((state) => {
        const podiumRevealed = [...state.podiumRevealed];
        podiumRevealed[message.position - 1] = message.player;
        return {
          ...state,
          podiumRevealed,
          gameState: state.gameState ? { ...state.gameState, phase: 'podium' } : null,
        };
      });
      break;
      
    case 'game_finished':
      gameStore.setState((state) => ({
        ...state,
        leaderboard: message.finalLeaderboard,
        gameState: state.gameState ? { ...state.gameState, phase: 'finished' } : null,
      }));
      break;
  }
}
