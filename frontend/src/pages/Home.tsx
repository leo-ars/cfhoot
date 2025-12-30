import { Link } from '@tanstack/react-router';
import { Play, Users } from 'lucide-react';

export function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="text-center mb-12">
        <h1 className="text-6xl font-extrabold text-white mb-4 tracking-tight">
          CF<span className="text-brand-orange">Hoot</span>
        </h1>
        <p className="text-xl text-gray-300">Real-time quiz game on Cloudflare Workers</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6">
        <Link
          to="/host/create"
          className="btn btn-primary text-xl px-10 py-5 flex items-center gap-3"
        >
          <Users className="w-6 h-6" />
          Host a Game
        </Link>

        <Link
          to="/play"
          className="btn btn-secondary text-xl px-10 py-5 flex items-center gap-3"
        >
          <Play className="w-6 h-6" />
          Join a Game
        </Link>
      </div>

      <div className="mt-16 card max-w-md text-center">
        <h2 className="text-lg font-semibold text-white mb-2">How it works</h2>
        <ol className="text-gray-300 text-left space-y-2">
          <li>1. Host creates a quiz with questions</li>
          <li>2. Players join using a 6-digit PIN</li>
          <li>3. Answer questions as fast as possible</li>
          <li>4. Top 3 players win!</li>
        </ol>
      </div>
    </div>
  );
}
