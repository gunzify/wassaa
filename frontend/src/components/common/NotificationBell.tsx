import React from 'react';
import { Bell } from 'lucide-react';

interface NotificationBellProps {
  unreadCount: number;
  onClick: () => void;
}

/**
 * The app's single notification entry point — a bell in the top-right of every
 * tab header. It rings gently while something is unread and carries a count
 * badge, so the member never needs a dedicated tab for it.
 */
export const NotificationBell: React.FC<NotificationBellProps> = ({ unreadCount, onClick }) => {
  const unread = unreadCount > 0;
  const label = unread
    ? `Notifications, ${unreadCount} unread`
    : 'Notifications';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`icon-btn icon-btn-ghost bell ${unread ? 'bell-unread' : ''}`}
      aria-label={label}
      title={label}
    >
      <Bell className={`h-5 w-5 ${unread ? 'bell-swing' : ''}`} strokeWidth={unread ? 2.1 : 1.8} />
      {unread && (
        <span className="bell-badge" aria-hidden="true">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
};

export default NotificationBell;
