# Greybark Advisors — Manual de Usuario

---

## Bienvenido

Greybark Advisors es tu herramienta para gestionar todo el ciclo de asesoria financiera: desde captar un cliente nuevo hasta hacer seguimiento de su portafolio y enviarle reportes periodicos.

Este manual te guia paso a paso por cada funcion de la plataforma.

---

## Primeros Pasos

### Iniciar sesion

1. Ingresa a la plataforma con tu **email y contrasena**
2. Llegaras al **Dashboard**, tu pantalla de inicio

### Tu Dashboard

Es lo primero que ves al entrar. Aqui tienes:

- **Resumen rapido:** cuantos clientes tienes, cuantos activos, tu AUM total
- **Calendario de la semana:** reuniones agendadas (se sincroniza con Google Calendar)
- **Acciones rapidas:** botones para las tareas mas comunes

### Cambiar tu contrasena o datos

1. Click en tu nombre (esquina superior derecha)
2. Selecciona **"Mi Perfil"**
3. Ahi puedes editar tu nombre, foto y cambiar tu contrasena

---

## Gestionar Clientes

### Crear un cliente nuevo

1. En el menu superior, click en **"Clientes"**
2. Click en **"Nuevo Cliente"**
3. Completa los datos:
   - RUT (se valida automaticamente)
   - Nombre y apellido
   - Email (importante: es el que usara para acceder al portal)
   - Telefono
   - Fecha de nacimiento
   - Patrimonio estimado
4. Click **"Guardar"**

### Ver y editar un cliente

1. En **Clientes**, busca por nombre o email
2. Click en el nombre del cliente
3. Veras todas sus secciones: datos, perfil de riesgo, portafolio, reportes, contrato, mensajes
4. Para editar sus datos, click en el icono de edicion

### Eliminar un cliente

1. Entra al detalle del cliente
2. Busca el boton **"Eliminar"** en la seccion de informacion
3. Confirma la eliminacion

---

## Perfil de Riesgo

El perfil de riesgo determina que tipo de portafolio es adecuado para cada cliente. Se evalua en 4 dimensiones: capacidad, tolerancia, percepcion y compostura.

### Enviar el cuestionario

1. Entra al detalle del cliente
2. En la seccion **"Perfil de Riesgo"**, click en **"Re-enviar cuestionario"**
3. El cliente recibe un email con un link seguro
4. Completa 7 preguntas y el sistema le asigna un perfil automaticamente:
   - **Conservador** — prioriza preservar el capital
   - **Moderado** — balance entre riesgo y retorno
   - **Crecimiento** — busca mayor rentabilidad
   - **Agresivo** — maxima exposicion a renta variable

5. Tu recibes una **notificacion** cuando el cliente completa el cuestionario

> Si el cliente ya completo el cuestionario antes, al abrir el link vera un aviso de que ya esta hecho, con la opcion de repetirlo si lo desea.

---

## Subir y Analizar Cartolas

Una cartola es el estado de cuenta del cliente. La plataforma la analiza y clasifica automaticamente.

### Subir una cartola

1. En el menu, click en **"Cartola & Riesgo"**
2. Sube el archivo **PDF o Excel** del estado de cuenta
3. El sistema:
   - Identifica cada instrumento
   - Los clasifica en: Renta Variable, Renta Fija, Alternativos, Caja
   - Calcula el valor total y la composicion
4. Se crea un **snapshot** (foto del portafolio en ese momento)

> La primera cartola que subas se marca automaticamente como **linea base** — el punto de partida contra el que se medira la evolucion del cliente.

---

## Disenar el Portafolio Recomendado

### Abrir el Portfolio Designer

1. En el menu, click en **"Portfolio Designer"**
2. El modo principal es **Comparacion**

### Crear una recomendacion

1. **Selecciona el cliente** del dropdown
2. Se cargan dos paneles:
   - **Actual:** lo que el cliente tiene hoy (su ultimo snapshot)
   - **Recomendado:** sugerencia generada por IA segun su perfil de riesgo
3. **Ajusta la recomendacion:**
   - Para **agregar un fondo:** click en "Buscar Fondo" → escribe el nombre → selecciona de los resultados
   - Para **eliminar un fondo:** click en la X junto al fondo
   - Para **cambiar porcentajes:** edita directamente el campo de %
4. Click **"Guardar Cartera"**
5. Veras un **resumen de rebalanceo:** que debe comprar, que debe vender, que se mantiene

### Busqueda de fondos

El buscador encuentra fondos en 3 fuentes:
- **Fondos mutuos chilenos** (Fintual y AAFM, por nombre o RUN)
- **ETFs internacionales** (Alpha Vantage, por ticker o nombre)
- **Base de datos local** (fondos ya usados en la plataforma)

### Otros modos del Designer

- **Modelo:** Carga el benchmark del perfil de riesgo y ajusta manualmente por clase de activo
- **Rapido:** Plantillas predefinidas por perfil, para aplicar rapidamente
- **Analisis:** Compara hasta 6 fondos/ETFs lado a lado
- **Directo:** Para acciones y bonos individuales

