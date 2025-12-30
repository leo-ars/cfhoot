import { useEffect, useRef, useCallback } from 'react';
import { gameStore, handleServerMessage, resetStore } from '../store/gameStore';
import type { ClientMessage, ServerMessage } from '../../../src/types';

export function useWebSocket(gameId: string | null, isHost: boolean = false) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (!gameId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/game/${gameId}?host=${isHost}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      gameStore.setState((state) => ({ ...state, connected: true, error: null, isHost }));
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
      gameStore.setState((state) => ({ ...state, connected: false }));
      // Attempt reconnect after 2 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [gameId, isHost]);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close();
    wsRef.current = null;
    resetStore();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { send, disconnect };
}
