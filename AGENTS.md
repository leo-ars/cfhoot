# Agent Guidelines for CFHoot

This document provides coding agents with essential information about the CFHoot codebase structure, conventions, and workflows.

## Project Overview

CFHoot is a Kahoot-style real-time quiz game built on Cloudflare Workers with:
- **Backend**: Cloudflare Workers + Durable Objects (WebSocket-based real-time game logic)
- **Storage**: Cloudflare D1 (SQLite database for quizzes & game PINs) + R2 (image storage)
- **Frontend**: React + TanStack Router + TanStack Store + TailwindCSS
- **Testing**: Vitest with `@cloudflare/vitest-pool-workers`

## Build, Test & Development Commands

### Development
```bash
npm run dev              # Run both worker (port 8787) and frontend (port 5173)
npm run dev:worker       # Run only Cloudflare Workers dev server
npm run dev:frontend     # Run only Vite frontend dev server
npm start                # Alias for dev:worker
```

### Build & Deploy
```bash
npm run build            # Build frontend to /public
npm run deploy           # Build and deploy to Cloudflare
npm run cf-typegen       # Generate Cloudflare Worker types
```

### Testing
```bash
npm test                 # Run all tests with Vitest
npm test -- test/index.spec.ts          # Run specific test file
npm test -- -t "test name pattern"      # Run tests matching pattern
npm test -- --watch      # Run tests in watch mode
```

Tests use the Cloudflare Vitest pool and must import from `cloudflare:test`:
```typescript
import { env, createExecutionContext, SELF } from 'cloudflare:test';
```

## Project Structure

```
cfhoot/
├── src/
│   ├── index.ts       # Worker entry point, API routes, fetch handler
│   ├── game.ts        # GameDurableObject class (WebSocket + game state)
│   └── types.ts       # Shared TypeScript types (interfaces & enums)
├── frontend/
│   └── src/
│       ├── main.tsx       # React app entry point
│       ├── routeTree.tsx  # TanStack Router configuration
│       ├── pages/         # Route components (Home, HostCreate, etc.)
│       ├── hooks/         # useWebSocket.ts - WebSocket connection management
│       └── store/         # gameStore.ts - TanStack Store for UI state
├── test/
│   └── *.spec.ts      # Vitest test files
├── public/            # Built frontend assets (generated, not in git)
├── wrangler.jsonc     # Cloudflare Workers configuration
└── worker-configuration.d.ts  # Generated types (not in git)
```

## Code Style & Formatting

### General Rules
- **Indentation**: Use TABS (not spaces) for all files except YAML
- **Line width**: 140 characters max (Prettier)
- **Quotes**: Single quotes for strings
- **Semicolons**: Always required
- **End of line**: LF (Unix-style)
- **Trailing whitespace**: Remove
- **Final newline**: Always insert

### TypeScript Configuration
- **Target**: ES2024
- **Module**: ES2022 with Bundler resolution
- **Strict mode**: Enabled
- **JSX**: `react-jsx` (automatic runtime)
- **No emit**: TypeScript for type-checking only (Vite handles transpilation)

## Imports & Dependencies

### Import Order (prefer this structure)
1. External dependencies (`react`, `cloudflare:workers`, etc.)
2. Type imports from `./types` or `../../../src/types`
3. Internal modules (hooks, stores, components)

### Import Style
```typescript
// Prefer type imports for types
import type { GameState, ServerMessage } from './types';

// Regular imports for values
import { DurableObject } from 'cloudflare:workers';
import { useEffect, useCallback } from 'react';
```

### Key Dependencies
- **React 18** with hooks (no class components)
- **TanStack Router** for routing (file-based routes in `/pages`)
- **TanStack Store** for state management (not Redux/Zustand)
- **Lucide React** for icons
- **TailwindCSS** for styling (utility classes, no CSS modules)

## Naming Conventions

### Files
- **Worker/Backend**: `kebab-case.ts` (e.g., `game.ts`, `index.ts`)
- **React Components**: `PascalCase.tsx` (e.g., `PlayerJoin.tsx`, `HostCreate.tsx`)
- **Hooks**: `camelCase.ts` with `use` prefix (e.g., `useWebSocket.ts`)
- **Stores**: `camelCase.ts` (e.g., `gameStore.ts`)

### Variables & Functions
- **Variables**: `camelCase` (e.g., `gameState`, `playerId`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `MAX_RECONNECT_ATTEMPTS`, `PIN_PREFIX`)
- **Functions**: `camelCase` (e.g., `handleServerMessage`, `generatePin`)
- **React Components**: `PascalCase` (e.g., `function PlayerGame()`)
- **Interfaces**: `PascalCase` (e.g., `interface GameState`)
- **Types**: `PascalCase` (e.g., `type ClientMessage`)

