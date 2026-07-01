# Genios y Gigantes — juego web

Versión digital jugable en el navegador (modo *hotseat*, 2 a 4 jugadores en la
misma pantalla) del juego de mesa de civilizaciones **Genios y Gigantes**.

## Cómo jugar

Es una web estática, sin dependencias ni compilación.

- **Opción rápida:** abrí `index.html` directamente en el navegador.
- **Recomendado** (evita restricciones de `file://`): serví la carpeta con
  cualquier servidor estático, por ejemplo:

  ```bash
  npx http-server -p 8123
  # o
  python3 -m http.server 8123
  ```

  Luego entrá a `http://localhost:8123`.

En la pantalla de inicio elegís cantidad de jugadores, nombres y colores, y
pulsás **Comenzar partida**.

## Qué implementa

- **Tablero hexagonal** (isla) generado con recursos, capitales y adyacencias.
- **4 Pilares** (Ciencia, Cultura, Libertad, Poder) con niveles 1–12.
- **4 Recursos** (Oro, Alimentos, Piedra, Armas), producción, consumo de comida,
  rebeliones por hambre y límite de almacenamiento.
- **8 Herencias** (pueblos), **8 Gobiernos** y **8 Religiones** con sus
  modificadores de pilares.
- **Reclutamiento**, movimiento, **combate con dados** (Nº cohortes + Poder +
  Ciencia + d6) y tabla de resultados.
- **Ciudades**, **asedios** de ciudades y capitales, **maravillas** (6 tipos).
- **Cartas de Situación** (mazo completo: muy comunes, comunes, raras, épicas).
- **Genios y Gigantes** (37 arquetipos con personajes históricos): efectos de
  Ascenso, Influencia y Herencia, y panteón con puntos.
- **Vasallaje / subyugación**, comercio con el mercader y **puntaje final** con
  las condiciones de victoria (Conquista, Dominio, Maravilla).

## Estructura

```
index.html          # página principal
css/style.css       # estilos
js/data.js          # herencias, gobiernos, religiones, maravillas, reglas
js/archetypes.js    # cartas de Genios y Gigantes
js/situations.js    # mazo de cartas de situación
js/hex.js           # geometría y render del tablero hexagonal
js/engine.js        # motor de reglas (estado, turnos, combate, puntaje)
js/ui.js            # interfaz y controladores
js/main.js          # arranque
Screenshot_*.png    # arte (pilares, recursos, logo, tablero de referencia)
Reglamento.docx     # reglamento original
Arquetipos.docx     # arquetipos originales
```

## Notas

Algunos efectos raros/épicos que requieren decisión sobre el tablero (rebeliones
dirigidas, guerras de liberación, mediaciones, destrucción de ciudad, etc.) se
anuncian en la **Crónica** para resolverse entre los jugadores; el resto de la
contabilidad la lleva el motor automáticamente.
