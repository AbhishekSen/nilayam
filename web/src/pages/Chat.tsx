import { useEffect, useRef, useState } from 'react';
import { useChat } from '../hooks/useChat';
import ChatMessage from '../components/ChatMessage';

const SUGGESTIONS = [
  'What are the 3 cheapest 2BHK projects?',
  'Plot average minPrice by developerGrade',
  'Which micromarket has the highest average propscore?',
  'Show 1BHK price range by micromarket as a chart',
];

export default function ChatPage() {
  const { messages, busy, send, reset } = useChat();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const submit = () => {
    if (!draft.trim() || busy) return;
    send(draft);
    setDraft('');
  };

  return (
    <div className="chat-page">
      <div className="chat-header">
        <h2>Ask the data</h2>
        <button className="chat-reset" onClick={reset} disabled={busy && messages.length === 0}>
          New conversation
        </button>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>
              Ask anything about Bengaluru property listings. The agent has read-only
              access to <code>projects_blr</code> and can produce charts.
            </p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chat-suggestion" onClick={() => send(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <ChatMessage key={i} message={m} />)
        )}
      </div>

      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          className="chat-input"
          placeholder="Ask about prices, developers, micromarkets, amenities…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          disabled={busy}
        />
        <button type="submit" className="chat-send" disabled={busy || !draft.trim()}>
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
