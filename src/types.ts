// ============== Quiz & Game Types ==============

export interface Question {
  id: string;
  text: string;
  imageUrl?: string; // R2 image URL for picture questions
  answers: [string, string, string, string];
  correctIndices: number[]; // Support multiple correct answers
  timerSeconds: 5 | 10 | 20 | 30 | 60;
  doublePoints: boolean;
}

export interface Quiz {
  id: string;
  title: string;
  questions: Question[];
}

export interface SavedQuiz extends Quiz {
  createdAt: number;
  updatedAt: number;
}

export interface Player {
  id: string;
  nickname: string;
  score: number;
  answers: Record<string, { answerIndices: number[]; timestamp: number }>;
  connected: boolean;
}

export type GamePhase = 'lobby' | 'question' | 'leaderboard' | 'podium' | 'finished';

export interface GameState {
  phase: GamePhase;
  gamePin: string;
  quiz: Quiz | null;
  players: Record<string, Player>;
  currentQuestionIndex: number;
  questionStartTime: number | null;
  hostConnected: boolean;
  timerPaused: boolean;
  pausedAtSecondsLeft: number | null;
}

// ============== WebSocket Message Types ==============

// Client -> Server Messages
export type ClientMessage =
  | { type: 'host_create_quiz'; quiz: Quiz }
  | { type: 'host_start_game' }
  | { type: 'host_next_question' }
  | { type: 'host_show_leaderboard' }
  | { type: 'host_show_podium' }
  | { type: 'player_join'; nickname: string }
  | { type: 'player_rejoin'; playerId: string; nickname: string }
  | { type: 'player_answer'; questionId: string; answerIndices: number[] };

// Server -> Client Messages
export type ServerMessage =
  | { type: 'error'; message: string }
  | { type: 'game_state'; state: GameState }
  | { type: 'player_joined'; player: Player; playerCount: number }
  | { type: 'player_rejoined'; player: Player; playerCount: number }
  | { type: 'player_left'; playerId: string; playerCount: number }
  | { type: 'game_starting' }
  | { type: 'question_start'; question: QuestionForPlayer; questionIndex: number; totalQuestions: number }
  | { type: 'timer_tick'; secondsLeft: number }
  | { type: 'answer_received'; playerId: string }
  | { type: 'question_end'; correctIndices: number[]; scores: LeaderboardEntry[] }
  | { type: 'leaderboard_update'; leaderboard: LeaderboardEntry[] }
  | { type: 'podium_reveal'; position: 1 | 2 | 3; player: LeaderboardEntry | null }
  | { type: 'game_finished'; finalLeaderboard: LeaderboardEntry[] }
  | { type: 'game_paused'; reason: string }
  | { type: 'game_resumed' };

// Question without correct answer (sent to players and host)
export interface QuestionForPlayer {
  id: string;
  text: string;
  imageUrl?: string; // Only sent to host, not to players
  answers: [string, string, string, string];
  timerSeconds: number;
  doublePoints: boolean;
  multipleChoice: boolean; // Tell player if they can select multiple
}

export interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
  lastAnswerCorrect?: boolean;
  pointsGained?: number;
}

// ============== API Types ==============

export interface CreateGameResponse {
  gameId: string;
  gamePin: string;
}

export interface JoinGameResponse {
  gameId: string;
  success: boolean;
}
