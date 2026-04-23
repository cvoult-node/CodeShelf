# CodeShelf — Pixel Font Studio

Editor web para crear, editar y compartir fuentes pixel art. Gratis y de código abierto.

## Stack

- **Frontend**: Vanilla JS + React (via ESM) + Vite
- **Auth & DB**: Firebase (Authentication + Firestore)
- **Fuentes**: opentype.js (exportación OTF/TTF)

## Instalación

```bash
npm install
```

## Configuración

1. Copia el archivo de entorno:
   ```bash
   cp .env.example .env
   ```
2. Rellena tus credenciales de Firebase en `src/env.js` (ver `src/env.example` como referencia).

## Desarrollo

```bash
npm run dev
# Abre http://localhost:3000
```

## Build de producción

```bash
npm run build
```

## Estructura

```
src/
  App.js          — Componente raíz (React)
  Editor.js       — Editor de glifos pixel a pixel
  Feed.js         — Feed de proyectos del usuario
  firebase.js     — Inicialización Firebase
  canvas.js       — Algoritmos de grid (flood fill, shift, export)
  pixelRenderer.js — Renderizado de glifos como DOM/Canvas
  publish.js      — Publicación de fuentes en Firestore
  navbar-shared.js — Navbar compartida (vanilla JS)
  shared.css      — Variables CSS y estilos globales
  constants.js    — Paleta y constantes
  ui.js           — Primitivos UI (Btn, Modal, Overlay...)
  env.js          — Credenciales Firebase (NO subir a Git)
```
