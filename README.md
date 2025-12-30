# CFHoot

A Kahoot-style real-time quiz game built entirely on Cloudflare Workers.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/leo-ars/cfhoot)

## Features

- **Real-time multiplayer** - Players join with a 6-digit PIN and answer questions simultaneously
- **WebSocket-powered** - Instant updates using Cloudflare Durable Objects
- **Save & reuse quizzes** - Store your quizzes in KV for future games
- **Automatic scoring** - Points based on correctness and speed
- **Podium reveal** - Dramatic 3rd → 2nd → 1st place announcement
- **Mobile-friendly** - Responsive design for all devices

## Tech Stack

- **Backend**: Cloudflare Workers + Durable Objects
- **Storage**: Cloudflare KV (quiz persistence)
- **Frontend**: React + TanStack Router + TailwindCSS
- **Real-time**: WebSockets via Durable Objects

## Quick Deploy

Click the button above to deploy your own instance. Cloudflare will automatically:
1. Clone this repository to your GitHub account
2. Provision the required Durable Object and KV namespace
3. Build and deploy the application

## Local Development

```bash
# Install dependencies
npm install

# Generate Cloudflare types
npm run cf-typegen

# Start development server
npm run dev
```

The app will be available at `http://localhost:8787`.

## Game Flow

1. **Host** creates a quiz with multiple-choice questions
2. **Host** starts the game and shares the 6-digit PIN
3. **Players** join by entering the PIN and choosing a nickname
4. **Questions** are displayed with a countdown timer
5. **Scoring** rewards both correctness and speed
6. **Leaderboard** shows rankings between questions
7. **Podium** reveals the top 3 players at the end

## Project Structure

```
cfhoot/
├── src/
│   ├── index.ts       # Worker entry point & API routes
│   ├── game.ts        # Durable Object game logic
│   └── types.ts       # Shared TypeScript types
├── frontend/
│   └── src/
│       ├── pages/     # React page components
│       ├── hooks/     # WebSocket hook
│       └── store/     # Game state management
└── wrangler.jsonc     # Cloudflare configuration
```

## Configuration

The app uses these Cloudflare bindings (auto-provisioned on deploy):

| Binding | Type | Description |
|---------|------|-------------|
| `GAME` | Durable Object | Manages real-time game sessions |
| `QUIZZES` | KV Namespace | Stores saved quizzes for reuse |

## License

MIT
