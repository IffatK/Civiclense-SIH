import { createContext, useCallback, useContext, useState } from "react";

const ToastContext = createContext(null);
let sequence = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((type, message) => {
    const id = ++sequence;
    setToasts((items) => [...items, { id, type, message }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5000);
  }, []);
  const value = { success:(message)=>show("success",message), error:(message)=>show("error",message), warning:(message)=>show("warning",message), info:(message)=>show("info",message) };
  return <ToastContext.Provider value={value}>{children}<div className="toast-stack" aria-live="polite">{toasts.map((toast)=><div className={`toast toast--${toast.type}`} key={toast.id}><span>{toast.message}</span><button aria-label="Dismiss notification" onClick={()=>setToasts((items)=>items.filter((item)=>item.id!==toast.id))}>×</button></div>)}</div></ToastContext.Provider>;
}

export function useToast() {
  const context=useContext(ToastContext);
  if(!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
