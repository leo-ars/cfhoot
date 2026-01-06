import { useEffect, useRef, useCallback } from 'react';
import { gameStore, handleServerMessage, resetStore } from '../store/gameStore';
import type { ClientMessage, ServerMessage } from '../../../src/types';

const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

export function useWebSocket(gameId: string | null, isHost: boolean = false) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const manualDisconnectRef = useRef(false);

  const connect = useCallback(() => {
    if (!gameId || manualDisconnectRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/game/${gameId}?host=${isHost}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      gameStore.setState((state) => ({ ...state, connected: true, reconnecting: false, error: null, isHost }));
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        handleServerMessage(message);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      if (manualDisconnectRef.current) return;
      
      gameStore.setState((state) => ({ ...state, connected: false, reconnecting: true }));
      
      // Exponential backoff reconnection
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current),
          MAX_RECONNECT_DELAY
        );
        reconnectAttemptsRef.current++;
        
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, delay);
      } else {
        gameStore.setState((state) => ({ 
          ...state, 
          reconnecting: false, 
          error: 'Connection lost. Please refresh the page.' 
        }));
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [gameId, isHost]);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close();
    wsRef.current = null;
    resetStore();
  }, []);

  useEffect(() => {
    manualDisconnectRef.current = false;
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { send, disconnect };
}
