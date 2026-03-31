"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, FileUp, ClipboardCheck, Check, CheckCheck } from "lucide-react";
import Link from "next/link";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
  client_id: string | null;
  clients: { nombre: string; apellido: string } | null;
}

const TYPE_ICONS: Record<string, typeof FileUp> = {
  cartola_upload: FileUp,
  questionnaire_completed: ClipboardCheck,
};

const TYPE_COLORS: Record<string, string> = {
  cartola_upload: "text-blue-600 bg-blue-50",
  questionnaire_completed: "text-green-600 bg-green-50",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const isMounted = useRef(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/advisor/notifications?limit=15");
      if (!res.ok) return;
      const data = await res.json();
      if (isMounted.current && data.success) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  const markAllRead = async () => {
    setLoading(true);
    try {
      await fetch("/api/advisor/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const markOneRead = async (id: string) => {
    try {
      await fetch("/api/advisor/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds: [id] }),
      });
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // silent
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) fetchNotifications();
        }}
        className="relative p-2 rounded-md hover:bg-gray-50 transition-colors"
        aria-label="Notificaciones"
      >
        <Bell className="w-5 h-5 text-gb-gray" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-80 sm:w-96 bg-white rounded-lg shadow-lg border border-gb-border z-50 max-h-[28rem] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gb-border">
              <h3 className="text-sm font-semibold text-gb-black">Notificaciones</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={loading}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Marcar todas leídas
                </button>
              )}
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gb-gray">
                  No hay notificaciones
                </div>
              ) : (
                notifications.map((n) => {
                  const Icon = TYPE_ICONS[n.type] || Bell;
                  const colorClass = TYPE_COLORS[n.type] || "text-gb-gray bg-gray-50";
                  const isUnread = !n.read_at;
                  const clientName = n.clients
                    ? `${n.clients.nombre} ${n.clients.apellido || ""}`.trim()
                    : null;

                  const content = (
                    <div
                      className={`flex items-start gap-3 px-4 py-3 border-b border-gb-border/50 hover:bg-gray-50 transition-colors ${
                        isUnread ? "bg-blue-50/30" : ""
                      }`}
                    >
                      <div
                        className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${colorClass}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${isUnread ? "font-semibold" : "font-medium"} text-gb-black leading-tight`}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-gb-gray mt-0.5 line-clamp-2">{n.body}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {clientName && (
                            <span className="text-xs text-gb-gray">{clientName}</span>
                          )}
                          <span className="text-xs text-gb-gray">{timeAgo(n.created_at)}</span>
                        </div>
                      </div>
                      {isUnread && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            markOneRead(n.id);
                          }}
                          className="p-1 rounded hover:bg-gray-200 shrink-0"
                          title="Marcar como leída"
                        >
                          <Check className="w-3.5 h-3.5 text-gb-gray" />
                        </button>
                      )}
                    </div>
                  );

                  if (n.link) {
                    return (
                      <Link
                        key={n.id}
                        href={n.link}
                        onClick={() => {
                          setOpen(false);
                          if (isUnread) markOneRead(n.id);
                        }}
                      >
                        {content}
                      </Link>
                    );
                  }

                  return <div key={n.id}>{content}</div>;
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
