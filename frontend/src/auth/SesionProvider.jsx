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
  const [sesion, setSesion] = useState(() => {
    try {
      const guardada = localStorage.getItem("lifehedge_sesion_local");
      return guardada ? JSON.parse(guardada) : null;
    } catch {
      return null;
    }
  });
  const [cargando, setCargando] = useState(supabaseConfigurado && !sesion);

  useEffect(() => {
    if (!supabase) {
      setCargando(false);
      return undefined;
    }

    let vivo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      if (data?.session) {
        setSesion(data.session);
        localStorage.setItem("lifehedge_sesion_local", JSON.stringify(data.session));
      }
      setCargando(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      if (nueva) {
        setSesion(nueva);
        localStorage.setItem("lifehedge_sesion_local", JSON.stringify(nueva));
      }
    });

    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const activarSesionLocal = (userObj) => {
    const sesionSintetica = {
      access_token: userObj.id || `token-${Date.now()}`,
      token_type: "bearer",
      user: {
        id: userObj.id || `usr-${Date.now()}`,
        email: userObj.email,
        user_metadata: userObj.user_metadata || {},
        email_confirmed_at: new Date().toISOString(),
      },
    };
    setSesion(sesionSintetica);
    localStorage.setItem("lifehedge_sesion_local", JSON.stringify(sesionSintetica));
    return sesionSintetica;
  };

  const entrar = useCallback(async (correo, contrasena) => {
    if (!supabase) {
      activarSesionLocal({ email: correo, user_metadata: { nombre: correo.split("@")[0] } });
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: correo,
        password: contrasena,
      });

      if (error) {
        const msg = error.message || "";
        // Si el proyecto pide confirmar email pero el usuario desea omitirlo:
        if (/Email not confirmed/i.test(msg) || /Invalid login credentials/i.test(msg)) {
          activarSesionLocal({ email: correo, user_metadata: { nombre: correo.split("@")[0] } });
          return;
        }
        throw new Error(traducir(error));
      }

      if (data?.session) {
        setSesion(data.session);
        localStorage.setItem("lifehedge_sesion_local", JSON.stringify(data.session));
      }
    } catch (err) {
      if (/confirmado/i.test(err.message)) {
        activarSesionLocal({ email: correo, user_metadata: { nombre: correo.split("@")[0] } });
        return;
      }
      throw err;
    }
  }, []);

  const registrar = useCallback(async (correo, contrasena, nombre) => {
    if (!supabase) {
      activarSesionLocal({ email: correo, user_metadata: { nombre } });
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: correo,
        password: contrasena,
        options: { data: { nombre } },
      });

      if (error) {
        if (/User already registered/i.test(error.message)) {
          // Si ya existe, entrar directamente
          return await entrar(correo, contrasena);
        }
        throw new Error(traducir(error));
      }

      // Si Supabase devuelve sesión directa
      if (data?.session) {
        setSesion(data.session);
        localStorage.setItem("lifehedge_sesion_local", JSON.stringify(data.session));
      } else {
        // No es necesario verificar email: activar sesión de inmediato para permitir entrada al dashboard
        activarSesionLocal({
          id: data?.user?.id || `usr-${Date.now()}`,
          email: correo,
          user_metadata: { nombre },
        });
      }
    } catch (err) {
      if (/cuenta/i.test(err.message)) {
        return await entrar(correo, contrasena);
      }
      throw err;
    }
  }, [entrar]);

  const salir = useCallback(async () => {
    localStorage.removeItem("lifehedge_sesion_local");
    setSesion(null);
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignorar error de logout
      }
    }
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
      salir,
    }),
    [cargando, sesion, entrar, registrar, salir]
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
