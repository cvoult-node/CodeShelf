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
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAR4AkM8MaQBqA1MDUyQf5UeCqSntdiz70",
    authDomain: "codeshelf-c.firebaseapp.com",
    projectId: "codeshelf-c",
    storageBucket: "codeshelf-c.firebasestorage.app",
    messagingSenderId: "688503183462",
    appId: "1:688503183462:web:a2f3e945dc7b8bbca0b5a7"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);

// Exportamos las nuevas funciones
export { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  doc, 
  setDoc 
};
