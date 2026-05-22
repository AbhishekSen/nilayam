import { useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export type ChatImage = { mime: string; b64: string };

export type ChatMessage =
  | { role: 'user'; text: string }
  | {
      role: 'assistant';
      text: string;
      images: ChatImage[];
      tools: string[];
      streaming: boolean;
      error?: string;
      quotaHit?: boolean;
    };

type ServerEvent =
  | { event: 'text'; data: { delta: string } }
  | { event: 'tool'; data: { label: string } }
  | { event: 'image'; data: ChatImage }
  | { event: 'done'; data: { response_id: string | null } }
  | { event: 'error'; data: { message: string } };

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const previousResponseId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: trimmed },
      {
        role: 'assistant',
        text: '',
        images: [],
        tools: [],
        streaming: true,
      },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    const patchAssistant = (patch: (msg: ChatMessage) => ChatMessage) =>
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') next[next.length - 1] = patch(last);
        return next;
      });

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const resp = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: trimmed,
          previous_response_id: previousResponseId.current,
        }),
        signal: controller.signal,
      });

      if (resp.status === 401) {
        await supabase.auth.signOut();
        if (typeof window !== 'undefined') window.location.assign('/login');
        return;
      }

      if (!resp.ok || !resp.body) {
        const detail = await extractError(resp);
        patchAssistant((msg) =>
          msg.role === 'assistant'
            ? { ...msg, streaming: false, error: detail, quotaHit: resp.status === 429 }
            : msg,
        );
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Split on SSE event boundary (blank line).
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const parsed = parseSseEvent(rawEvent);
          if (parsed) handleEvent(parsed, patchAssistant, previousResponseId);
        }
      }
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') {
        patchAssistant((msg) =>
          msg.role === 'assistant' ? { ...msg, streaming: false } : msg,
        );
      } else {
        const message = err instanceof Error ? err.message : String(err);
        patchAssistant((msg) =>
          msg.role === 'assistant' ? { ...msg, streaming: false, error: message } : msg,
        );
      }
    } finally {
      patchAssistant((msg) =>
        msg.role === 'assistant' ? { ...msg, streaming: false } : msg,
      );
      setBusy(false);
      abortRef.current = null;
    }
  }, [busy]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    cancel();
    setMessages([]);
    previousResponseId.current = null;
  }, [cancel]);

  return { messages, busy, send, cancel, reset };
}

async function extractError(resp: Response): Promise<string> {
  try {
    const ct = resp.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const body = await resp.json();
      if (typeof body?.detail === 'string') return body.detail;
    }
    const txt = await resp.text();
    return txt || `HTTP ${resp.status}`;
  } catch {
    return `HTTP ${resp.status}`;
  }
}

function parseSseEvent(raw: string): ServerEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  try {
    const data = JSON.parse(dataLines.join('\n'));
    return { event, data } as ServerEvent;
  } catch {
    return null;
  }
}

function handleEvent(
  evt: ServerEvent,
  patchAssistant: (patch: (msg: ChatMessage) => ChatMessage) => void,
  previousResponseId: React.MutableRefObject<string | null>,
) {
  switch (evt.event) {
    case 'text':
      patchAssistant((msg) =>
        msg.role === 'assistant' ? { ...msg, text: msg.text + evt.data.delta } : msg,
      );
      break;
    case 'tool':
      patchAssistant((msg) =>
        msg.role === 'assistant'
          ? { ...msg, tools: [...msg.tools, evt.data.label] }
          : msg,
      );
      break;
    case 'image':
      patchAssistant((msg) =>
        msg.role === 'assistant'
          ? { ...msg, images: [...msg.images, evt.data] }
          : msg,
      );
      break;
    case 'done':
      previousResponseId.current = evt.data.response_id;
      patchAssistant((msg) =>
        msg.role === 'assistant' ? { ...msg, streaming: false } : msg,
      );
      break;
    case 'error':
      patchAssistant((msg) =>
        msg.role === 'assistant'
          ? { ...msg, streaming: false, error: evt.data.message }
          : msg,
      );
      break;
  }
}
