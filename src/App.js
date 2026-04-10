import React, { useState, useEffect } from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import { 
  auth, provider, db, signInWithPopup, signOut, onAuthStateChanged, 
  signInWithEmailAndPassword, createUserWithEmailAndPassword, doc, setDoc, getDoc 
} from './firebase.js';

const TECLADO = [
  'A','B','C','D','E','F','G','H','I','J','K','L','M','N','Ñ','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  'a','b','c','d','e','f','g','h','i','j','k','l','m','n','ñ','o','p','q','r','s','t','u','v','w','x','y','z',
  '0','1','2','3','4','5','6','7','8','9',
  '¡','!','¿','?','@','#','$','%','&','(',')','=','+','-','*','/','.',',',';',':','_','<','>','[',']','{','}','^','~','`','\'','"','|','\\'
];

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [currentChar, setCurrentChar] = useState('A');
  const [fontData, setFontData] = useState({}); 
  const [grid, setGrid] = useState(Array(64).fill(false));

  // 1. CARGAR DATOS AL INICIAR
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const docRef = doc(db, "fuentes", u.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const savedFont = docSnap.data().font || {};
            setFontData(savedFont);
            if (savedFont['A']) setGrid(savedFont['A']);
          }
        } catch (err) { console.error("Error al cargar:", err); }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. LOGICA DE GUARDADO
  const handleSaveFont = async (dataToSave = fontData) => {
    if (!user) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, "fuentes", user.uid), {
        author: user.displayName || user.email,
        font: dataToSave,
        lastUpdated: new Date()
      }, { merge: true });
    } catch (e) {
      console.error("Error al guardar:", e);
    }
    setIsSaving(false);
  };

  // 3. LOGICA DE EXPORTACIÓN
  const exportarFuente = () => {
    if (Object.keys(fontData).length === 0) {
      alert("¡Dibuja algo antes de exportar!");
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fontData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `codeshelf_font_${currentChar}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const togglePixel = (i) => {
    const newGrid = [...grid];
    newGrid[i] = !newGrid[i];
    setGrid(newGrid);
    const newFontData = { ...fontData, [currentChar]: newGrid };
    setFontData(newFontData);
  };

  const switchChar = (char) => {
    handleSaveFont(); // Auto-guarda la letra anterior al cambiar
    setCurrentChar(char);
    setGrid(fontData[char] || Array(64).fill(false));
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        try {
          await createUserWithEmailAndPassword(auth, email, password);
        } catch (regError) { alert("Error: " + regError.message); }
      } else { alert("Error: " + error.message); }
    }
  };

  if (loading) return React.createElement('div', { className: "h-screen bg-black flex items-center justify-center text-cyan-400 font-bold" }, "CARGANDO CODESHELF...");

  if (!user) {
    return React.createElement('div', { className: "h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white p-6" },
      React.createElement('h1', { className: "text-6xl text-cyan-400 mb-2 font-bold tracking-tighter" }, "CODE SHELF"),
      React.createElement('form', { onSubmit: handleEmailAuth, className: "flex flex-col gap-3 w-full max-w-sm mt-8" },
        React.createElement('input', { type: "email", placeholder: "Email", value: email, onChange: (e) => setEmail(e.target.value), className: "bg-neutral-900 border border-neutral-800 p-4 rounded-lg outline-none focus:border-cyan-400 text-white" }),
        React.createElement('input', { type: "password", placeholder: "Contraseña", value: password, onChange: (e) => setPassword(e.target.value), className: "bg-neutral-900 border border-neutral-800 p-4 rounded-lg outline-none focus:border-cyan-400 text-white" }),
        React.createElement('button', { type: "submit", className: "bg-cyan-600 p-4 rounded-lg font-bold hover:bg-cyan-500" }, "ENTRAR / REGISTRAR")
      ),
      React.createElement('button', { onClick: () => signInWithPopup(auth, provider), className: "mt-4 bg-white text-black px-8 py-4 rounded-lg font-bold w-full max-w-sm" }, "GOOGLE LOGIN")
    );
  }

  return React.createElement('div', { className: "min-h-screen p-6 bg-neutral-950 text-neutral-200" },
    React.createElement('header', { className: "flex justify-between items-center max-w-6xl mx-auto mb-10 border-b border-neutral-900 pb-6" },
      React.createElement('div', null,
        React.createElement('h1', { className: "text-2xl font-bold text-cyan-400" }, "CODE SHELF"),
        React.createElement('span', { className: "text-[10px] text-neutral-600 uppercase tracking-widest" }, user.email)
      ),
      React.createElement('div', { className: "flex gap-3" },
        React.createElement('button', { onClick: exportarFuente, className: "bg-cyan-600/10 text-cyan-400 border border-cyan-600/30 px-4 py-2 rounded-lg text-xs font-bold hover:bg-cyan-600/20 transition" }, "EXPORTAR JSON"),
        React.createElement('button', { onClick: () => signOut(auth), className: "bg-red-900/10 text-red-500 border border-red-900/20 px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-900/20 transition" }, "SALIR")
      )
    ),

    React.createElement('div', { className: "max-w-6xl mx-auto grid lg:grid-cols-2 gap-10" },
      React.createElement('div', { className: "flex flex-col items-center" },
        React.createElement('div', { className: "mb-6 text-2xl font-mono text-cyan-400" }, `CARÁCTER: ${currentChar}`),
        React.createElement('div', { className: "grid grid-cols-8 gap-1 bg-neutral-900 p-2 rounded-xl border border-neutral-800 shadow-2xl" },
          grid.map((active, i) => React.createElement('div', {
            key: i,
            onClick: () => togglePixel(i),
            className: `w-10 h-10 md:w-12 md:h-12 cursor-pointer border border-black/20 rounded-sm transition-all ${active ? 'bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 'bg-neutral-950 hover:bg-neutral-800'}`
          }))
        ),
        React.createElement('button', { 
          onClick: () => handleSaveFont(), 
          disabled: isSaving,
          className: `mt-8 w-full py-4 rounded-xl font-bold transition-all ${isSaving ? 'bg-neutral-800 text-neutral-600' : 'bg-cyan-600 text-white hover:bg-cyan-500 shadow-lg shadow-cyan-900/20'}` 
        }, isSaving ? "GUARDANDO CAMBIOS..." : "GUARDAR EN LA NUBE")
      ),

      React.createElement('div', { className: "bg-neutral-900/30 p-6 rounded-3xl border border-neutral-900/50 backdrop-blur-sm" },
        React.createElement('h3', { className: "text-[10px] text-neutral-500 mb-6 font-bold uppercase tracking-[0.2em]" }, "Mapa de Caracteres"),
        React.createElement('div', { className: "flex flex-wrap gap-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar" },
          TECLADO.map(t => {
            const tieneDibujo = fontData[t] && fontData[t].some(p => p === true);
            return React.createElement('button', {
              key: t,
              onClick: () => switchChar(t),
              className: `w-10 h-10 flex items-center justify-center rounded-lg border text-sm font-bold transition-all ${
                currentChar === t ? 'bg-cyan-400 text-black border-white shadow-lg' : 
                tieneDibujo ? 'border-cyan-500/50 text-cyan-400 bg-cyan-900/20' : 'bg-neutral-900 border-neutral-800 text-neutral-600 hover:border-neutral-700'
              }`
            }, t);
          })
        )
      )
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
