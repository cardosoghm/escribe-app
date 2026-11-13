# Escribe – tablero de comunicación (app Android)

App gratuita y sin internet, con la misma disposición que el tablero de papel: cinco columnas de la A a la Y y la Z sola abajo a la derecha.

## Qué hace (versión 1)

- Funciona **100 % sin internet**. No tiene navegador, enlaces ni publicidad.
- **Se fija en la pantalla** al abrirse. El botón Atrás no hace nada y no se puede salir sin el adulto.
- **Modo adulto oculto**: hay que mantener apretada **3 segundos la esquina superior izquierda** y poner el PIN. El **PIN inicial es 0000**: cambialo.
- **Toques a prueba de errores**: la letra se marca al levantar el dedo y solo si el dedo sigue sobre la letra. Se ignoran los toques dobles rápidos y los toques con la palma. «Borrar todo» hay que mantenerlo apretado casi 1 segundo.
- **Voz**: el botón «Hablar» lee lo escrito. También puede **hablar sola** cuando pasan unos segundos sin tocar (se configura en modo adulto → Voz). Opcionalmente puede decir cada letra o cada palabra.
- **Historial local** de todo lo que dijo, exportable para compartir con el terapeuta.
- **Ajustes**: tamaño de letras, colores, mostrar la Ñ, velocidad y tono de la voz, tiempos de toque, vibración.
- Pantalla siempre encendida y en pantalla completa.

## Cómo conseguir el APK (gratis, sin instalar nada en la PC)

1. Crear una cuenta en https://github.com (es gratis).
2. Crear un repositorio nuevo, por ejemplo `escribe-app`. Puede ser público o privado.
3. Subir **todo el contenido de esta carpeta**. Se puede arrastrar desde «Add file → Upload files». Importante: también la carpeta oculta `.github`.
4. Entrar a la pestaña **Actions**. La compilación arranca sola y tarda unos 5 minutos.
5. Cuando termina, el archivo **Escribe.apk** aparece en **Releases**, a la derecha de la página del repositorio.

## Instalar en la tablet o el celular

1. Descargar `Escribe.apk` desde el dispositivo.
2. Abrirlo. Android va a pedir permiso para «instalar apps de origen desconocido»: aceptar.
3. **Voz sin internet**: Ajustes → Accesibilidad → Salida de texto a voz → Motor de Google → instalar los datos de voz de **Español**.
4. **Que pida PIN para salir**: Ajustes → Seguridad → *Fijar pantalla* (en Samsung se llama *Anclar ventanas*) → activar y marcar «Pedir PIN antes de desfijar».
5. Abrir Escribe. La primera vez Android pregunta si querés fijar la app: aceptar.

**Para salir de la app (adulto):** modo adulto → «Desfijar ahora».

## Para programadores

- La web está en `www/` (HTML, CSS y JS sin dependencias) y el proyecto Android de Capacitor 8 en `android/`.
- El bloqueo usa un plugin propio: `android/app/src/main/java/ar/escribe/tablero/KioskPlugin.java` (`startLockTask`).
- Para compilar en una PC con Android Studio: `npm install && npm run apk`.
- Para publicar en Google Play hace falta firmar una versión de release (`./gradlew bundleRelease` con un keystore).
- La versión web (`www/`) también funciona como PWA offline si se sube a escribe.ar.
