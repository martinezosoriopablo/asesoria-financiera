# Instructivo de la Plataforma de Asesoría Financiera

## Índice

1. [Inicio de Sesión y Acceso](#1-inicio-de-sesión-y-acceso)
2. [Panel del Asesor (Dashboard)](#2-panel-del-asesor-dashboard)
3. [Gestión de Clientes](#3-gestión-de-clientes)
4. [Cuestionario de Perfil de Riesgo](#4-cuestionario-de-perfil-de-riesgo)
5. [Análisis de Cartola y Perfil](#5-análisis-de-cartola-y-perfil)
6. [Diseñador de Portafolios](#6-diseñador-de-portafolios)
7. [Centro de Fondos](#7-centro-de-fondos)
8. [Panel de Mercado](#8-panel-de-mercado)
9. [Calculadora APV](#9-calculadora-apv)
10. [Educación Financiera](#10-educación-financiera)
11. [Perfil del Asesor](#11-perfil-del-asesor)
12. [Reportes del Comité](#12-reportes-del-comité)

---

## 1. Inicio de Sesión y Acceso

### Acceder a la Plataforma

1. Ingresa a la URL de la plataforma
2. Introduce tu **correo electrónico** y **contraseña**
3. Haz clic en **"Iniciar Sesión"**

### Recuperar Contraseña

Si olvidaste tu contraseña:

1. En la página de login, haz clic en **"¿Olvidaste tu contraseña?"**
2. Ingresa tu correo electrónico
3. Recibirás un email con un enlace para restablecer tu contraseña
4. Haz clic en el enlace y crea una nueva contraseña

---

## 2. Panel del Asesor (Dashboard)

**Ruta:** `/advisor`

El panel principal muestra un resumen de tu actividad y acceso rápido a todas las herramientas.

### Estadísticas Principales

En la parte superior encontrarás tarjetas con:

- **Total Clientes**: Número total de clientes en tu cartera
- **Clientes Activos**: Clientes con estado activo
- **Prospectos**: Clientes potenciales
- **AUM Total**: Activos bajo administración (si está disponible)

### Calendario de Reuniones

- Muestra las reuniones programadas para la semana
- Haz clic en **"+ Nueva Reunión"** para agendar una reunión

### Flujo de Trabajo del Asesor

El panel muestra los 4 pasos del proceso de asesoría:

1. **Gestión de Clientes** → Agregar y administrar clientes
2. **Perfil de Riesgo & Cartola** → Enviar cuestionario y analizar portafolio
3. **Comparación Ideal vs Actual** → Comparar benchmark recomendado
4. **Modelo de Cartera** → Construir propuestas de inversión

### Acciones Rápidas

En la barra lateral derecha encontrarás accesos directos a:

- Agregar nuevo cliente
- Enviar cuestionario de riesgo
- Analizar cartola
- Ver reportes del comité

---

## 3. Gestión de Clientes

**Ruta:** `/clients`

### Ver Lista de Clientes

La pantalla muestra todos tus clientes con:

- Nombre y correo electrónico
- Estado (Activo, Prospecto, Inactivo)
- Perfil de riesgo
- Patrimonio estimado
- Fecha de última interacción

### Filtrar Clientes

Usa los filtros en la parte superior:

- **Por estado**: Activo, Prospecto, Inactivo
- **Por perfil de riesgo**: Conservador, Moderado, Agresivo
- **Búsqueda**: Escribe el nombre o email del cliente

### Crear Nuevo Cliente

1. Haz clic en **"+ Nuevo Cliente"**
2. Completa los datos:
   - Nombre y apellido
   - Correo electrónico
   - Teléfono (opcional)
   - Estado inicial
3. Haz clic en **"Guardar"**

### Ver Detalle del Cliente

Haz clic en cualquier cliente para ver:

- **Información personal**: Datos de contacto
- **Perfil de riesgo**: Puntajes por dimensión (Capacidad, Tolerancia, Percepción, Comportamiento)
- **Historial de interacciones**: Reuniones, llamadas, emails
- **Portafolio actual**: Si tiene cartola cargada

### Editar Cliente

1. En el detalle del cliente, haz clic en **"Editar"**
2. Modifica los campos necesarios
3. Haz clic en **"Guardar cambios"**

### Eliminar Cliente

1. En el detalle del cliente, haz clic en **"Eliminar"**
2. Confirma la eliminación en el diálogo
3. El cliente será eliminado permanentemente

### Enviar Cuestionario de Riesgo

1. En el detalle del cliente, haz clic en **"Enviar Cuestionario"**
2. El cliente recibirá un email con el enlace al cuestionario
3. Cuando lo complete, recibirás una notificación por email

---

## 4. Cuestionario de Perfil de Riesgo

**Ruta para clientes:** `/client/risk-profile` o `/mi-perfil-inversor`

### Cómo Funciona

El cuestionario evalúa 4 dimensiones del perfil de riesgo:

1. **Capacidad (Capacity)**: Situación financiera objetiva
   - Edad
   - Estabilidad de ingresos
   - Dependencia del portafolio
   - Horizonte de inversión
   - Tolerancia a pérdidas

2. **Tolerancia (Tolerance)**: Actitud psicológica hacia el riesgo
   - Disposición a aceptar fluctuaciones
   - Ansiedad ante caídas
   - Paciencia en el corto plazo

3. **Percepción (Perception)**: Visión del entorno actual
   - Percepción del riesgo de mercado
   - Confianza en mercados a largo plazo

4. **Comportamiento (Composure)**: Disciplina emocional
   - Reacción ante caídas del 20%
   - Historial en crisis anteriores
   - Frecuencia de revisión del portafolio

### Enviar Cuestionario a un Cliente

1. Ve a la lista de clientes o al detalle del cliente
2. Haz clic en **"Enviar Cuestionario"**
3. El sistema envía automáticamente un email con el enlace personalizado
4. El enlace incluye tu email como asesor para la asignación correcta

### Ver Resultados

Cuando el cliente completa el cuestionario:

1. Recibes un email de notificación con:
   - Nombre del cliente
   - Perfil resultante (ej: "Moderado")
   - Puntaje global (0-100)
   - Desglose por dimensión

2. El cliente aparece automáticamente en tu lista de clientes
3. Puedes ver el detalle completo en el perfil del cliente

### Perfiles Resultantes

| Puntaje | Perfil |
|---------|--------|
| 0-35 | Conservador |
| 36-55 | Moderado Conservador |
| 56-70 | Moderado |
| 71-85 | Moderado Agresivo |
| 86-100 | Agresivo |

---

## 5. Análisis de Cartola y Perfil

**Ruta:** `/analisis-cartola`

Esta herramienta permite analizar el portafolio actual del cliente y compararlo con su perfil de riesgo.

### Cargar Cartola

Tienes dos opciones:

#### Opción 1: Subir PDF

1. Arrastra un archivo PDF de la cartola al área indicada, o haz clic para seleccionar
2. El sistema procesará automáticamente el documento usando IA
3. Los instrumentos serán extraídos y mostrados

#### Opción 2: Ingreso Manual

1. Haz clic en **"Ingreso Manual"**
2. Agrega cada posición:
   - Nombre del instrumento
   - Tipo (Renta Variable, Renta Fija, Alternativo, Caja)
   - Monto
   - Porcentaje del portafolio
3. Repite para cada instrumento

### Análisis del Portafolio

Una vez cargada la cartola, verás:

#### Composición del Portafolio

- Lista de todas las posiciones
- Porcentaje de cada instrumento
- Valor total del portafolio
- Ganancias/pérdidas no realizadas (si disponible)

#### Distribución por Clase de Activo

Gráfico que muestra:
- **Renta Variable**: Acciones, ETFs de acciones
- **Renta Fija**: Bonos, fondos de deuda
- **Alternativos**: Real estate, commodities, hedge funds
- **Caja**: Efectivo, money market

#### Distribución Geográfica

Desglose por región:
- Chile
- Estados Unidos
- Europa
- Asia
- Otros mercados

### Comparación con Perfil de Riesgo

1. Ingresa el **email del cliente** para cargar su perfil
2. El sistema muestra:
   - **Asignación Recomendada**: Basada en su perfil de riesgo
   - **Asignación Actual**: De su cartola
   - **Diferencias**: Destacadas en rojo si están fuera del rango aceptable (±10%)

### Ajustes Sugeridos

Si el portafolio está desalineado, el sistema sugiere:
- Aumentar o reducir exposición a renta variable
- Ajustar posiciones en renta fija
- Considerar alternativos si corresponde

### Guardar Análisis

1. Haz clic en **"Guardar en Perfil del Cliente"**
2. La cartola quedará asociada al cliente
3. Se registra la fecha del análisis

---

## 6. Diseñador de Portafolios

**Ruta:** `/portfolio-designer`

Herramienta integral para diseñar y proponer portafolios a clientes.

### Pestañas Disponibles

#### Pestaña 1: Comparación

Compara el portafolio actual vs el benchmark ideal:

1. Selecciona un cliente
2. Carga su cartola actual
3. El sistema muestra la comparación gráfica
4. Genera recomendaciones de rebalanceo

#### Pestaña 2: Modelo de Cartera

Crea modelos de portafolio personalizados:

1. Haz clic en **"Nuevo Modelo"**
2. Selecciona fondos del catálogo
3. Asigna porcentajes a cada fondo
4. Verifica que sumen 100%
5. Guarda el modelo con un nombre descriptivo

#### Pestaña 3: Construcción Rápida

Usa plantillas predefinidas:

1. Selecciona un perfil de riesgo (Conservador, Moderado, Agresivo)
2. El sistema carga una plantilla base
3. Personaliza si es necesario
4. Aplica al cliente

#### Pestaña 4: Análisis

Analiza fondos y portafolios en detalle:

- Métricas de rendimiento
- Análisis de riesgo-retorno
- Comparación entre fondos
- Ratio de Sharpe

### Exportar Propuesta

1. Una vez diseñado el portafolio, haz clic en **"Exportar PDF"**
2. Se genera un documento profesional con:
   - Resumen ejecutivo
   - Composición propuesta
   - Justificación de cada posición
   - Comparación con situación actual

---

## 7. Centro de Fondos

**Ruta:** `/fund-center`

Base de datos completa de fondos mutuos y ETFs disponibles en Chile.

### Pestaña 1: Búsqueda de Fondos

#### Filtros Disponibles

- **Familia de fondos**:
  - Renta Variable
  - Renta Fija
  - Balanceado
  - Alternativos

- **Clase de inversionista**:
  - Retail
  - APV
  - Alto Patrimonio

- **Administradora (AGF)**: Selecciona una administradora específica

- **Búsqueda por nombre**: Escribe el nombre del fondo

#### Información de Cada Fondo

- **Nombre y RUN**: Identificación del fondo
- **Administradora**: AGF que lo gestiona
- **Retornos**:
  - 7 días
  - 30 días
  - 90 días
  - 365 días
- **TAC**: Tasa Anual de Costos (costo total)
- **Volatilidad**: Desviación estándar
- **Sharpe**: Ratio riesgo-retorno

#### Ordenar Resultados

Haz clic en los encabezados de columna para ordenar por:
- Retorno (mayor a menor o viceversa)
- TAC (menor a mayor)
- Sharpe (mayor a menor)

### Pestaña 2: Comparador de Fondos

1. Selecciona 2-4 fondos para comparar
2. El sistema muestra:
   - Gráfico de rendimiento comparativo
   - Tabla de métricas lado a lado
   - Análisis de costos (TAC)
   - Recomendación basada en perfil

### Pestaña 3: Análisis de Fondos

1. Sube un documento PDF del fondo (folleto, fact sheet)
2. El sistema extrae información clave automáticamente
3. Revisa el análisis generado

---

## 8. Panel de Mercado

**Ruta:** `/market-dashboard`

Visión general del mercado de fondos y herramientas de administración de datos.

### Estadísticas del Mercado

- Cantidad de fondos por familia
- Cantidad de fondos por clase de inversionista
- Rendimiento promedio del mercado
- TAC promedio por tipo de fondo

### Navegador de Fondos

Lista paginada de todos los fondos disponibles:

1. Navega con los botones de paginación (50 fondos por página)
2. Haz clic en un fondo para ver detalles
3. Ordena por cualquier columna

### Tarjetas de Administradoras (AGF)

Resumen por cada administradora:

- TAC promedio
- Rango de TAC (mínimo - máximo)
- Cantidad de fondos

### Administración de Datos (Solo Admin)

Si tienes permisos de administrador:

#### Subir Retornos Diarios

1. Haz clic en **"Subir Retornos Diarios"**
2. Selecciona un archivo CSV con el formato requerido
3. El sistema procesa y actualiza los datos

#### Subir Retornos Agregados

1. Haz clic en **"Subir Retornos Agregados"**
2. Selecciona el archivo CSV
3. Actualiza métricas de 7d, 30d, 90d, 365d

#### Subir TAC

1. Haz clic en **"Subir TAC"**
2. Selecciona el archivo con datos de costos
3. Actualiza la información de TAC de todos los fondos

---

## 9. Calculadora APV

**Ruta:** `/calculadora-apv`

Herramienta de planificación de ahorro previsional voluntario.

### Datos de Entrada

#### Información Personal

- **Edad actual**: Tu edad hoy
- **Edad de jubilación**: Cuándo planeas retirarte
- **Sueldo bruto mensual**: Ingreso mensual antes de impuestos

#### Datos del APV

- **Aporte mensual APV**: Cuánto aportarás cada mes
- **Perfil de inversión**: Conservador, Moderado o Agresivo
- **Valor UF**: Se actualiza automáticamente (puedes modificar)

#### Tasas de Retorno

Puedes ajustar las tasas reales esperadas:
- Conservador: típicamente 2-3%
- Moderado: típicamente 4-5%
- Agresivo: típicamente 6-7%

### Resultados

#### Comparación APV Tipo A vs Tipo B

**APV Tipo A (Rebaja de Base Imponible)**:
- El aporte se descuenta de tu sueldo bruto
- Reduces el impuesto a pagar hoy
- Al retirar, pagas impuesto sobre el monto total

**APV Tipo B (Bonificación Fiscal)**:
- El aporte no se descuenta del sueldo
- El Estado aporta un 15% adicional (máximo 6 UTM/año)
- Al retirar, solo pagas impuesto sobre las ganancias

El sistema recomienda el tipo más conveniente según tu tramo tributario.

#### Proyección de Ahorro

Gráfico que muestra:
- Evolución del saldo año a año
- Comparación con/sin APV
- Efecto del interés compuesto

#### Tabla de Evolución

Detalle año por año:
- Aporte acumulado
- Rentabilidad acumulada
- Beneficio fiscal acumulado
- Saldo total

#### Desglose de Fuentes

- **Aportes propios**: Lo que tú pusiste
- **Rentabilidad**: Ganancias por inversión
- **Beneficio fiscal**: Aporte del Estado (Tipo B) o ahorro en impuestos (Tipo A)

#### Costo de Postergar

Muestra cuánto pierdes si empiezas a ahorrar:
- 1 año después
- 3 años después
- 5 años después

### Guardar y Compartir

1. Haz clic en **"Exportar PDF"** para generar un reporte
2. Comparte con tu cliente para tomar decisiones

---

## 10. Educación Financiera

**Ruta:** `/educacion-financiera`

Contenido educativo sobre inversiones y mercados.

### Temas Disponibles

#### Análisis de Crisis Históricas

- Caídas del S&P 500 desde 1950
- Tiempo de recuperación de cada crisis
- Lecciones aprendidas

#### Conceptos de Riesgo

- Qué es la volatilidad
- Diferencia entre riesgo y volatilidad
- Importancia de la diversificación

#### Visualizaciones Interactivas

- Gráficos históricos
- Scatter plots de riesgo-retorno
- Simulaciones de escenarios

### Uso con Clientes

Puedes usar esta sección durante reuniones para:
- Educar sobre conceptos de inversión
- Mostrar datos históricos
- Contextualizar recomendaciones

---

## 11. Perfil del Asesor

**Ruta:** `/advisor/profile`

Administra tu información profesional.

### Información Editable

- **Nombre**: Tu nombre completo
- **Email**: Correo electrónico (usado para notificaciones)
- **Teléfono**: Número de contacto
- **Empresa**: Nombre de tu firma
- **Foto de perfil**: Imagen que aparece en emails y reportes
- **Logo de empresa**: Para documentos generados

### Actualizar Foto

1. Haz clic en el área de la foto
2. Selecciona una imagen (JPG, PNG)
3. La foto se actualiza automáticamente

---

## 12. Reportes del Comité

Disponible desde el panel principal del asesor.

### Ver Reportes

1. En el dashboard, busca la sección **"Reportes del Comité"**
2. Selecciona el tipo de reporte:
   - Reporte de Mercado
   - Recomendaciones de Inversión
   - Análisis Macroeconómico
3. Haz clic en **"Ver"** para abrir el reporte

### Actualizar Reportes (Solo Admin)

1. Haz clic en **"Actualizar"** junto al reporte
2. Selecciona el nuevo archivo HTML
3. El reporte se actualiza para todos los asesores

---

## Preguntas Frecuentes

### ¿Por qué mi cliente no aparece en mi lista?

- Verifica que el cuestionario fue enviado desde tu cuenta
- El cliente debe completar el cuestionario para aparecer
- Revisa los filtros de la lista (puede estar filtrado por estado)

### ¿Cómo cambio la contraseña de un cliente?

Los clientes no tienen contraseña. Solo acceden mediante el enlace del cuestionario que les envías.

### ¿Puedo tener múltiples asesores en mi equipo?

Sí, el sistema soporta jerarquía de asesores. Contacta al administrador para agregar nuevos asesores a tu equipo.

### ¿Los datos de los clientes son seguros?

Sí, utilizamos Supabase con encriptación y las mejores prácticas de seguridad. Los datos están protegidos y solo accesibles para el asesor asignado.

### ¿Cómo exporto un reporte para mi cliente?

En las herramientas de portafolio y análisis, busca el botón **"Exportar PDF"** o **"Descargar"**.

---

## Soporte

Si tienes problemas o preguntas:

1. Revisa este instructivo
2. Contacta al administrador de tu firma
3. Reporta problemas técnicos al equipo de soporte

---

*Última actualización: Febrero 2026*
