import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowRight, Hash } from 'lucide-react';

export function PlayerJoin() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/play' }) as { pin?: string | string[] };
  
  // Clean the PIN from URL (handle string or array, remove non-digits)
  const rawPin = Array.isArray(search.pin) ? search.pin[0] : search.pin;
  const urlPin = (rawPin || '').toString().replace(/\D/g, '');
  const [pin, setPin] = useState(urlPin);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoJoinAttempted = useRef(false);

  // Auto-join if PIN is provided in URL (from QR code)
  useEffect(() => {
    const cleanPin = urlPin;
    if (cleanPin && cleanPin.length >= 6 && !autoJoinAttempted.current) {
      autoJoinAttempted.current = true;
      // Small delay to ensure component is mounted
      setTimeout(() => joinGame(cleanPin), 100);
    }
  }, [urlPin]);

  async function joinGame(pinToJoin: string) {
    if (!pinToJoin.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/join/${pinToJoin}`);
      const data = await response.json() as { success: boolean; gameId?: string; error?: string };

      if (data.success && data.gameId) {
        navigate({ to: '/play/$gameId', params: { gameId: data.gameId } });
      } else {
        setError(data.error || 'Invalid PIN');
        setLoading(false);
      }
    } catch {
      setError('Failed to join game');
      setLoading(false);
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    joinGame(pin);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="text-center mb-8">
        <h1 className="text-5xl font-extrabold text-white mb-2">
          CF<span className="text-brand-orange">Hoot</span>
        </h1>
        <p className="text-gray-300">Enter game PIN to join</p>
      </div>

      <form onSubmit={handleJoin} className="card max-w-sm w-full">
        <div className="relative mb-4">
          <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Game PIN"
            className="w-full bg-white/10 border border-white/20 rounded-xl pl-12 pr-4 py-4 text-2xl text-white text-center tracking-widest placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-orange"
            autoFocus
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300 text-center">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pin.length < 6 || loading}
          onClick={(e) => {
            // Fallback for mobile - trigger join directly
            if (pin.length >= 6 && !loading) {
              e.preventDefault();
              joinGame(pin);
            }
          }}
          className="btn btn-primary w-full text-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            'Joining...'
          ) : (
            <>
              Join Game
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
