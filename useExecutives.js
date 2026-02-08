import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

export function useExecutives({ mes, anio }) {
  const [ejecutivos, setEjecutivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEjecutivos = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("ejecutivos")
      .select("*")
      .eq("mes", mes)
      .eq("anio", anio)
      .order("id");

    if (err) {
      setError(err.message);
      console.error("Error al cargar ejecutivos:", err);
    } else {
      setEjecutivos(data || []);
      setError(null);
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

    // Insertar registros con el nuevo mes/año
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
