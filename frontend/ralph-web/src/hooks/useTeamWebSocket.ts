/**
 * useTeamWebSocket
 *
 * Hook for streaming real-time team events via WebSocket.
 * Extends the task WebSocket pattern to support team-specific subscriptions.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useLogStore } from "@/stores/logStore";

/**
 * Team event from the WebSocket stream
 */
export interface TeamEvent {
  type: "team_status_changed" | "agent_status_changed" | "agent_heartbeat" | "mailbox_message";
  teamId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Connection states for the WebSocket
 */
export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

interface UseTeamWebSocketOptions {
  /** Whether to automatically connect (default: true) */
  autoConnect?: boolean;
  /** Called when connection state changes */
  onConnectionChange?: (state: ConnectionState) => void;
  /** Called when a team event is received */
  onTeamEvent?: (event: TeamEvent) => void;
  /** WebSocket URL (defaults to current host) */
  wsUrl?: string;
}

interface UseTeamWebSocketReturn {
  events: TeamEvent[];
  latestEvent: TeamEvent | null;
  connectionState: ConnectionState;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  subscribeToTeam: (teamId: string) => void;
  unsubscribeFromTeam: (teamId: string) => void;
}

const MAX_EVENTS = 100;

/**
 * Hook for streaming team events from WebSocket.
 *
 * This hook manages WebSocket connection for real-time team updates including:
 * - Team status changes (idle → running → completed)
 * - Agent status updates (teammate heartbeats)
 * - Mailbox messages (agent-to-agent communication)
 */
export function useTeamWebSocket(
  options: UseTeamWebSocketOptions = {}
): UseTeamWebSocketReturn {
  const { autoConnect = true, onConnectionChange, onTeamEvent, wsUrl } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [subscribedTeams, setSubscribedTeams] = useState<Set<string>>(new Set());

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const isDisconnectingRef = useRef<boolean>(false);

  const onConnectionChangeRef = useRef(onConnectionChange);
  const onTeamEventRef = useRef(onTeamEvent);

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
    onTeamEventRef.current = onTeamEvent;
  }, [onConnectionChange, onTeamEvent]);

  const updateConnectionState = useCallback((state: ConnectionState) => {
    setConnectionState(state);
    onConnectionChangeRef.current?.(state);
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (isDisconnectingRef.current) {
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const attempt = reconnectAttemptRef.current;
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttemptRef.current += 1;
      connectRef.current();
    }, delay);
  }, []);

  const disconnect = useCallback(() => {
    isDisconnectingRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    updateConnectionState("disconnected");
  }, [updateConnectionState]);

  const connect = useCallback(() => {
    isDisconnectingRef.current = false;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    updateConnectionState("connecting");
    setError(null);

    // Build WebSocket URL
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = wsUrl || window.location.host;
    const url = `${protocol}//${host}/ws/teams`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        updateConnectionState("connected");
        reconnectAttemptRef.current = 0;
        setError(null);

        // Re-subscribe to teams after reconnection
        subscribedTeams.forEach((teamId) => {
          ws.send(JSON.stringify({ type: "subscribe", teamId }));
        });
      };

      ws.onmessage = (message) => {
        if (isDisconnectingRef.current) {
          return;
        }

        try {
          const data = JSON.parse(message.data);

          // Handle team events
          if (data.type === "team" && data.data) {
            const event = data.data as TeamEvent;
            setEvents((prev) => {
              const next = [...prev, event];
              return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
            });
            onTeamEventRef.current?.(event);
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        updateConnectionState("disconnected");

        if (!isDisconnectingRef.current) {
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        updateConnectionState("error");
        setError("WebSocket connection failed");
      };
    } catch (err) {
      updateConnectionState("error");
      setError(err instanceof Error ? err.message : "Connection failed");
      scheduleReconnect();
    }
  }, [wsUrl, subscribedTeams, scheduleReconnect, updateConnectionState]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const subscribeToTeam = useCallback((teamId: string) => {
    setSubscribedTeams((prev) => {
      const next = new Set(prev);
      next.add(teamId);
      return next;
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "subscribe", teamId }));
    }
  }, []);

  const unsubscribeFromTeam = useCallback((teamId: string) => {
    setSubscribedTeams((prev) => {
      const next = new Set(prev);
      next.delete(teamId);
      return next;
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "unsubscribe", teamId }));
    }
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;

  return {
    events,
    latestEvent,
    connectionState,
    error,
    connect,
    disconnect,
    subscribeToTeam,
    unsubscribeFromTeam,
  };
}
