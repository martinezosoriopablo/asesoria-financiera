"""
Script SIMPLIFICADO para cargar datos de fondos mutuos a Supabase
Solo usa: pandas, openpyxl, requests (sin compilaciones)
"""

import pandas as pd
import requests
import json
from datetime import datetime

# ============================================
# CONFIGURACIÓN - PEGA TUS CREDENCIALES AQUÍ
# ============================================
SUPABASE_URL = "https://zysotxkelepvotzujhxe.supabase.co"  # https://xxxxx.supabase.co
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5c290eGtlbGVwdm90enVqaHhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjUyNjk3NCwiZXhwIjoyMDgyMTAyOTc0fQ.Ansi89kIfptszv0I3DzmPJdqrEpi7tLbckiobvw6QRM"  # eyJ...

# Headers para las peticiones
headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def normalizar_clase(clase):
    """Normalizar clase de inversionista"""
    if pd.isna(clase):
        return 'Retail'
    clase = str(clase).strip().title()
    if 'Alto' in clase or 'Patrimonio' in clase:
        return 'Alto Patrimonio'
    if 'APV' in clase.upper():
        return 'APV'
    return 'Retail'

def insertar_batch(tabla, datos, batch_size=100):
    """Insertar datos en lotes"""
    url = f"{SUPABASE_URL}/rest/v1/{tabla}"
    total_insertados = 0
    
    for i in range(0, len(datos), batch_size):
        batch = datos[i:i+batch_size]
        
        try:
            response = requests.post(
                url,
                headers=headers,
                data=json.dumps(batch)
            )
            
            if response.status_code in [200, 201]:
                total_insertados += len(batch)
                print(f"  ✅ Insertados {total_insertados}/{len(datos)} registros")
            else:
                print(f"  ⚠️ Error en lote {i}: {response.status_code}")
                print(f"     {response.text[:200]}")
                
        except Exception as e:
            print(f"  ❌ Error en lote {i}: {str(e)}")
    
    return total_insertados

def cargar_fondos_base(df_rent, df_cost):
    """Cargar información básica de fondos"""
    print("📦 Cargando fondos base...")
    
    # Combinar datos únicos
    fondos_rent = df_rent[['fo_run', 'fm_serie', 'nombre_fondo', 'nombre_agf', 
                            'familia_estudios', 'familia_visualizador', 'familia_rar',
                            'clase_inversionista', 'serie_digital']].copy()
    
    fondos_cost = df_cost[['fo_run', 'fm_serie', 'moneda_funcional']].copy()
    
    # Merge
    fondos = fondos_rent.merge(
        fondos_cost, 
        on=['fo_run', 'fm_serie'], 
        how='outer'
    )
    
    # Eliminar duplicados
    fondos = fondos.drop_duplicates(subset=['fo_run', 'fm_serie'])
    
    # Normalizar clase
    fondos['clase_inversionista'] = fondos['clase_inversionista'].apply(normalizar_clase)
    
    # Convertir a dict y limpiar NaN
    fondos_data = []
    for _, row in fondos.iterrows():
        fondo = {}
        for col in fondos.columns:
            val = row[col]
            if pd.notna(val):
                if isinstance(val, (int, float)) and pd.isna(val):
                    continue
                fondo[col] = int(val) if isinstance(val, (float, int)) and val == int(val) else val
        fondos_data.append(fondo)
    
    # Insertar
    total = insertar_batch('fondos_mutuos', fondos_data)
    print(f"✅ {total} fondos cargados\n")
    return fondos

def obtener_fondos_map():
    """Obtener mapping de fondos desde Supabase"""
    print("🔍 Obteniendo IDs de fondos...")
    url = f"{SUPABASE_URL}/rest/v1/fondos_mutuos?select=id,fo_run,fm_serie"
    
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        fondos = response.json()
        fondos_map = {
            (f['fo_run'], f['fm_serie']): f['id'] 
            for f in fondos
        }
        print(f"  ✅ {len(fondos_map)} fondos encontrados\n")
        return fondos_map
    else:
        print(f"  ❌ Error obteniendo fondos: {response.status_code}")
        return {}