---

## Seguimiento del Portafolio

El seguimiento te permite ver como evoluciona el portafolio del cliente a lo largo del tiempo.

### Acceder al seguimiento

1. Entra al detalle del cliente
2. Click en la pestaña **"Seguimiento"**

### Que veras

**Grafico de evolucion**
- Muestra la rentabilidad TWR o el valor del portafolio en el tiempo
- Puedes cambiar el periodo: 1 mes, 3 meses, 6 meses, 1 año, Todo

**Comparacion vs Recomendacion**
- Barras que muestran: cuanto tiene en Renta Variable vs cuanto deberia tener
- Lo mismo para Renta Fija, Alternativos y Caja
- Te ayuda a ver rapidamente si esta desalineado

**Tabla de Rebalanceo**
- Para cada instrumento muestra:
  - Porcentaje actual
  - Porcentaje recomendado
  - Diferencia
  - Accion sugerida: **Comprar**, **Vender** o **Mantener**

**Registrar ejecuciones**
- Cuando hayas ejecutado las operaciones en el broker, click en **"Registrar ejecucion"**
- Esto guarda un historial de que operaciones se hicieron y cuando
- Puedes ver el historial expandiendo la seccion "Historial de Ejecuciones"

**Historial de cartolas**
- Todas las cartolas ingresadas con fecha, valor y fuente
- La estrella marca cual es la linea base

**Historial de recomendaciones**
- Timeline con todas las versiones de cartera recomendada que has guardado

### Actualizar precios

- Click en **"Actualizar precios"** para generar snapshots intermedios con precios de mercado actualizados
- Esto permite ver la evolucion entre cartolas sin necesidad de subir una nueva

---

## Vista General de Clientes

Para ver el panorama completo de todos tus clientes de un vistazo.

### Acceder

1. En el menu, click en **"Vista General"**

### Que encontraras

**Metricas resumen:**
- Total de clientes
- AUM total (valor de todos los portafolios)
- TWR promedio (rentabilidad promedio)
- Cuantos tienen recomendacion
- Cuantos tienen drift alto (desalineados)
- Cuantos llevan mas de 30 dias sin contacto

**Filtros utiles:**
- Buscar por nombre o email
- Filtrar por perfil: solo Conservadores, solo Moderados, etc.
- Filtrar por estado: drift alto, sin contacto, sin reportes, sin portafolio

**Ordenar por:**
- Nombre
- Valor del portafolio (quien tiene mas/menos)
- Rentabilidad TWR (quien le ha ido mejor/peor)
- Drift (quien esta mas desalineado)
- Dias sin contacto (a quien hace mas tiempo que no contactas)

> **Tip:** Ordena por TWR descendente para ver tus mejores clientes. Filtra por "Sin contacto 30d+" para identificar clientes que necesitan atencion.

---

## Notificaciones

La campana en la esquina superior derecha te avisa de eventos importantes:

- **Cartola subida** — un cliente subio una cartola desde su portal
- **Cuestionario completado** — un cliente respondio su perfil de riesgo
- **Alerta de rebalanceo** — el portafolio de un cliente se desvio mas del umbral permitido
- **Reporte enviado** — se envio un reporte automatico

Click en una notificacion para ir directamente al cliente. Click en "Marcar todas leidas" para limpiar.

> El sistema revisa automaticamente el drift de todos tus clientes de lunes a viernes a la 1 PM. Si alguno supera el 5% de desviacion, recibes una alerta.

---

## Reportes al Cliente

### Configurar reportes automaticos

1. Entra al detalle del cliente
2. En la seccion **"Reportes"**, selecciona la frecuencia:
   - **Diario** — recibe un resumen cada dia habil
   - **Semanal** — recibe un resumen cada lunes
   - **Mensual** — recibe un resumen el primer dia del mes
3. El sistema envia automaticamente un email al cliente con:
   - Valor actual del portafolio
   - Composicion por clase de activo
   - Cambio de valor respecto al reporte anterior
   - Link para ver mas detalles en su portal

---

## Contrato

### Subir un contrato

1. Entra al detalle del cliente
2. En la seccion **"Contrato"**, click en **"Subir contrato"**
3. Selecciona el PDF
4. Una vez subido, puedes:
   - **Ver** el contrato
   - **Descargar** una copia
   - **Reemplazar** por una version actualizada
   - **Eliminar** el contrato

---

## Mensajes

### Enviar un mensaje al cliente

1. Entra al detalle del cliente
2. En la seccion **"Mensajes"**, escribe tu mensaje
3. Click en **"Enviar"**
4. El cliente lo vera en su portal en la pestaña "Mensajes"

---

## Herramientas Adicionales

### Market Dashboard

Catalogo completo de fondos mutuos chilenos. Busca por nombre o administradora y ve:
- Rentabilidades a distintos plazos (1 dia a 1 año)
- Patrimonio administrado
- Numero de participes

### Centro de Fondos

Busca y compara fondos/ETFs internacionales:
- Compara hasta 6 fondos lado a lado
- Ve rentabilidad, gastos, composicion
- Analiza factsheets PDF con inteligencia artificial

