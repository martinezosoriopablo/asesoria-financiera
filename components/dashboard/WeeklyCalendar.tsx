"use client";

import React from "react";
import { Calendar, Clock, MapPin, Video, Phone, User } from "lucide-react";

interface Meeting {
  id: string;
  titulo: string;
  fecha: string;
  duracion_minutos?: number;
  tipo: string;
  ubicacion?: string;
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
}

export default function WeeklyCalendar({ meetings = [] }: WeeklyCalendarProps) {
  console.log('WeeklyCalendar - Meetings recibidas:', meetings);

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
    if (!Array.isArray(meetings)) {
      console.error('Meetings no es un array:', meetings);
      return [];
    }

    return meetings.filter((meeting) => {
      try {
        const meetingDate = new Date(meeting.fecha);
        const match = (
          meetingDate.getDate() === day.getDate() &&
          meetingDate.getMonth() === day.getMonth() &&
          meetingDate.getFullYear() === day.getFullYear()
        );
        if (match) {
          console.log('Meeting encontrado para día:', day.toDateString(), meeting);
        }
        return match;
      } catch (error) {
        console.error('Error parseando fecha de meeting:', meeting, error);
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
    } catch (error) {
      console.error('Error formateando hora:', dateString, error);
      return '--:--';
    }
  };

  const getClientName = (meeting: Meeting) => {
    // Manejar ambos formatos: clients y client
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
      {/* Debug info - remover en producción */}
      {meetings.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs">
          <p className="font-bold text-blue-900">Debug: {meetings.length} reunión(es) cargada(s)</p>
          {meetings.map((m, i) => (
            <p key={i} className="text-blue-700">
              {i + 1}. {m.titulo} - {new Date(m.fecha).toLocaleString('es-CL')} - {getClientName(m)}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-5 gap-4">
        {weekDays.map((day, index) => {
          const dayMeetings = getMeetingsForDay(day);
          const today = isToday(day);

          return (
            <div
              key={index}
              className={`border rounded-lg p-3 ${
                today
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              {/* Header del día */}
              <div className="text-center mb-3 pb-2 border-b border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase">
                  {day.toLocaleDateString("es-CL", { weekday: "short" })}
                </p>
                <p
                  className={`text-2xl font-bold ${
                    today ? "text-blue-600" : "text-slate-900"
                  }`}
                >
                  {day.getDate()}
                </p>
                <p className="text-xs text-slate-500">
                  {day.toLocaleDateString("es-CL", { month: "short" })}
                </p>
              </div>

              {/* Reuniones del día */}
              <div className="space-y-2">
                {dayMeetings.length > 0 ? (
                  dayMeetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className={`p-2 border rounded-lg text-xs ${getTypeColor(
                        meeting.tipo
                      )}`}
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
                        <span className="truncate">{meeting.titulo || 'Reunión'}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">
                    Sin reuniones
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-purple-100 border border-purple-200 rounded" />
          <span className="text-slate-600">Presencial</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-100 border border-blue-200 rounded" />
          <span className="text-slate-600">Virtual</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-100 border border-green-200 rounded" />
          <span className="text-slate-600">Llamada</span>
        </div>
      </div>
    </>
  );
}
