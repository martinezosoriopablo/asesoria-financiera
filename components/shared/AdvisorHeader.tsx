'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Users,
  Shield,
  BarChart3,
  Briefcase,
  Calculator,
  TrendingUp,
  GraduationCap,
  Activity,
  PieChart,
  Menu,
  X,
  LogOut,
  User,
  ChevronDown,
  FileText,
  Search,
} from 'lucide-react';

interface AdvisorHeaderProps {
  advisorName: string;
  advisorEmail: string;
  advisorPhoto?: string;
}

const NAV_ITEMS = [
  { href: '/advisor', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clientes', icon: Users },
  { href: '/analisis-cartola', label: 'Cartola & Riesgo', icon: Shield },
  { href: '/portfolio-designer?mode=comparison', label: 'Portfolio Designer', icon: BarChart3 },
];

const TOOL_ITEMS = [
  { href: '/market-dashboard', label: 'Market Dashboard', icon: Activity },
  { href: '/fund-center', label: 'Centro de Fondos', icon: TrendingUp },
  { href: '/calculadora-apv', label: 'Calculadora APV', icon: Calculator },
  { href: '/educacion-financiera', label: 'Educación', icon: GraduationCap },
];

export default function AdvisorHeader({
  advisorName,
  advisorEmail,
  advisorPhoto,
}: AdvisorHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const isActive = (href: string) => pathname === href;

  return (
    <>
      <header className="bg-white border-b border-gb-border sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-5">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <Link href="/advisor" className="flex items-center gap-3 shrink-0">
              <img
                src="/logo-greybark.png"
                alt="Greybark Advisors"
                className="h-28 w-auto"
              />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1 ml-8">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      active
                        ? 'bg-gb-light text-gb-black'
                        : 'text-gb-gray hover:text-gb-black hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}

              {/* Tools dropdown */}
              <div className="relative">
                <button
                  onClick={() => setToolsOpen(!toolsOpen)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    TOOL_ITEMS.some(t => isActive(t.href))
                      ? 'bg-gb-light text-gb-black'
                      : 'text-gb-gray hover:text-gb-black hover:bg-gray-50'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Herramientas
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${toolsOpen ? 'rotate-180' : ''}`} />
                </button>

                {toolsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setToolsOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gb-border py-1 w-56 z-50">
                      {TOOL_ITEMS.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setToolsOpen(false)}
                            className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                              isActive(item.href)
                                ? 'bg-gb-light text-gb-black font-medium'
                                : 'text-gb-gray hover:text-gb-black hover:bg-gray-50'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* User menu */}
              <div className="relative hidden sm:block">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <div className="text-right hidden md:block">
                    <div className="text-sm font-medium text-gb-black leading-tight">
                      {advisorName}
                    </div>
                    <div className="text-xs text-gb-gray leading-tight">
                      {advisorEmail}
                    </div>
                  </div>
                  {advisorPhoto ? (
                    <img
                      src={advisorPhoto}
                      alt={advisorName}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gb-black text-white flex items-center justify-center text-xs font-semibold">
                      {advisorName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  )}
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gb-border py-1 w-48 z-50">
                      <Link
                        href="/advisor/profile"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gb-gray hover:text-gb-black hover:bg-gray-50"
                      >
                        <User className="w-4 h-4" />
                        Mi Perfil
                      </Link>
                      <hr className="my-1 border-gb-border" />
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                      >
                        <LogOut className="w-4 h-4" />
                        Cerrar Sesión
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden p-2 rounded-md hover:bg-gray-50"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-gb-border bg-white px-5 py-4 space-y-1">
            {/* User info mobile */}
            <div className="flex items-center gap-3 pb-3 mb-3 border-b border-gb-border sm:hidden">
              {advisorPhoto ? (
                <img src={advisorPhoto} alt={advisorName} className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gb-black text-white flex items-center justify-center text-xs font-semibold">
                  {advisorName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
              )}
              <div>
                <div className="text-sm font-medium text-gb-black">{advisorName}</div>
                <div className="text-xs text-gb-gray">{advisorEmail}</div>
              </div>
            </div>

            <p className="text-xs font-semibold text-gb-gray uppercase tracking-wider px-3 pt-1">Principal</p>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm ${
                    isActive(item.href) ? 'bg-gb-light text-gb-black font-medium' : 'text-gb-gray hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}

            <p className="text-xs font-semibold text-gb-gray uppercase tracking-wider px-3 pt-3">Herramientas</p>
            {TOOL_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm ${
                    isActive(item.href) ? 'bg-gb-light text-gb-black font-medium' : 'text-gb-gray hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}

            <hr className="my-2 border-gb-border" />
            <Link
              href="/advisor/profile"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm text-gb-gray hover:bg-gray-50"
            >
              <User className="w-4 h-4" />
              Mi Perfil
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4" />
              Cerrar Sesión
            </button>
          </div>
        )}
      </header>
    </>
  );
}
