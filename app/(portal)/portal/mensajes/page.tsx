"use client";

import { useEffect, useState, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import PortalTopbar from "@/components/portal/PortalTopbar";
import { Loader, Send, MessageSquare } from "lucide-react";

interface Message {
  id: string;
  sender_role: "advisor" | "client";
  content: string;
  sent_at: string;
  read_at: string | null;
}

interface ClientInfo {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
}

interface AdvisorInfo {
  nombre: string;
}

export default function MensajesPage() {
  const [loading, setLoading] = useState(true);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [advisor, setAdvisor] = useState<AdvisorInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!clientInfo) return;

    // Subscribe to realtime messages
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`messages:${clientInfo.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `client_id=eq.${clientInfo.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientInfo]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Mark messages as read when viewing
  useEffect(() => {
    if (!clientInfo || messages.length === 0) return;
    const unreadAdvisorMsgs = messages.filter(
      (m) => m.sender_role === "advisor" && !m.read_at
    );
    if (unreadAdvisorMsgs.length > 0) {
      fetch("/api/portal/messages/read", { method: "POST" }).catch(() => {});
    }
  }, [messages, clientInfo]);

  const fetchData = async () => {
    try {
      const [meRes, msgsRes] = await Promise.all([
        fetch("/api/portal/me"),
        fetch("/api/portal/messages"),
      ]);

      if (meRes.ok) {
        const meData = await meRes.json();
        setClientInfo(meData.client);
        setAdvisor(meData.advisor);
      }

      if (msgsRes.ok) {
        const msgsData = await msgsRes.json();
        setMessages(msgsData.messages || []);
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch("/api/portal/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newMessage.trim() }),
      });

      if (res.ok) {
        setNewMessage("");
      }
    } catch (err) {
      console.error("Error sending message:", err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gb-light flex items-center justify-center">
        <Loader className="w-6 h-6 text-gb-gray animate-spin" />
      </div>
    );
  }

  if (!clientInfo) {
    return (
      <div className="min-h-screen bg-gb-light flex items-center justify-center">
        <p className="text-gb-gray">Error cargando datos</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gb-light flex flex-col">
      <PortalTopbar
        clientName={`${clientInfo.nombre} ${clientInfo.apellido}`}
        clientEmail={clientInfo.email}
      />

      <main className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-6 py-6">
        <h1 className="text-lg font-semibold text-gb-black mb-1">
          Mensajes
        </h1>
        <p className="text-xs text-gb-gray mb-4">
          Conversación con {advisor?.nombre || "tu asesor"}
        </p>

        {/* Messages container */}
        <div className="flex-1 bg-white rounded-lg border border-gb-border flex flex-col min-h-[400px] max-h-[60vh]">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                <MessageSquare className="w-10 h-10 text-gb-border mb-3" />
                <p className="text-sm text-gb-gray">No hay mensajes aún</p>
                <p className="text-xs text-gb-gray mt-1">
                  Escribe a tu asesor para iniciar la conversación
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender_role === "client" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-3.5 py-2.5 ${
                      msg.sender_role === "client"
                        ? "bg-gb-black text-white"
                        : "bg-gray-100 text-gb-black"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p
                      className={`text-xs mt-1 ${
                        msg.sender_role === "client" ? "text-gray-400" : "text-gb-gray"
                      }`}
                    >
                      {formatTime(msg.sent_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gb-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe un mensaje..."
                rows={1}
                className="flex-1 px-3 py-2 border border-gb-border rounded-lg text-sm resize-none focus:ring-2 focus:ring-gb-accent focus:border-transparent"
                disabled={sending}
              />
              <button
                onClick={handleSend}
                disabled={!newMessage.trim() || sending}
                className="p-2.5 bg-gb-black text-white rounded-lg hover:bg-gb-dark disabled:opacity-40 transition-colors shrink-0"
              >
                {sending ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-gb-gray mt-1.5">Enter para enviar, Shift+Enter para nueva línea</p>
          </div>
        </div>
      </main>
    </div>
  );
}
