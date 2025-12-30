import type { CreateGameResponse, JoinGameResponse, SavedQuiz, Quiz } from './types';

export { GameDurableObject } from './game';

// PIN prefix for KV storage
const PIN_PREFIX = 'pin:';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

    // Store PIN mapping in KV (expires in 24 hours)
    await env.QUIZZES.put(`${PIN_PREFIX}${gamePin}`, gameId, { expirationTtl: 86400 });

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
    const gameId = await env.QUIZZES.get(`${PIN_PREFIX}${body.pin}`);

    if (!gameId) {
      return Response.json({ success: false, error: 'Invalid PIN' }, { status: 404 });
    }

    const response: JoinGameResponse = { gameId, success: true };
    return Response.json(response);
  }

  // GET /api/join/:pin - Join game by PIN (GET version)
  if (url.pathname.match(/^\/api\/join\/[^/]+$/) && request.method === 'GET') {
    const pin = url.pathname.split('/')[3];
    const gameId = await env.QUIZZES.get(`${PIN_PREFIX}${pin}`);

    if (!gameId) {
      return Response.json({ success: false, error: 'Invalid PIN' }, { status: 404 });
    }

    const response: JoinGameResponse = { gameId, success: true };
    return Response.json(response);
  }

  // GET /api/quizzes - List all saved quizzes
  if (url.pathname === '/api/quizzes' && request.method === 'GET') {
    const list = await env.QUIZZES.list();
    const quizzes: SavedQuiz[] = [];
    
    for (const key of list.keys) {
      const quiz = await env.QUIZZES.get<SavedQuiz>(key.name, 'json');
      if (quiz) quizzes.push(quiz);
    }
    
    // Sort by updatedAt descending
    quizzes.sort((a, b) => b.updatedAt - a.updatedAt);
    return Response.json(quizzes);
  }

  // POST /api/quizzes - Save a new quiz
  if (url.pathname === '/api/quizzes' && request.method === 'POST') {
    const quiz = (await request.json()) as Quiz;
    const now = Date.now();
    
    const savedQuiz: SavedQuiz = {
      ...quiz,
      id: quiz.id || crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    
    await env.QUIZZES.put(savedQuiz.id, JSON.stringify(savedQuiz));
    return Response.json(savedQuiz, { status: 201 });
  }

  // GET /api/quizzes/:id - Get a saved quiz
  if (url.pathname.match(/^\/api\/quizzes\/[^/]+$/) && request.method === 'GET') {
    const quizId = url.pathname.split('/')[3];
    const quiz = await env.QUIZZES.get<SavedQuiz>(quizId, 'json');
    
    if (!quiz) {
      return Response.json({ error: 'Quiz not found' }, { status: 404 });
    }
    return Response.json(quiz);
  }

  // PUT /api/quizzes/:id - Update a saved quiz
  if (url.pathname.match(/^\/api\/quizzes\/[^/]+$/) && request.method === 'PUT') {
    const quizId = url.pathname.split('/')[3];
    const existing = await env.QUIZZES.get<SavedQuiz>(quizId, 'json');
    
    if (!existing) {
      return Response.json({ error: 'Quiz not found' }, { status: 404 });
    }
    
    const updates = (await request.json()) as Partial<Quiz>;
    const savedQuiz: SavedQuiz = {
      ...existing,
      ...updates,
      id: quizId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    
    await env.QUIZZES.put(quizId, JSON.stringify(savedQuiz));
    return Response.json(savedQuiz);
  }

  // DELETE /api/quizzes/:id - Delete a saved quiz
  if (url.pathname.match(/^\/api\/quizzes\/[^/]+$/) && request.method === 'DELETE') {
    const quizId = url.pathname.split('/')[3];
    await env.QUIZZES.delete(quizId);
    return Response.json({ success: true });
  }

  // POST /api/images - Upload an image to R2
  if (url.pathname === '/api/images' && request.method === 'POST') {
    const contentType = request.headers.get('Content-Type') || 'image/jpeg';
    
    // Validate content type
    if (!contentType.startsWith('image/')) {
      return Response.json({ error: 'Only images are allowed' }, { status: 400 });
    }

    const imageId = crypto.randomUUID();
    const extension = contentType.split('/')[1] || 'jpg';
    const key = `${imageId}.${extension}`;

    const body = await request.arrayBuffer();
    await env.IMAGES.put(key, body, {
      httpMetadata: { contentType },
    });

    const imageUrl = `/api/images/${key}`;
    return Response.json({ imageUrl, key }, { status: 201 });
  }

  // GET /api/images/:key - Retrieve an image from R2
  if (url.pathname.match(/^\/api\/images\/[^/]+$/) && request.method === 'GET') {
    const key = url.pathname.split('/')[3];
    const object = await env.IMAGES.get(key);

    if (!object) {
      return new Response('Image not found', { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
    headers.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

    return new Response(object.body, { headers });
  }

  // DELETE /api/images/:key - Delete an image from R2
  if (url.pathname.match(/^\/api\/images\/[^/]+$/) && request.method === 'DELETE') {
    const key = url.pathname.split('/')[3];
    await env.IMAGES.delete(key);
    return Response.json({ success: true });
  }

  return new Response('Not found', { status: 404 });
}
