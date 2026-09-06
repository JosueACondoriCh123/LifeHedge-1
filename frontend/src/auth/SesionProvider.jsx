import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { supabase, supabaseConfigurado } from "../datos/supabase.js";

const ContextoSesion = createContext(null);

/** Traduce los errores de Supabase, que llegan en inglés. */
function traducir(error) {
  const mensaje = error?.message ?? "";
  if (/Invalid login credentials/i.test(mensaje)) {
    return "Correo o contraseña incorrectos.";
  }
  if (/User already registered/i.test(mensaje)) {
    return "Ese correo ya tiene una cuenta. Inicia sesión.";
  }
  if (/Password should be at least/i.test(mensaje)) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }
  if (/Anonymous sign-ins are disabled/i.test(mensaje)) {
    return (
      "El modo invitado está desactivado en Supabase. " +
      "Actívalo en Authentication → Providers → Anonymous sign-ins."
    );
  }
  if (/Email not confirmed/i.test(mensaje)) {
    return "Tu correo aún no está confirmado.";
  }
  return mensaje || "No pudimos completar la operación. Intenta de nuevo.";
}

export function SesionProvider({ children }) {
  const [sesion, setSesion] = useState(null);
  const [cargando, setCargando] = useState(supabaseConfigurado);

  useEffect(() => {
    if (!supabase) return undefined;

    let vivo = true;
    // Hay que hacer las dos cosas: leer la sesión existente y suscribirse a
    // los cambios. Con solo la primera, no reacciona al cerrar sesión en
    // otra pestaña; con solo la segunda, el usuario aparece deslogueado al
    // recargar.
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setSesion(data?.session ?? null);
      setCargando(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSesion(nueva);
    });

    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const entrar = useCallback(async (correo, contrasena) => {
    if (!supabase) throw new Error("Las cuentas no están configuradas.");
    const { error } = await supabase.auth.signInWithPassword({
      email: correo,
      password: contrasena,
    });
    if (error) throw new Error(traducir(error));
  }, []);

  const registrar = useCallback(async (correo, contrasena, nombre) => {
    if (!supabase) throw new Error("Las cuentas no están configuradas.");
    const { error } = await supabase.auth.signUp({
      email: correo,
      password: contrasena,
      // El disparador de la base de datos lee este metadato para crear el perfil.
      options: { data: { nombre } },
    });
    if (error) throw new Error(traducir(error));
  }, []);

  /**
   * Sesión de invitado.
   *
   * Es lo que permite que un juez con tres minutos entre sin registrarse y
   * el dashboard funcione: el backend exige un token válido en todas las
   * rutas de datos, y una sesión anónima de Supabase produce uno real, con
   * su propio id de usuario. RLS lo aísla igual que a cualquier otro.
   *
   * Requiere activar Authentication → Providers → Anonymous sign-ins.
   */
  const entrarComoInvitado = useCallback(async () => {
    if (!supabase) throw new Error("Las cuentas no están configuradas.");
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error(traducir(error));
  }, []);

  const salir = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const valor = useMemo(
    () => ({
      hayCuentas: supabaseConfigurado,
      cargando,
      sesion,
      usuario: sesion?.user ?? null,
      esInvitado: sesion?.user?.is_anonymous === true,
      entrar,
      registrar,
      entrarComoInvitado,
      salir,
    }),
    [cargando, sesion, entrar, registrar, entrarComoInvitado, salir]
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export function useSesion() {
  const valor = useContext(ContextoSesion);
  if (valor === null) {
    throw new Error("useSesion se usó fuera de <SesionProvider>.");
  }
  return valor;
}
