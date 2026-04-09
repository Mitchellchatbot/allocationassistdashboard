/**
 * ChatPortal — embeds the Allocation Assist chat interface inside the dashboard.
 *
 * The iframe points to the deployed chat portal. When the portal loads it checks
 * for a ?wp_token in the URL; since we're embedding it directly (not via WordPress),
 * users land on the /auth page of the chat portal unless they're already logged in
 * there from a previous session.
 *
 * For seamless single-sign-on from the dashboard, the recommended flow is:
 *  1. Call your WordPress REST endpoint: POST /wp-json/aa-chat/v1/token
 *  2. Append ?wp_token=<token> to the iframe src
 *  3. The chat portal auto-logs in the user silently
 *
 * For now the iframe just loads the portal directly — change CHAT_PORTAL_URL below.
 */

const CHAT_PORTAL_URL = import.meta.env.VITE_CHAT_PORTAL_URL || 'https://chat.allocation-assist.com';

export default function ChatPortal() {
  return (
    <div className="flex flex-col h-full w-full" style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* Header strip */}
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-white shrink-0">
        <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
        <span className="text-sm font-semibold text-gray-700">Chat Portal</span>
        <span className="text-xs text-gray-400 ml-auto">
          Powered by Allocation Assist Live Chat
        </span>
        <a
          href={CHAT_PORTAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline"
        >
          Open in new tab ↗
        </a>
      </div>

      {/* Full-size iframe */}
      <iframe
        src={CHAT_PORTAL_URL}
        title="Allocation Assist Chat Portal"
        className="flex-1 w-full border-none"
        allow="camera; microphone; clipboard-write; notifications"
        style={{ height: 'calc(100vh - 112px)' }}
      />
    </div>
  );
}
