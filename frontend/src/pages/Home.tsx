import { Link } from '@tanstack/react-router';
import { Play, Users, Github, Shield } from 'lucide-react';

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
        </ol>
      </div>

      {/* Open Source Footer */}
      <footer className="mt-12 mb-8 max-w-2xl text-center space-y-6">
        <div className="border-t border-gray-700 pt-8">
          <p className="text-gray-300 text-lg mb-4">
            <span className="font-semibold text-white">CF<span className="text-brand-orange">Hoot</span> is free and open source.</span>
            <br />
            Deploy your own instance in seconds!
          </p>
          
          <a
            href="https://deploy.workers.cloudflare.com/?url=https://github.com/leo-ars/cfhoot"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block hover:opacity-90 transition-opacity"
          >
            <img
              src="https://deploy.workers.cloudflare.com/button"
              alt="Deploy to Cloudflare"
              className="h-10"
            />
          </a>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm">
          <a
            href="https://github.com/leo-ars/cfhoot"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
          >
            <Github className="w-5 h-5" />
            <span>View on GitHub</span>
          </a>
          
          <span className="hidden sm:inline text-gray-600">•</span>
          
          <a
            href="https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
          >
            <Shield className="w-5 h-5" />
            <span>Restrict public access with Cloudflare Access</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