### Cloudflare Bindings
- All caps: `GAME` (Durable Object), `DB` (D1 Database), `IMAGES` (R2)

## Type System

### Strict Typing
- All functions must have explicit return types for public APIs
- Use `interface` for object shapes, `type` for unions/aliases
- Prefer `Record<string, Type>` over index signatures when appropriate
- Use discriminated unions for message types (see `ClientMessage`, `ServerMessage`)

### Example Patterns
```typescript
// Discriminated union for WebSocket messages
export type ServerMessage =
	| { type: 'error'; message: string }
	| { type: 'game_state'; state: GameState }
	| { type: 'player_joined'; player: Player; playerCount: number };

// Explicit return type
async function handleApiRoute(url: URL, request: Request, env: Env): Promise<Response> {
	// ...
}

// Record for player storage
players: Record<string, Player>;
```

## Error Handling

### Worker/API Responses
- Return proper HTTP status codes (200, 201, 400, 404, etc.)
- Use `Response.json()` for structured error responses
- Always include CORS headers in API responses

```typescript
if (!gameId) {
	return Response.json({ success: false, error: 'Invalid PIN' }, { status: 404 });
}
```

### WebSocket Messages
- Send error messages as `{ type: 'error', message: string }`
- Use try-catch around message parsing
- Log errors to console for debugging

### Frontend
- Store error state in `gameStore` for display
- Implement exponential backoff for WebSocket reconnection
- Show user-friendly error messages in UI

## State Management

### Backend (Durable Object)
- Uses **Durable Object SQL** (`this.ctx.storage.sql`) for state persistence
- Two tables: `game_state` (single row) and `players` (one row per player)
- Always call `await this.saveState()` after state mutations
- Automatic migration from old KV storage API on first load
- Reset connection states on DO startup (WebSockets don't survive restarts)
- SQL provides better performance with 40+ players and easier debugging

### Frontend (TanStack Store)
- Centralize all UI state in `gameStore.ts`
- Update state immutably: `setState((state) => ({ ...state, newField }))`
- Use `resetStore()` to clear state on disconnect

## WebSocket Protocol

### Connection
- Host: `/ws/game/{gameId}?host=true`
- Player: `/ws/game/{gameId}?host=false`

### Message Flow
1. Client connects → Server sends `game_state`
2. Client sends typed messages (`player_join`, `host_start_game`, etc.)
3. Server broadcasts updates to all connected clients
4. Server sends `timer_tick` messages during questions

### Reconnection
- Automatic reconnection with exponential backoff
- Max 10 attempts, delays: 1s → 2s → 4s → ... → 30s (capped)
- Players can rejoin with `player_rejoin` message using stored `playerId`

## Styling (TailwindCSS)

### Brand Colors
- Orange: `text-brand-orange` (#f48120)
- Gold: `text-brand-gold` (#faad3f)
- Answer colors: `bg-answer-red`, `bg-answer-blue`, `bg-answer-green`, `bg-answer-yellow`

### Common Patterns
```tsx
// Button primary
<button className="btn btn-primary">Host a Game</button>

// Card container
<div className="card">...</div>

// Animations
<div className="animate-bounce-in">Appears with bounce</div>
<div className="animate-slide-up">Slides up on mount</div>
```

## Common Pitfalls & Best Practices

### DO NOT
- ❌ Use spaces for indentation (use tabs)
- ❌ Import types without `type` keyword when possible
- ❌ Mutate state directly (always clone objects)
- ❌ Forget to save Durable Object state after mutations
- ❌ Use `var` (use `const` or `let`)
- ❌ Create class components (use function components)

### DO
- ✅ Use `satisfies ExportedHandler<Env>` for worker exports
- ✅ Use `crypto.randomUUID()` for generating IDs
- ✅ Use `Math.random().toString(36)` for short game IDs
- ✅ Clean up timers/intervals in Durable Objects
- ✅ Handle WebSocket close events gracefully
- ✅ Use `useCallback` for WebSocket message handlers
- ✅ Validate input in API routes before processing

## Configuration Files

- **wrangler.jsonc**: Cloudflare Workers config (bindings, migrations, assets)
- **vite.config.ts**: Frontend build config (root: `./frontend`, outDir: `../public`)
- **vitest.config.mts**: Test config (uses Cloudflare Workers pool)
- **tsconfig.json**: TypeScript config for worker code (excludes `test/`)
- **tailwind.config.js**: Tailwind config (scans `./frontend/**/*.{tsx,jsx}`)

## Git Workflow

- Main branch: Work directly or use feature branches
- Commit style: Descriptive, imperative mood (e.g., "Add podium reveal animation")
- Generated files excluded: `public/`, `worker-configuration.d.ts`, `node_modules/`, `.wrangler/`
