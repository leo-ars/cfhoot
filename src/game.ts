import { DurableObject } from 'cloudflare:workers';
import type {
  GameState,
  Quiz,
  Player,
  ClientMessage,
  ServerMessage,
  LeaderboardEntry,
  QuestionForPlayer,
} from './types';

interface WebSocketSession {
  ws: WebSocket;
  playerId: string | null;
  isHost: boolean;
}

export class GameDurableObject extends DurableObject<Env> {
  private state!: GameState;
  private sessions: Map<WebSocket, WebSocketSession> = new Map();
  private timerInterval: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Load persisted state on startup
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<GameState>('gameState');
      if (stored) {
        this.state = stored;
        // Reset connection states since WebSockets don't survive restart
        this.state.hostConnected = false;
        for (const player of Object.values(this.state.players)) {
          player.connected = false;
        }
        
        // Handle interrupted question (DO was evicted mid-question)
        if (this.state.phase === 'question' && this.state.questionStartTime && this.state.quiz) {
          const question = this.state.quiz.questions[this.state.currentQuestionIndex];
          if (question) {
            const elapsed = Math.floor((Date.now() - this.state.questionStartTime) / 1000);
            if (elapsed >= question.timerSeconds) {
              // Time already expired - move to leaderboard
              this.state.phase = 'leaderboard';
              await ctx.storage.put('gameState', this.state);
            }
            // If time remaining, timer will restart when clients reconnect
          }
        }
      } else {
        this.state = {
          phase: 'lobby',
          gamePin: this.generatePin(),
          quiz: null,
          players: {},
          currentQuestionIndex: -1,
          questionStartTime: null,
          hostConnected: false,
        };
      }
    });
  }

  private async saveState(): Promise<void> {
    await this.ctx.storage.put('gameState', this.state);
  }

  private generatePin(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // REST endpoints
    if (url.pathname === '/state' && request.method === 'GET') {
      return Response.json({ gamePin: this.state.gamePin, phase: this.state.phase });
    }

    if (url.pathname === '/pin' && request.method === 'GET') {
      return Response.json({ gamePin: this.state.gamePin });
    }

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const isHost = url.searchParams.get('host') === 'true';
      return this.handleWebSocket(request, isHost);
    }

    return new Response('Not found', { status: 404 });
  }

  private handleWebSocket(request: Request, isHost: boolean): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const session: WebSocketSession = {
      ws: server,
      playerId: null,
      isHost,
    };

    this.sessions.set(server, session);
    server.accept();

    if (isHost) {
      this.state.hostConnected = true;
    }

    server.addEventListener('message', (event) => {
      this.handleMessage(server, session, event.data as string);
    });

    server.addEventListener('close', () => {
      this.handleClose(server, session);
    });

    server.addEventListener('error', () => {
      this.handleClose(server, session);
    });

    // Send current state to new connection
    this.send(server, { type: 'game_state', state: this.getPublicState() });

    // If mid-question, send current question to reconnecting client
    if (this.state.phase === 'question' && this.state.questionStartTime && this.state.quiz) {
      const question = this.state.quiz.questions[this.state.currentQuestionIndex];
      if (question) {
        const elapsed = Math.floor((Date.now() - this.state.questionStartTime) / 1000);
        const remaining = Math.max(0, question.timerSeconds - elapsed);
        
        // Send question to this client
        const questionForPlayer: QuestionForPlayer = {
          id: question.id,
          text: question.text,
          answers: question.answers,
          timerSeconds: question.timerSeconds,
          doublePoints: question.doublePoints,
          multipleChoice: question.correctIndices.length > 1,
          imageUrl: isHost ? question.imageUrl : undefined,
        };
        
        this.send(server, {
          type: 'question_start',
          question: questionForPlayer,
          questionIndex: this.state.currentQuestionIndex,
          totalQuestions: this.state.quiz.questions.length,
        });
        this.send(server, { type: 'timer_tick', secondsLeft: remaining });
        
        // Restart timer if it was lost (DO eviction recovery)
        if (!this.timerInterval) {
          if (remaining > 0) {
            let secondsLeft = remaining;
            this.timerInterval = setInterval(() => {
              secondsLeft--;
              if (secondsLeft > 0) {
                this.broadcast({ type: 'timer_tick', secondsLeft });
              } else {
                this.endQuestion();
              }
            }, 1000) as unknown as number;
          } else {
            // Time expired while disconnected - end question
            this.endQuestion();
          }
        }
      }
    }
    
    // If in leaderboard phase, send leaderboard
    if (this.state.phase === 'leaderboard') {
      const leaderboard = this.calculateLeaderboard();
      this.send(server, { type: 'leaderboard_update', leaderboard });
    }
    
    // If in podium/finished phase, send podium reveals immediately
    if (this.state.phase === 'podium' || this.state.phase === 'finished') {
      const leaderboard = this.calculateLeaderboard();
      // Send all podium reveals at once for reconnecting client
      this.send(server, { type: 'podium_reveal', position: 3, player: leaderboard[2] ?? null });
      this.send(server, { type: 'podium_reveal', position: 2, player: leaderboard[1] ?? null });
      this.send(server, { type: 'podium_reveal', position: 1, player: leaderboard[0] ?? null });
      if (this.state.phase === 'finished') {
        this.send(server, { type: 'game_finished', finalLeaderboard: leaderboard });
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleMessage(ws: WebSocket, session: WebSocketSession, data: string): void {
    let message: ClientMessage;
    try {
      message = JSON.parse(data);
    } catch {
      this.send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    switch (message.type) {
      case 'host_create_quiz':
        this.handleHostCreateQuiz(ws, session, message.quiz);
        break;
      case 'host_start_game':
        this.handleHostStartGame(ws, session);
        break;
      case 'host_next_question':
        this.handleHostNextQuestion(ws, session);
        break;
      case 'host_show_leaderboard':
        this.handleHostShowLeaderboard(ws, session);
        break;
      case 'host_show_podium':
        this.handleHostShowPodium(ws, session);
        break;
      case 'player_join':
        this.handlePlayerJoin(ws, session, message.nickname);
        break;
      case 'player_rejoin':
        this.handlePlayerRejoin(ws, session, message.playerId, message.nickname);
        break;
      case 'player_answer':
        this.handlePlayerAnswer(ws, session, message.questionId, message.answerIndices);
        break;
      default:
        this.send(ws, { type: 'error', message: 'Unknown message type' });
    }
  }

  private async handleHostCreateQuiz(ws: WebSocket, session: WebSocketSession, quiz: Quiz): Promise<void> {
    if (!session.isHost) {
      this.send(ws, { type: 'error', message: 'Not authorized' });
      return;
    }
    this.state.quiz = quiz;
    await this.saveState();
    this.broadcast({ type: 'game_state', state: this.getPublicState() });
  }

  private handleHostStartGame(ws: WebSocket, session: WebSocketSession): void {
    if (!session.isHost) {
      this.send(ws, { type: 'error', message: 'Not authorized' });
      return;
    }
    if (!this.state.quiz || this.state.quiz.questions.length === 0) {
      this.send(ws, { type: 'error', message: 'No quiz loaded' });
      return;
    }
    // Check for connected players
    const connectedPlayers = Object.values(this.state.players).filter(p => p.connected);
    if (connectedPlayers.length === 0) {
      this.send(ws, { type: 'error', message: 'No players connected' });
      return;
    }

    this.broadcast({ type: 'game_starting' });

    // Start first question after a short delay
    setTimeout(() => this.startQuestion(0), 3000);
  }

  private handleHostNextQuestion(ws: WebSocket, session: WebSocketSession): void {
    if (!session.isHost) {
      this.send(ws, { type: 'error', message: 'Not authorized' });
      return;
    }
    if (this.state.phase !== 'leaderboard') {
      this.send(ws, { type: 'error', message: 'Cannot advance question now' });
      return;
    }

    const nextIndex = this.state.currentQuestionIndex + 1;
    if (nextIndex < (this.state.quiz?.questions.length ?? 0)) {
      this.startQuestion(nextIndex);
    } else {
      this.handleHostShowPodium(ws, session);
    }
  }

  private handleHostShowLeaderboard(ws: WebSocket, session: WebSocketSession): void {
    if (!session.isHost) {
      this.send(ws, { type: 'error', message: 'Not authorized' });
      return;
    }
    this.showLeaderboard();
  }

  private handleHostShowPodium(ws: WebSocket, session: WebSocketSession): void {
    if (!session.isHost) {
      this.send(ws, { type: 'error', message: 'Not authorized' });
      return;
    }
    this.showPodium();
  }

  private async showPodium(): Promise<void> {
    this.state.phase = 'podium';
    await this.saveState();
    const leaderboard = this.calculateLeaderboard();

    // Reveal podium positions with delays
    setTimeout(() => {
      this.broadcast({ type: 'podium_reveal', position: 3, player: leaderboard[2] ?? null });
    }, 1000);

    setTimeout(() => {
      this.broadcast({ type: 'podium_reveal', position: 2, player: leaderboard[1] ?? null });
    }, 3000);

    setTimeout(() => {
      this.broadcast({ type: 'podium_reveal', position: 1, player: leaderboard[0] ?? null });
      this.state.phase = 'finished';
      this.broadcast({ type: 'game_finished', finalLeaderboard: leaderboard });
    }, 5000);
  }

  private handlePlayerJoin(ws: WebSocket, session: WebSocketSession, nickname: string): void {
    if (session.isHost) {
      this.send(ws, { type: 'error', message: 'Host cannot join as player' });
      return;
    }
    if (this.state.phase !== 'lobby') {
      this.send(ws, { type: 'error', message: 'Game already in progress' });
      return;
    }
    if (!nickname || nickname.trim().length === 0) {
      this.send(ws, { type: 'error', message: 'Nickname required' });
      return;
    }

    // Check for duplicate nicknames
    const existingNicknames = Object.values(this.state.players).map((p) => p.nickname.toLowerCase());
    if (existingNicknames.includes(nickname.toLowerCase().trim())) {
      this.send(ws, { type: 'error', message: 'Nickname already taken' });
      return;
    }

    const playerId = this.generateId();
    const player: Player = {
      id: playerId,
      nickname: nickname.trim(),
      score: 0,
      answers: {},
      connected: true,
    };

    session.playerId = playerId;
    this.state.players[playerId] = player;
    this.saveState(); // Persist new player

    const playerCount = Object.keys(this.state.players).length;
    this.broadcast({ type: 'player_joined', player, playerCount });
    this.send(ws, { type: 'game_state', state: this.getPublicState() });
  }

  private async handlePlayerRejoin(
    ws: WebSocket,
    session: WebSocketSession,
    playerId: string,
    nickname: string
  ): Promise<void> {
    if (session.isHost) {
      this.send(ws, { type: 'error', message: 'Host cannot rejoin as player' });
      return;
    }

    // Check if player exists
    const existingPlayer = this.state.players[playerId];
    if (!existingPlayer) {
      // Player doesn't exist - fall back to regular join if in lobby
      if (this.state.phase === 'lobby') {
        this.handlePlayerJoin(ws, session, nickname);
      } else {
        this.send(ws, { type: 'error', message: 'Player not found. Game already in progress.' });
      }
      return;
    }

    // Verify nickname matches
    if (existingPlayer.nickname.toLowerCase() !== nickname.toLowerCase()) {
      this.send(ws, { type: 'error', message: 'Nickname does not match' });
      return;
    }

    // Reconnect the player
    session.playerId = playerId;
    existingPlayer.connected = true;
    await this.saveState();

    const connectedCount = Object.values(this.state.players).filter(p => p.connected).length;
    this.broadcast({ type: 'player_rejoined', player: existingPlayer, playerCount: connectedCount });
    this.send(ws, { type: 'game_state', state: this.getPublicState() });

    // If game is in question phase, send current question
    if (this.state.phase === 'question' && this.state.quiz) {
      const question = this.state.quiz.questions[this.state.currentQuestionIndex];
      if (question) {
        const questionForPlayer: QuestionForPlayer = {
          id: question.id,
          text: question.text,
          answers: question.answers,
          timerSeconds: question.timerSeconds,
          doublePoints: question.doublePoints,
          multipleChoice: question.correctIndices.length > 1,
        };

        // Calculate remaining time
        const elapsed = this.state.questionStartTime 
          ? Math.floor((Date.now() - this.state.questionStartTime) / 1000)
          : 0;
        const secondsLeft = Math.max(0, question.timerSeconds - elapsed);

        this.send(ws, {
          type: 'question_start',
          question: questionForPlayer,
          questionIndex: this.state.currentQuestionIndex,
          totalQuestions: this.state.quiz.questions.length,
        });
        this.send(ws, { type: 'timer_tick', secondsLeft });
      }
    }

    // If game is in leaderboard phase, send leaderboard
    if (this.state.phase === 'leaderboard') {
      const leaderboard = this.calculateLeaderboard();
      this.send(ws, { type: 'leaderboard_update', leaderboard });
    }
  }

  private handlePlayerAnswer(
    ws: WebSocket,
    session: WebSocketSession,
    questionId: string,
    answerIndices: number[]
  ): void {
    if (!session.playerId) {
      this.send(ws, { type: 'error', message: 'Not joined as player' });
      return;
    }
    if (this.state.phase !== 'question') {
      this.send(ws, { type: 'error', message: 'Not in question phase' });
      return;
    }

    const player = this.state.players[session.playerId];
    if (!player) return;

    const currentQuestion = this.state.quiz?.questions[this.state.currentQuestionIndex];
    if (!currentQuestion || currentQuestion.id !== questionId) {
      this.send(ws, { type: 'error', message: 'Invalid question' });
      return;
    }

    // Don't allow re-answering
    if (player.answers[questionId]) {
      this.send(ws, { type: 'error', message: 'Already answered' });
      return;
    }

    player.answers[questionId] = {
      answerIndices,
      timestamp: Date.now(),
    };

    this.broadcast({ type: 'answer_received', playerId: session.playerId });

    // Check if all connected players have answered
    this.checkAllPlayersAnswered();
  }

  private startQuestion(index: number): void {
    if (!this.state.quiz) return;

    const question = this.state.quiz.questions[index];
    if (!question) return;

    this.state.phase = 'question';
    this.state.currentQuestionIndex = index;
    this.state.questionStartTime = Date.now();
    this.saveState(); // Persist question start

    // Send question to players (no image - they look at presenter screen)
    const questionForPlayer: QuestionForPlayer = {
      id: question.id,
      text: question.text,
      answers: question.answers,
      timerSeconds: question.timerSeconds,
      doublePoints: question.doublePoints,
      multipleChoice: question.correctIndices.length > 1,
    };

    // Send question to host with image
    const questionForHost: QuestionForPlayer = {
      ...questionForPlayer,
      imageUrl: question.imageUrl,
    };

    // Send to each session based on role
    for (const [ws, session] of this.sessions) {
      this.send(ws, {
        type: 'question_start',
        question: session.isHost ? questionForHost : questionForPlayer,
        questionIndex: index,
        totalQuestions: this.state.quiz.questions.length,
      });
    }

    // Start timer countdown
    let secondsLeft = question.timerSeconds;
    this.timerInterval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) {
        this.broadcast({ type: 'timer_tick', secondsLeft });
      } else {
        this.endQuestion();
      }
    }, 1000) as unknown as number;
  }

  private checkAllPlayersAnswered(): void {
    if (this.state.phase !== 'question') return;
    if (!this.timerInterval) return; // Already ended

    const currentQuestion = this.state.quiz?.questions[this.state.currentQuestionIndex];
    if (!currentQuestion) return;

    const connectedPlayers = Object.values(this.state.players).filter((p) => p.connected);
    const allAnswered = connectedPlayers.every((p) => p.answers[currentQuestion.id]);

    if (allAnswered && connectedPlayers.length > 0) {
      this.endQuestion();
    }
  }

  private endQuestion(): void {
    // Guard against double execution
    if (!this.timerInterval && this.state.phase !== 'question') return;
    
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    const question = this.state.quiz?.questions[this.state.currentQuestionIndex];
    if (!question || !this.state.questionStartTime) {
      return;
    }

    // Calculate scores - faster answers get more points
    const maxPoints = question.doublePoints ? 2000 : 1000;
    const timeWindow = question.timerSeconds * 1000;

    for (const player of Object.values(this.state.players)) {
      const answer = player.answers[question.id];
      if (answer) {
        const playerAnswers = new Set(answer.answerIndices);
        const correctAnswers = new Set(question.correctIndices);
        const isCorrect = 
          playerAnswers.size === correctAnswers.size &&
          [...playerAnswers].every(a => correctAnswers.has(a));
        
        if (isCorrect) {
          const responseTime = answer.timestamp - this.state.questionStartTime!;
          const timeBonus = Math.max(0, 1 - responseTime / timeWindow);
          const points = Math.round(maxPoints * (0.5 + 0.5 * timeBonus));
          player.score += points;
        }
      }
    }

    this.saveState(); // Persist scores after question
    const scores = this.calculateLeaderboard();
    this.broadcast({ type: 'question_end', correctIndices: question.correctIndices, scores });

    // Check if this was the last question
    const isLastQuestion = this.state.currentQuestionIndex >= (this.state.quiz?.questions.length ?? 0) - 1;

    if (isLastQuestion) {
      // Skip leaderboard, go directly to podium after delay
      setTimeout(() => this.showPodium(), 3000);
    } else {
      // Show leaderboard for non-final questions
      setTimeout(() => this.showLeaderboard(), 3000);
    }
  }

  private showLeaderboard(): void {
    this.state.phase = 'leaderboard';
    this.saveState(); // Persist phase
    const leaderboard = this.calculateLeaderboard();
    this.broadcast({ type: 'leaderboard_update', leaderboard });
  }

  private calculateLeaderboard(): LeaderboardEntry[] {
    const currentQuestion = this.state.quiz?.questions[this.state.currentQuestionIndex];

    return Object.values(this.state.players)
      .map((player) => {
        const answer = currentQuestion ? player.answers[currentQuestion.id] : undefined;
        let lastAnswerCorrect = false;
        if (answer && currentQuestion) {
          const playerAnswers = new Set(answer.answerIndices);
          const correctAnswers = new Set(currentQuestion.correctIndices);
          lastAnswerCorrect = 
            playerAnswers.size === correctAnswers.size &&
            [...playerAnswers].every(a => correctAnswers.has(a));
        }

        return {
          playerId: player.id,
          nickname: player.nickname,
          score: player.score,
          rank: 0,
          lastAnswerCorrect,
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  private handleClose(ws: WebSocket, session: WebSocketSession): void {
    if (session.isHost) {
      this.state.hostConnected = false;
    }

    if (session.playerId) {
      const player = this.state.players[session.playerId];
      if (player) {
        player.connected = false;
        this.saveState(); // Persist disconnection
        const playerCount = Object.values(this.state.players).filter((p) => p.connected).length;
        this.broadcast({ type: 'player_left', playerId: session.playerId, playerCount });
      }
    }

    this.sessions.delete(ws);
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Connection closed
    }
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const [ws] of this.sessions) {
      try {
        ws.send(data);
      } catch {
        // Connection closed
      }
    }
  }

  private getPublicState(): GameState {
    return { ...this.state };
  }
}