def cargar_rentabilidades(df_rent, fondos_map):
    """Cargar rentabilidades"""
    print("📊 Cargando rentabilidades...")
    
    rent_data = []
    for _, row in df_rent.iterrows():
        fondo_id = fondos_map.get((row['fo_run'], row['fm_serie']))
        if not fondo_id:
            continue
        
        # Convertir fecha
        try:
            fecha = datetime.strptime(str(row['fm_fecha']), '%Y%m%d').date().isoformat()
        except:
            fecha = '2025-09-30'
        
        rent = {
            'fondo_id': fondo_id,
            'fo_run': int(row['fo_run']),
            'fm_serie': str(row['fm_serie']),
            'fm_fecha': fecha
        }
        
        # Agregar rentabilidades solo si no son NaN
        for col in ['rent_nominal_1a', 'rent_nominal_3a_ann', 'rent_nominal_5a_ann', 
                    'rent_nominal_10a_ann', 'rent_real_1a', 'rent_real_3a_ann', 
                    'rent_real_5a_ann', 'rent_real_10a_ann', 'ind_rar_pond']:
            if pd.notna(row[col]):
                rent[col] = float(row[col])
        
        rent_data.append(rent)
    
    total = insertar_batch('fondos_rentabilidades', rent_data)
    print(f"✅ {total} rentabilidades cargadas\n")

def cargar_costos(df_cost, fondos_map):
    """Cargar costos"""
    print("💰 Cargando costos...")
    
    cost_data = []
    for _, row in df_cost.iterrows():
        fondo_id = fondos_map.get((row['fo_run'], row['fm_serie']))
        if not fondo_id:
            continue
        
        cost = {
            'fondo_id': fondo_id,
            'fo_run': int(row['fo_run']),
            'fm_serie': str(row['fm_serie'])
        }
        
        # Agregar datos solo si no son NaN
        if pd.notna(row['tac_sintetica']):
            cost['tac_sintetica'] = float(row['tac_sintetica'])
        if pd.notna(row['pat_total']):
            cost['pat_total'] = float(row['pat_total'])
        if pd.notna(row['fm_fecha_num']):
            cost['fm_fecha_num'] = int(row['fm_fecha_num'])
        
        cost_data.append(cost)
    
    total = insertar_batch('fondos_costos', cost_data)
    print(f"✅ {total} costos cargados\n")

def main():
    """Función principal"""
    print("=" * 60)
    print("🚀 CARGA DE DATOS - MARKET DASHBOARD")
    print("=" * 60)
    print()
    
    # Verificar configuración
    if SUPABASE_URL == "TU_URL_AQUI" or SUPABASE_KEY == "TU_KEY_AQUI":
        print("❌ ERROR: Debes configurar SUPABASE_URL y SUPABASE_KEY")
        print("   Edita el archivo y pega tus credenciales en las líneas 12-13")
        return
    
    print(f"📡 Conectando a: {SUPABASE_URL}")
    print()
    
    # Leer archivos
    print("📖 Leyendo archivos Excel...")
    try:
        df_rent = pd.read_excel('articles-91848.xlsx')
        df_cost = pd.read_excel('articles-91847.xlsx')
        print(f"  ✅ Rentabilidades: {len(df_rent)} registros")
        print(f"  ✅ Costos: {len(df_cost)} registros")
        print()
    except FileNotFoundError as e:
        print(f"  ❌ Error: No se encontró el archivo {e.filename}")
        print("     Asegúrate de que los archivos Excel están en la misma carpeta")
        return
    
    # Cargar datos
    cargar_fondos_base(df_rent, df_cost)
    
    # Obtener mapping de IDs
    fondos_map = obtener_fondos_map()
    if not fondos_map:
        print("❌ No se pudieron obtener los fondos. Revisa la conexión.")
        return
    
    cargar_rentabilidades(df_rent, fondos_map)
    cargar_costos(df_cost, fondos_map)
    
    print("=" * 60)
    print("✅ CARGA COMPLETA")
    print("=" * 60)
    print()
    print("🎯 SIGUIENTE PASO:")
    print("   Ve a Supabase y ejecuta:")
    print("   SELECT COUNT(*) FROM fondos_mutuos;")
    print("   Deberías ver ~2035 fondos")

if __name__ == '__main__':
    main()
