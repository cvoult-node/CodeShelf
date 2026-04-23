// ─────────────────────────────────────────────────────────────
//  INSTRUCCIONES
//  1. Copia este archivo: cp src/env.example.js src/env.js
//  2. Rellena los valores con los de tu proyecto Firebase
//     (Firebase Console → Configuración del proyecto → Tus apps)
//  3. NUNCA subas src/env.js a Git (ya está en .gitignore)
// ─────────────────────────────────────────────────────────────

window.__ENV__ = {
  FIREBASE_API_KEY:             "TU_API_KEY_AQUI",
  FIREBASE_AUTH_DOMAIN:         "tu-proyecto.firebaseapp.com",
  FIREBASE_PROJECT_ID:          "tu-proyecto",
  FIREBASE_STORAGE_BUCKET:      "tu-proyecto.firebasestorage.app",
  FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  FIREBASE_APP_ID:              "1:000000000000:web:abcdef123456",
};
