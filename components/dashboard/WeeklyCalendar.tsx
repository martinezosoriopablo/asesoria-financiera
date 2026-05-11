"use client";

import React from "react";
import { Clock, MapPin, Video, Phone, User, Edit3, Trash2 } from "lucide-react";

interface Meeting {
  id: string;
  titulo: string;
  fecha: string;
  duracion_minutos?: number;
  tipo: string;
  ubicacion?: string;
  descripcion?: string;
  client_id?: string;
  google_event_id?: string;
  clients?: {
    nombre: string;
    apellido: string;
  };
  client?: {
    nombre: string;
    apellido: string;
  };
}

interface WeeklyCalendarProps {
  meetings: Meeting[];
  onEdit?: (meeting: Meeting) => void;
  onDelete?: (meeting: Meeting) => void;
}

export default function WeeklyCalendar({ meetings = [], onEdit, onDelete }: WeeklyCalendarProps) {

  const getWeekDays = () => {
    const today = new Date();
    const currentDay = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));

    const days = [];
    for (let i = 0; i < 5; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const weekDays = getWeekDays();

  const getMeetingsForDay = (day: Date) => {
    if (!Array.isArray(meetings)) return [];

    return meetings.filter((meeting) => {
      try {
        const meetingDate = new Date(meeting.fecha);
        return (
          meetingDate.getDate() === day.getDate() &&
          meetingDate.getMonth() === day.getMonth() &&
          meetingDate.getFullYear() === day.getFullYear()
        );
      } catch {
        return false;
      }
    });
  };

  const isToday = (day: Date) => {
    const today = new Date();
    return (
      day.getDate() === today.getDate() &&
      day.getMonth() === today.getMonth() &&
      day.getFullYear() === today.getFullYear()
    );
  };

  const formatTime = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return '--:--';
    }
  };

  const getClientName = (meeting: Meeting) => {
    const client = meeting.clients || meeting.client;
    if (!client) return 'Cliente';
    return `${client.nombre || ''} ${client.apellido || ''}`.trim() || 'Cliente';
  };

  const getTypeIcon = (tipo: string) => {
    switch (tipo?.toLowerCase()) {
      case "virtual":
        return <Video className="w-3 h-3" />;
      case "llamada":
        return <Phone className="w-3 h-3" />;
      default:
        return <MapPin className="w-3 h-3" />;
    }
  };

  const getTypeColor = (tipo: string) => {
    switch (tipo?.toLowerCase()) {
      case "virtual":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "llamada":
        return "bg-green-100 text-green-700 border-green-200";
      default:
        return "bg-purple-100 text-purple-700 border-purple-200";
    }
  };

  return (
    <>
      <div className="grid grid-cols-5 gap-4">
        {weekDays.map((day, index) => {
          const dayMeetings = getMeetingsForDay(day);
          const today = isToday(day);

          return (
            <div
              key={index}
              className={`border rounded-lg p-3 ${
                today
                  ? "border-gb-primary bg-gb-primary-light/30"
                  : "border-gb-border bg-gb-light/50"
              }`}
            >
              <div className="text-center mb-3 pb-2 border-b border-gb-border">
                <p className="text-xs font-semibold text-gb-gray uppercase">
                  {day.toLocaleDateString("es-CL", { weekday: "short" })}
                </p>
                <p
                  className={`text-2xl font-bold ${
                    today ? "text-gb-primary" : "text-gb-black"
                  }`}
                >
                  {day.getDate()}
                </p>
                <p className="text-xs text-gb-gray">
                  {day.toLocaleDateString("es-CL", { month: "short" })}
                </p>
              </div>

              <div className="space-y-2">
                {dayMeetings.length > 0 ? (
                  dayMeetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className={`p-2 border rounded-lg text-xs ${getTypeColor(meeting.tipo)} group relative`}
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <Clock className="w-3 h-3" />
                        <span className="font-bold">
                          {formatTime(meeting.fecha)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mb-1">
                        <User className="w-3 h-3" />
                        <span className="font-semibold truncate">
                          {getClientName(meeting)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {getTypeIcon(meeting.tipo)}
                        <span className="truncate">{meeting.titulo || 'Reunion'}</span>
                      </div>
                      {(onEdit || onDelete) && (
                        <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
                          {onEdit && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onEdit(meeting); }}
                              className="p-1 rounded bg-white/80 hover:bg-white shadow-sm"
                              title="Editar"
                            >
                              <Edit3 className="w-3 h-3 text-gb-gray" />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onDelete(meeting); }}
                              className="p-1 rounded bg-white/80 hover:bg-red-50 shadow-sm"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gb-gray text-center py-4">
                    Sin reuniones
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-gb-border flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-purple-100 border border-purple-200 rounded" />
          <span className="text-gb-gray">Presencial</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-100 border border-blue-200 rounded" />
          <span className="text-gb-gray">Virtual</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-100 border border-green-200 rounded" />
          <span className="text-gb-gray">Llamada</span>
        </div>
      </div>
    </>
  );
}
