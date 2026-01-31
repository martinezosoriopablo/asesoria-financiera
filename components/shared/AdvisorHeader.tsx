'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface AdvisorHeaderProps {
  advisorName: string;
  advisorEmail: string;
  advisorPhoto?: string;
  logoUrl: string;
  logoSize?: 'normal' | 'large';
}

export default function AdvisorHeader({
  advisorName,
  advisorEmail,
  advisorPhoto,
  logoUrl,
  logoSize = 'normal'
}: AdvisorHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const logoHeight = logoSize === 'large' ? '60px' : '40px';
  const containerPadding = logoSize === 'large' ? '20px 0' : '16px 0';

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div style={{
      backgroundColor: 'white',
      borderBottom: '1px solid #e5e7eb',
      padding: containerPadding,
      marginBottom: '0'
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '0 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img
            src={logoUrl}
            alt="Grey Bark Advisors"
            style={{
              height: logoHeight,
              width: 'auto',
              objectFit: 'contain',
              transition: 'height 0.3s ease'
            }}
          />
        </div>

        {/* Info del asesor + menú */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '14px',
              color: '#666',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '8px',
            }}
          >
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: '600', color: '#1a1a1a' }}>
                {advisorName}
              </div>
              <div style={{ fontSize: '13px' }}>
                {advisorEmail}
              </div>
            </div>
            {advisorPhoto ? (
              <img
                src={advisorPhoto}
                alt={advisorName}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#2563eb',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                fontSize: '16px'
              }}>
                {advisorName.split(' ').map(n => n[0]).join('').toUpperCase()}
              </div>
            )}
          </button>

          {menuOpen && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                onClick={() => setMenuOpen(false)}
              />
              <div style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: '8px',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                border: '1px solid #e5e7eb',
                minWidth: '160px',
                zIndex: 50,
                overflow: 'hidden',
              }}>
                <a
                  href="/advisor/profile"
                  style={{
                    display: 'block',
                    padding: '10px 16px',
                    fontSize: '14px',
                    color: '#374151',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Mi Perfil
                </a>
                <button
                  onClick={handleLogout}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 16px',
                    fontSize: '14px',
                    color: '#dc2626',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    borderTop: '1px solid #e5e7eb',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fef2f2')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Cerrar Sesion
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
