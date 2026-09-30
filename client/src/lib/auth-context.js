import { createContext, useContext } from "react";

// Keep the context in its own module. During Vite Fast Refresh an old page and
// a newly refreshed provider can otherwise briefly hold different context
// instances, which produces the misleading "useAuth must be used inside
// AuthProvider" error even though the provider is mounted.
export const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
