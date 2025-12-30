import type { CreateGameResponse, JoinGameResponse } from './types';

export { GameDurableObject } from './game';

// Store PIN -> GameId mapping (in-memory, reset on deploy)
const pinToGameId = new Map<string, string>();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      const response = await handleApiRoute(url, request, env);
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => newHeaders.set(key, value));
      return new Response(response.body, { status: response.status, headers: newHeaders });
    }

    // WebSocket upgrade for game connections
    if (url.pathname.startsWith('/ws/game/')) {
      const gameId = url.pathname.split('/')[3];
      if (!gameId) {
        return new Response('Game ID required', { status: 400 });
      }

      const id = env.GAME.idFromName(gameId);
      const stub = env.GAME.get(id);
      const wsUrl = new URL(request.url);
      wsUrl.pathname = '/';
      return stub.fetch(new Request(wsUrl.toString(), request));
    }

    // Let assets handle everything else (SPA)
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function handleApiRoute(url: URL, request: Request, env: Env): Promise<Response> {
  // POST /api/games - Create a new game
  if (url.pathname === '/api/games' && request.method === 'POST') {
    const gameId = crypto.randomUUID();
    const id = env.GAME.idFromName(gameId);
    const stub = env.GAME.get(id);

    // Get the game PIN
    const pinResponse = await stub.fetch(new Request('https://internal/pin'));
    const { gamePin } = (await pinResponse.json()) as { gamePin: string };

    // Store PIN mapping
    pinToGameId.set(gamePin, gameId);

    const response: CreateGameResponse = { gameId, gamePin };
    return Response.json(response, { status: 201 });
  }

  // GET /api/games/:gameId - Get game state
  if (url.pathname.match(/^\/api\/games\/[^/]+$/) && request.method === 'GET') {
    const gameId = url.pathname.split('/')[3];
    const id = env.GAME.idFromName(gameId);
    const stub = env.GAME.get(id);
    return stub.fetch(new Request('https://internal/state'));
  }

  // POST /api/join - Join game by PIN
  if (url.pathname === '/api/join' && request.method === 'POST') {
    const body = (await request.json()) as { pin: string };
    const gameId = pinToGameId.get(body.pin);

    if (!gameId) {
      return Response.json({ success: false, error: 'Invalid PIN' }, { status: 404 });
    }

    const response: JoinGameResponse = { gameId, success: true };
    return Response.json(response);
  }

  // GET /api/join/:pin - Join game by PIN (GET version)
  if (url.pathname.match(/^\/api\/join\/[^/]+$/) && request.method === 'GET') {
    const pin = url.pathname.split('/')[3];
    const gameId = pinToGameId.get(pin);

    if (!gameId) {
      return Response.json({ success: false, error: 'Invalid PIN' }, { status: 404 });
    }

    const response: JoinGameResponse = { gameId, success: true };
    return Response.json(response);
  }

  return new Response('Not found', { status: 404 });
}
