# Script de verificación de páginas - GreyBark System
# PowerShell

Write-Host "🔍 VERIFICACIÓN DE PÁGINAS - SISTEMA GREYBARK" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

function Check-Page {
    param(
        [string]$Path,
        [string]$Name
    )
    
    if (Test-Path $Path) {
        Write-Host "✅ $Name - EXISTE" -ForegroundColor Green
        return $true
    } else {
        Write-Host "❌ $Name - NO EXISTE" -ForegroundColor Red
        return $false
    }
}

Write-Host "📄 PÁGINAS PRINCIPALES:" -ForegroundColor Yellow
Write-Host "------------------------"
Check-Page "app\page.tsx" "Página raíz (redirect)"
Check-Page "app\advisor\page.tsx" "Dashboard asesor"
Check-Page "app\advisor\profile\page.tsx" "Perfil asesor"
Check-Page "app\advisor\settings\page.tsx" "Configuración"

Write-Host ""
Write-Host "👥 GESTIÓN DE CLIENTES:" -ForegroundColor Yellow
Write-Host "------------------------"
Check-Page "app\clients\page.tsx" "Lista clientes"
Check-Page "app\clients\new\page.tsx" "Nuevo cliente"
Check-Page "app\clients\[id]\page.tsx" "Detalle cliente"
Check-Page "app\clients\[id]\edit\page.tsx" "Editar cliente"

Write-Host ""
Write-Host "📅 REUNIONES:" -ForegroundColor Yellow
Write-Host "------------------------"
Check-Page "app\meetings\page.tsx" "Lista reuniones"
Check-Page "app\meetings\[id]\page.tsx" "Detalle reunión"

Write-Host ""
Write-Host "🛠️ HERRAMIENTAS DE ASESORÍA:" -ForegroundColor Yellow
Write-Host "------------------------"
Check-Page "app\risk-profile\page.tsx" "1. Perfil de Riesgo"
Check-Page "app\modelo-cartera\page.tsx" "2. Constructor de Modelo"
Check-Page "app\portfolio-comparison\page.tsx" "3. Comparador de Costos"
Check-Page "app\market-dashboard\page.tsx" "4. Market Dashboard"
Check-Page "app\apv-calculator\page.tsx" "5. Calculadora APV"
Check-Page "app\educacion-financiera\page.tsx" "6. Educación Financiera"
Check-Page "app\comparador-etf\page.tsx" "7. Comparador ETFs"
Check-Page "app\analisis-fondos\page.tsx" "8. Análisis de Fondos"

Write-Host ""
Write-Host "🔌 APIs:" -ForegroundColor Yellow
Write-Host "------------------------"
Check-Page "app\api\clients\route.ts" "API Clientes (lista)"
Check-Page "app\api\clients\stats\route.ts" "API Clientes Stats"
Check-Page "app\api\clients\[id]\route.ts" "API Cliente (detalle)"
Check-Page "app\api\advisor\stats\route.ts" "API Advisor Stats"
Check-Page "app\api\advisor\meetings\route.ts" "API Meetings"
Check-Page "app\api\advisor\profile\route.ts" "API Profile"

Write-Host ""
Write-Host "🎨 COMPONENTES:" -ForegroundColor Yellow
Write-Host "------------------------"
Check-Page "components\shared\AdvisorHeader.tsx" "AdvisorHeader"
Check-Page "components\dashboard\StatsCards.tsx" "StatsCards"
Check-Page "components\dashboard\WeeklyCalendar.tsx" "WeeklyCalendar"
Check-Page "components\dashboard\NewMeetingForm.tsx" "NewMeetingForm"

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "✅ Verificación completa" -ForegroundColor Green
Write-Host ""
Write-Host "💡 TIP: Ejecuta este script desde la raíz del proyecto" -ForegroundColor Cyan
