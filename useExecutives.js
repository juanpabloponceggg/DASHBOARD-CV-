import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

export function useExecutives({ mes, anio }) {
  const [ejecutivos, setEjecutivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEjecutivos = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Traer ejecutivos del mes/año
      const { data: ejData, error: ejErr } = await supabase
        .from("ejecutivos")
        .select("*")
        .eq("mes", mes)
        .eq("anio", anio)
        .order("id");

      if (ejErr) throw ejErr;

      // 2. Traer los ejecutivo_ids que tienen cuenta registrada en perfiles
      const { data: perfilesData, error: pErr } = await supabase
        .from("perfiles")
        .select("ejecutivo_id")
        .not("ejecutivo_id", "is", null);

      if (pErr) throw pErr;

      // 3. Obtener los NOMBRES de los ejecutivos base vinculados a cuentas
      const idsConCuenta = (perfilesData || []).map((p) => p.ejecutivo_id);

      if (idsConCuenta.length === 0) {
        setEjecutivos([]);
        setError(null);
        setLoading(false);
        return;
      }

      const { data: baseEjData, error: baseErr } = await supabase
        .from("ejecutivos")
        .select("nombre")
        .in("id", idsConCuenta);

      if (baseErr) throw baseErr;

      const nombresConCuenta = new Set((baseEjData || []).map((e) => e.nombre));

      // 4. Filtrar ejecutivos del mes actual por NOMBRE (no por id, porque cada mes tiene ids nuevos)
      const filtered = (ejData || []).filter((e) => nombresConCuenta.has(e.nombre));
      setEjecutivos(filtered);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error("Error al cargar ejecutivos:", err);
    }
    setLoading(false);
  }, [mes, anio]);

  useEffect(() => {
    fetchEjecutivos();
  }, [fetchEjecutivos]);

  // ─── Actualizar meta de un ejecutivo ───
  const updateMeta = async (ejecutivoId, newMeta) => {
    const { error: err } = await supabase
      .from("ejecutivos")
      .update({ meta: newMeta })
      .eq("id", ejecutivoId);

    if (err) return { success: false, error: err.message };

    setEjecutivos((prev) =>
      prev.map((e) => (e.id === ejecutivoId ? { ...e, meta: newMeta } : e))
    );
    return { success: true };
  };

  // ─── Copiar metas del mes anterior ───
  const copyFromPreviousMonth = async () => {
    let prevMes = mes - 1;
    let prevAnio = anio;
    if (prevMes < 1) {
      prevMes = 12;
      prevAnio = anio - 1;
    }

    const { data: prevData, error: err } = await supabase
      .from("ejecutivos")
      .select("*")
      .eq("mes", prevMes)
      .eq("anio", prevAnio);

    if (err) return { success: false, error: err.message };
    if (!prevData || prevData.length === 0)
      return { success: false, error: "No hay datos del mes anterior" };

    const newRecords = prevData.map(({ id, ...rest }) => ({
      ...rest,
      mes,
      anio,
    }));

    const { error: insertErr } = await supabase
      .from("ejecutivos")
      .insert(newRecords);

    if (insertErr) return { success: false, error: insertErr.message };

    await fetchEjecutivos();
    return { success: true };
  };

  // ─── Toggle activo/inactivo ───
  const toggleActivo = async (ejecutivoId, activo) => {
    const { error: err } = await supabase
      .from("ejecutivos")
      .update({ activo })
      .eq("id", ejecutivoId);

    if (err) return { success: false, error: err.message };

    setEjecutivos((prev) =>
      prev.map((e) => (e.id === ejecutivoId ? { ...e, activo } : e))
    );
    return { success: true };
  };

  // ─── Separar nómina y motos ───
  const nominaEjecutivos = ejecutivos.filter((e) => e.tipo === "nómina" || e.tipo === "nomina");
  const motosEjecutivos = ejecutivos.filter((e) => e.tipo === "motos");

  return {
    ejecutivos,
    nominaEjecutivos,
    motosEjecutivos,
    loading,
    error,
    updateMeta,
    copyFromPreviousMonth,
    toggleActivo,
    refetch: fetchEjecutivos,
  };
}
