import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DataState,
  DisplayCommand,
  DisplayConfig,
  RotationState,
  ServerMessage,
  SimpleCommand,
} from '@officeboard/shared';

export interface LiveState {
  connected: boolean;
  config: DisplayConfig | null;
  rotation: RotationState | null;
  data: DataState | null;
  /** Server clock minus local clock, so countdowns stay right if the Pi's clock drifts. */
  clockOffsetMs: number;
}

export interface LiveFeed extends LiveState {
  send: (command: DisplayCommand) => void;
}

interface Handlers {
  onScreenCommand?: (command: SimpleCommand, seq: number) => void;
  onOsd?: (text: string) => void;
  onReload?: () => void;
  onUnauthorized?: () => void;
  /** Called when the server reconnects running a different web build than this page loaded with. */
  onBuildChange?: () => void;
}

export function useLiveFeed(role: 'display' | 'admin', handlers: Handlers = {}): LiveFeed {
  const [state, setState] = useState<LiveState>({
    connected: false,
    config: null,
    rotation: null,
    data: null,
    clockOffsetMs: 0,
  });
  const socketRef = useRef<WebSocket | null>(null);
  const buildIdRef = useRef<string | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let stopped = false;
    let retry: number | undefined;
    let attempt = 0;
    let pingTimer: number | undefined;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws?role=${role}`);
      socketRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 25_000);
      };

      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        switch (msg.type) {
          case 'hello':
            if (buildIdRef.current !== null && buildIdRef.current !== msg.buildId) {
              handlersRef.current.onBuildChange?.();
            }
            buildIdRef.current = msg.buildId;
            setState({
              connected: true,
              config: msg.config,
              rotation: msg.rotation,
              data: msg.data,
              clockOffsetMs: msg.rotation.serverTime - Date.now(),
            });
            break;
          case 'config':
            setState((s) => ({ ...s, config: msg.config }));
            break;
          case 'rotation':
            setState((s) => ({
              ...s,
              rotation: msg.rotation,
              clockOffsetMs: msg.rotation.serverTime - Date.now(),
            }));
            break;
          case 'data':
            setState((s) =>
              s.data ? { ...s, data: { ...s.data, [msg.source]: msg.envelope } as DataState } : s,
            );
            break;
          case 'screenCommand':
            handlersRef.current.onScreenCommand?.(msg.command, msg.seq);
            break;
          case 'osd':
            handlersRef.current.onOsd?.(msg.text);
            break;
          case 'reload':
            handlersRef.current.onReload?.();
            break;
        }
      };

      ws.onclose = (ev) => {
        window.clearInterval(pingTimer);
        socketRef.current = null;
        setState((s) => ({ ...s, connected: false }));
        if (ev.code === 4401) handlersRef.current.onUnauthorized?.();
        if (stopped) return;
        attempt++;
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
        retry = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      window.clearInterval(pingTimer);
      socketRef.current?.close();
    };
  }, [role]);

  const send = useCallback((command: DisplayCommand) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'command', command }));
    }
  }, []);

  return { ...state, send };
}
