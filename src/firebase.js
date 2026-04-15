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

// Añadimos collection, getDocs, query, orderBy y deleteDoc que faltaban
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ⚠️  NO pongas credenciales aquí directamente.
// Copia .env.example → .env y rellena tus valores.
// En producción, configura estas variables en tu plataforma de hosting.
const firebaseConfig = {
  apiKey:            import.meta.env?.VITE_FIREBASE_API_KEY            ?? window.__ENV__?.FIREBASE_API_KEY,
  authDomain:        import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN        ?? window.__ENV__?.FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env?.VITE_FIREBASE_PROJECT_ID         ?? window.__ENV__?.FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET     ?? window.__ENV__?.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID ?? window.__ENV__?.FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env?.VITE_FIREBASE_APP_ID             ?? window.__ENV__?.FIREBASE_APP_ID,
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
  deleteDoc
};
