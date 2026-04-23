import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ⚠️  Las credenciales se cargan desde src/env.js (no incluido en Git).
//     Copia src/env.example.js → src/env.js y rellena tus valores.
const __env = window.__ENV__ || {};
const firebaseConfig = {
  apiKey:            __env.FIREBASE_API_KEY,
  authDomain:        __env.FIREBASE_AUTH_DOMAIN,
  projectId:         __env.FIREBASE_PROJECT_ID,
  storageBucket:     __env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: __env.FIREBASE_MESSAGING_SENDER_ID,
  appId:             __env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);

// Exportamos TODO para que App.js lo reconozca
export { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  doc, 
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  deleteDoc,
  serverTimestamp
};
