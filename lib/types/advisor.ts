// lib/types/advisor.ts
// Tipos para el sistema multi-asesor

export type AdvisorRole = 'admin' | 'advisor';

export interface Advisor {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  foto_url?: string | null;
  logo_url?: string | null;
  company_name?: string | null;
  rol: AdvisorRole;  // Usando 'rol' (columna existente en DB)
  parent_advisor_id?: string | null;
  activo: boolean;   // Usando 'activo' (columna existente en DB)
  created_at?: string;
  updated_at?: string;
}

export interface AdvisorInfo {
  id: string;
  email: string;
  name: string;
  photo: string;
  logo?: string | null;
  companyName?: string | null;
  role: AdvisorRole;
  isAdmin: boolean;
  parentAdvisorId?: string | null;
}

// Para crear un nuevo asesor
export interface CreateAdvisorInput {
  email: string;
  nombre: string;
  apellido: string;
  foto_url?: string;
  logo_url?: string;
  company_name?: string;
  role?: AdvisorRole;
  parent_advisor_id?: string;
}

// Para actualizar un asesor
export interface UpdateAdvisorInput {
  nombre?: string;
  apellido?: string;
  foto_url?: string;
  logo_url?: string;
  company_name?: string;
  rol?: AdvisorRole;
  parent_advisor_id?: string | null;
  activo?: boolean;
}