### Calculadora APV

Simulador de Ahorro Previsional Voluntario. Permite al cliente ver cuanto ahorraria y el beneficio tributario.

### Educacion Financiera

Contenido educativo que puedes compartir con tus clientes.

---

## El Portal de tu Cliente

Tus clientes acceden a su propio portal donde pueden:

### Lo que el cliente ve

- **Inicio:** Pasos de onboarding, informacion de su asesor, accesos rapidos
- **Mi Portafolio:** Valor total, grafico de evolucion, composicion, cartera recomendada vs actual
- **Reportes:** Todos los reportes que le has enviado
- **Mis Cartolas:** Historial de cartolas (las que subio el y las que subiste tu, marcadas con badge "Asesor")
- **Mensajes:** Hilo de conversacion contigo

### Lo que el cliente puede hacer

- Completar el cuestionario de riesgo (si no lo ha hecho)
- Subir cartolas (estados de cuenta PDF o Excel)
- Leer reportes
- Enviar mensajes
- Cambiar su contrasena

### Invitar a un cliente al portal

1. Entra al detalle del cliente
2. Asegurate de que tiene email registrado
3. Click en **"Invitar al Portal"**
4. El sistema envia un email al cliente:
   - **Si es un usuario nuevo:** recibe un link para crear su contrasena y acceder
   - **Si ya tiene cuenta** (por ejemplo, si tambien es asesor): recibe un link para ingresar con su contrasena actual
5. El cliente configura su contrasena (si es nuevo) y accede al portal
6. Si el cliente olvida su contrasena, puede usar **"¿Olvidaste tu contraseña?"** en la pagina de login del portal

---

## Glosario

| Termino | Significado |
|---------|-------------|
| **AUM** | Assets Under Management — valor total de los portafolios que administras |
| **TWR** | Time-Weighted Return — rentabilidad que elimina el efecto de depositos y retiros |
| **Drift** | Desviacion entre lo que el cliente tiene y lo que le recomendaste |
| **Snapshot** | Foto del portafolio en un momento dado (valor, composicion, holdings) |
| **Baseline** | La primera cartola, el punto de partida para medir evolucion |
| **Renta Variable (RV)** | Acciones, ETFs de acciones, fondos accionarios |
| **Renta Fija (RF)** | Bonos, depositos a plazo, fondos de renta fija |
| **Alternativos (ALT)** | Commodities, bienes raices, hedge funds |
| **Caja** | Efectivo, money market, liquidez |
| **Rebalanceo** | Ajustar el portafolio para que vuelva a estar alineado con la recomendacion |
| **RUN** | Numero unico que identifica un fondo mutuo en Chile |

---

## Preguntas Frecuentes

**¿Con que frecuencia se actualizan los precios?**
Los precios se actualizan automaticamente cuando usas "Actualizar precios" en el seguimiento. El sistema busca en Fintual, Bolsa de Santiago, Yahoo Finance y Alpha Vantage en ese orden.

**¿Que pasa si un fondo no tiene precio automatico?**
Puedes ingresar precios manualmente importando un Excel con fecha y valor cuota. Contacta al administrador para configurarlo.

**¿El cliente puede modificar su portafolio?**
No. El portal del cliente es solo de lectura. Solo puede subir cartolas, responder el cuestionario, leer reportes y enviar mensajes.

**¿Puedo tener multiples asesores en la plataforma?**
Si. El administrador puede crear asesores desde "Gestion de Asesores". Cada asesor ve solo sus propios clientes. El admin ve todo.

**¿Que pasa si el cliente ya completo el cuestionario y le envio el link de nuevo?**
Vera un mensaje diciendo que ya lo completo, con la opcion de repetirlo si quiere actualizar sus respuestas.

**¿Como se que un cliente necesita rebalanceo?**
De tres formas:
1. Recibes una **notificacion automatica** si el drift supera el 5%
2. En **Vista General**, filtra por "Drift alto"
3. En el **Seguimiento** del cliente, mira la tabla de rebalanceo

**¿Puedo personalizar el umbral de drift?**
Si. Por defecto es 5%. Contacta al administrador para ajustarlo.

**¿Los reportes se envian automaticamente?**
Si, una vez que configuras la frecuencia en el detalle del cliente. Se envian de lunes a viernes al mediodia.

**¿Puedo ser asesor y cliente al mismo tiempo?**
Si. Si tu email esta registrado como asesor y tambien como cliente (por ejemplo, para manejar tu propio portafolio), puedes cambiar entre ambas vistas:
- En la **vista de asesor**, veras un boton "Ir a mi Portal Cliente" en el menu de usuario
- En el **portal de cliente**, veras un boton "Vista Asesor" para volver
El sistema recuerda tu rol activo y te redirige correctamente.

**¿Que pasa si mi cliente olvida su contrasena?**
En la pagina de login del portal hay un link **"¿Olvidaste tu contraseña?"** que lo lleva a recuperar su acceso por email. Tambien puedes re-invitarlo desde su ficha.
