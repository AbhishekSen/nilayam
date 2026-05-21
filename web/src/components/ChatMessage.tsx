import type { ChatMessage as ChatMessageType } from '../hooks/useChat';

type Props = { message: ChatMessageType };

export default function ChatMessage({ message }: Props) {
  if (message.role === 'user') {
    return (
      <div className="chat-msg chat-msg-user">
        <div className="chat-bubble chat-bubble-user">{message.text}</div>
      </div>
    );
  }

  const segments = splitOnFencedCode(message.text);
  return (
    <div className="chat-msg chat-msg-assistant">
      <div className="chat-bubble chat-bubble-assistant">
        {message.tools.length > 0 && (
          <div className="chat-tools">
            {message.tools.map((label, i) => (
              <span key={i} className="chat-tool-chip">
                {label}
              </span>
            ))}
          </div>
        )}
        {segments.map((seg, i) =>
          seg.kind === 'code' ? (
            <pre key={i} className="chat-code">
              <code>{seg.text}</code>
            </pre>
          ) : (
            <p key={i} className="chat-text">
              {seg.text}
            </p>
          ),
        )}
        {message.streaming && !message.text && (
          <span className="chat-cursor">▍</span>
        )}
        {message.images.map((img, i) => (
          <img
            key={i}
            className="chat-image"
            src={`data:${img.mime};base64,${img.b64}`}
            alt="chart"
          />
        ))}
        {message.error && <div className="chat-error">⚠ {message.error}</div>}
      </div>
    </div>
  );
}

type Segment = { kind: 'text' | 'code'; text: string };

function splitOnFencedCode(text: string): Segment[] {
  if (!text) return [];
  const segments: Segment[] = [];
  const re = /```(?:\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', text: text.slice(lastIndex, match.index).trim() });
    }
    segments.push({ kind: 'code', text: match[1].trim() });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: 'text', text: text.slice(lastIndex).trim() });
  }
  return segments.filter((s) => s.text.length > 0);
}
