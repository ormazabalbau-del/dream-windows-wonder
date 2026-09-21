# Juego dreamcore Win95 en 3D

## Experiencia
- Reemplazar la pantalla vacía por un escritorio Windows 95 que funcione como hub del juego.
- Crear una introducción de arranque, escritorio interactivo, barra de tareas, menú Inicio, ventanas y accesos a distintas zonas.
- Hacer que “Entrar al sueño” abra una escena 3D explorable en primera persona, sin convertirlo en una página promocional.

## Mundo y juego
- Construir un paisaje dreamcore 3D de baja fidelidad: cielo imposible, suelo cuadriculado, pasillos, puertas, carteles y objetos flotantes.
- Añadir varios tipos de NPC: ojos voladores, figuras observadoras y habitantes abstractos, con movimientos y reacciones distintas.
- Incluir objetivo jugable, objetos coleccionables, indicador de señal/sueño, diálogos y retorno al escritorio.
- Añadir controles de teclado y ratón, además de controles táctiles básicos para pantallas pequeñas.

## Dirección visual y sonido
- Mantener una interfaz Win95 reconocible: gris clásico, azul de título, bordes biselados, iconos pixelados y tipografía de sistema.
- Integrar el 3D dentro de la “computadora”, con resolución retro, dithering visual, niebla, scanlines y pequeñas anomalías dreamcore.
- Generar audio ambiental y efectos sencillos en tiempo real, con opción visible para silenciarlos.
- Respetar la reducción de movimiento del dispositivo.

## Detalles técnicos
- Usar Three.js para la escena, geometrías y animaciones 3D; aislar su carga del renderizado inicial para mantener compatibilidad.
- Mantener los datos y el progreso de la partida en memoria durante la sesión, sin cuentas ni almacenamiento externo.
- Definir todos los colores, sombras, tipografía y estados desde el sistema visual global.
- Añadir título y descripción propios del juego para compartir la página.

## Verificación
- Comprobar el arranque, escritorio, menú Inicio, ventanas, entrada/salida del sueño y objetivo principal.
- Revisar la escena en escritorio y móvil, confirmar que el 3D se vea, se mueva y no tape los controles.
- Corregir errores de ejecución y confirmar que la versión final compile correctamente.
