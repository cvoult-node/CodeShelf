// Importamos React y Firebase desde links (CDN)
import React, { useState, useEffect } from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import { auth, provider, db, signInWithPopup, signOut, onAuthStateChanged, doc, setDoc } from './firebase.js';

const TECLADO = [
  'A','B','C','D','E','F','G','H','I','J','K','L','M','N','Ñ','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  'a','b','c','d','e','f','g','h','i','j','k','l','m','n','ñ','o','p','q','r','s','t','u','v','w','x','y','z',
  '0','1','2','3','4','5','6','7','8','9',
  '¡','!','¿','?','@','#','$','%','&','(',')','=','+','-','*','/','.',',',';',':','_','<','>','[',']','{','}','^','~','`','\'','"','|','\\'
];

function App() {
  const [user, setUser] = useState(null);
  const [currentChar, setCurrentChar] = useState('A');
  const [fontData, setFontData] = useState({});
  const [grid, setGrid] = useState(Array(64).fill(false));

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const togglePixel = (i) => {
    const newGrid = [...grid];
    newGrid[i] = !newGrid[i];
    setGrid(newGrid);
    setFontData(prev => ({ ...prev, [currentChar]: newGrid }));
  };

  const switchChar = (char) => {
    setCurrentChar(char);
    setGrid(fontData[char] || Array(64).fill(false));
  };

  const handleSave = async () => {
    if (!user) return alert("Inicia sesión");
    try {
      await setDoc(doc(db, "fuentes", user.uid), {
        author: user.displayName,
        font: fontData,
        lastUpdated: new Date()
      });
      alert("¡Fuente guardada!");
    } catch (e) { alert("Error al guardar"); }
  };

  if (!user) {
    return React.createElement('div', { className: "h-screen flex flex-col items-center justify-center bg-black text-white" },
      React.createElement('h1', { className: "text-5xl text-cyan-400 mb-8 font-bold" }, "CODE SHELF"),
      React.createElement('button', { 
        onClick: () => signInWithPopup(auth, provider),
        className: "bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-cyan-400 transition" 
      }, "ENTRAR CON GOOGLE")
    );
  }

  // Estructura del editor (Simplificada para JS puro sin JSX complejo)
  return React.createElement('div', { className: "min-h-screen p-8 bg-neutral-900 text-white font-sans" },
    React.createElement('header', { className: "flex justify-between mb-8 border-b border-neutral-800 pb-4" },
      React.createElement('h1', { className: "text-2xl font-bold text-cyan-400" }, "CODE SHELF"),
      React.createElement('button', { onClick: () => signOut(auth), className: "text-red-400" }, "Salir")
    ),
    React.createElement('div', { className: "grid md:grid-cols-2 gap-8" },
      // Panel de dibujo
      React.createElement('div', { className: "flex flex-col items-center" },
        React.createElement('div', { className: "mb-4 text-xl" }, `Editando: ${currentChar}`),
        React.createElement('div', { className: "grid grid-cols-8 gap-1 bg-neutral-800 p-2 border border-neutral-700" },
          grid.map((p, i) => React.createElement('div', {
            key: i,
            onClick: () => togglePixel(i),
            className: `w-10 h-10 cursor-pointer border border-black ${p ? 'bg-cyan-400 shadow-[0_0_8px_cyan]' : 'bg-neutral-950'}`
          }))
        ),
        React.createElement('button', { onClick: handleSave, className: "mt-8 bg-cyan-600 w-full py-4 font-bold rounded" }, "GUARDAR FUENTE")
      ),
      // Selector de teclas
      React.createElement('div', { className: "bg-black/30 p-4 rounded h-[400px] overflow-y-auto" },
        TECLADO.map(t => React.createElement('button', {
          key: t,
          onClick: () => switchChar(t),
          className: `w-10 h-10 m-1 border ${currentChar === t ? 'bg-cyan-400 text-black' : 'border-neutral-700 hover:border-cyan-400'}`
        }, t))
      )
    )
  );
}

// Montamos la aplicación
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
