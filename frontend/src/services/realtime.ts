import { getAccessToken, supabaseApiKey } from './supabase-auth';

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');

type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';
type PhoenixMessage = {
  topic?: string;
  event?: string;
  payload?: { status?: string; response?: { reason?: string }; event?: string };
  ref?: string | number | null;
};

/** Private match channel; message bodies are fetched via the ownership-checked API. */
export async function subscribeToMatch(
  matchId: string,
  onMessage: () => void,
  onStatus: (status: RealtimeStatus) => void,
): Promise<() => void> {
  try {
    return await openMatchChannel(matchId, onMessage, onStatus);
  } catch (error) {
    // `realtime.messages` is partitioned by day and the partition only appears
    // once a live socket connects, so the first join of the day can fail with
    // `MissingPartition` before succeeding (Supabase: "connecting a client
    // first usually clears it up"). Authorization denials are permanent and
    // are not retried.
    if (!/MissingPartition|PartitionCreationFailed|timed out|connection failed|closed before joining/i.test(String((error as Error)?.message || ''))) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return await openMatchChannel(matchId, onMessage, onStatus);
  }
}

async function openMatchChannel(
  matchId: string,
  onMessage: () => void,
  onStatus: (status: RealtimeStatus) => void,
): Promise<() => void> {
  if (!projectUrl) throw new Error('Supabase URL is not configured.');
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Sign in again to open realtime chat.');

  const url = new URL(`${projectUrl}/realtime/v1/websocket`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('apikey', supabaseApiKey());
  url.searchParams.set('vsn', '1.0.0');

  const channelTopic = `realtime:match:${matchId}`;
  const channelName = `match:${matchId}`;
  const socket = new WebSocket(url);
  let ref = 0;
  let joined = false;
  let closed = false;
  let token = accessToken;
  let joinTimeout: number | undefined;
  let heartbeat: number | undefined;
  let refreshTimer: number | undefined;
  let resolveJoin: (() => void) | undefined;
  let rejectJoin: ((error: Error) => void) | undefined;

  const nextRef = () => String(++ref);
  const send = (event: string, payload: Record<string, unknown>, topic = channelTopic, joinRef?: string) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    const next = nextRef();
    socket.send(JSON.stringify({ topic, event, payload, ref: next, ...(joinRef ? { join_ref: joinRef } : {}) }));
  };
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (joinTimeout) window.clearTimeout(joinTimeout);
    if (heartbeat) window.clearInterval(heartbeat);
    if (refreshTimer) window.clearInterval(refreshTimer);
    if (socket.readyState === WebSocket.OPEN && joined) send('phx_leave', {}, channelTopic, '1');
    socket.close(1000, 'Chat closed');
  };

  const joinedPromise = new Promise<void>((resolve, reject) => {
    resolveJoin = resolve;
    rejectJoin = reject;
  });

  socket.onopen = () => {
    const joinRef = nextRef();
    socket.send(JSON.stringify({
      topic: channelTopic,
      event: 'phx_join',
      payload: {
        config: {
          broadcast: { ack: false, self: false },
          presence: { enabled: false, key: '' },
          postgres_changes: [],
          private: true,
        },
        access_token: token,
      },
      ref: joinRef,
      join_ref: joinRef,
    }));
    joinTimeout = window.setTimeout(() => {
      onStatus('TIMED_OUT');
      rejectJoin?.(new Error('Realtime chat join timed out.'));
      cleanup();
    }, 10000);
  };

  socket.onmessage = (event) => {
    let message: PhoenixMessage;
    try { message = JSON.parse(String(event.data)) as PhoenixMessage; } catch { return; }
    if (message.topic === channelTopic && message.event === 'phx_reply' && message.payload?.status) {
      if (message.payload.status === 'ok' && !joined) {
        joined = true;
        if (joinTimeout) window.clearTimeout(joinTimeout);
        onStatus('SUBSCRIBED');
        resolveJoin?.();
        heartbeat = window.setInterval(() => send('heartbeat', {}, 'phoenix'), 25000);
        refreshTimer = window.setInterval(() => {
          void getAccessToken().then((fresh) => {
            if (fresh && fresh !== token) {
              token = fresh;
              send('access_token', { access_token: token }, channelTopic, '1');
            }
          }).catch(() => undefined);
        }, 45000);
      } else if (message.payload.status === 'error') {
        onStatus('CHANNEL_ERROR');
        rejectJoin?.(new Error(message.payload.response?.reason || 'Realtime authorization failed.'));
        cleanup();
      }
      return;
    }
    if (message.topic === channelTopic && message.event === 'broadcast') onMessage();
    if (message.topic === channelTopic && ['phx_error', 'phx_close'].includes(message.event || '')) {
      onStatus('CHANNEL_ERROR');
      if (!joined) rejectJoin?.(new Error('Realtime channel closed before joining.'));
    }
  };

  socket.onerror = () => {
    onStatus('CHANNEL_ERROR');
    if (!joined) rejectJoin?.(new Error('Realtime chat connection failed.'));
  };
  socket.onclose = () => {
    if (!closed) onStatus('CLOSED');
    if (!joined) rejectJoin?.(new Error('Realtime chat closed before joining.'));
  };

  try {
    await joinedPromise;
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
