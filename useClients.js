import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

export function useClients({ mes, anio, ejecutivoId = null, ejecutivoNombre = null, isAdmin = true }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ─── Cargar clientes filtrados por mes/año ───
  const fetchClients = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("clientes")
      .select("*")
      .eq("mes_registro", mes)
      .eq("anio_registro", anio)
      .order("id", { ascending: false });

    // Si es ejecutivo, solo sus clientes
    if (!isAdmin && ejecutivoNombre) {
      query = query.eq("ejecutivo", ejecutivoNombre);
    }

    const { data, error: err } = await query;

    if (err) {
      setError(err.message);
      console.error("Error al cargar clientes:", err);
    } else {
      setClients(data || []);
      setError(null);
    }
    setLoading(false);
  }, [mes, anio, ejecutivoNombre, isAdmin]);

  // ─── Cargar al montar y al cambiar filtros ───
  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // ─── Suscripción en tiempo real ───
  useEffect(() => {
    const channel = supabase
      .channel("clientes-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clientes",
          filter: `anio_registro=eq.${anio}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newClient = payload.new;
            if (newClient.mes_registro === mes) {
              setClients((prev) => [newClient, ...prev]);
            }
          } else if (payload.eventType === "UPDATE") {
            setClients((prev) =>
              prev.map((c) => (c.id === payload.new.id ? payload.new : c))
            );
          } else if (payload.eventType === "DELETE") {
            setClients((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mes, anio]);

  // ─── Agregar cliente ───
  const addClient = async (clientData) => {
    const { data, error: err } = await supabase
      .from("clientes")
      .insert({
        ...clientData,
        mes_registro: mes,
        anio_registro: anio,
        fecha_inicio: clientData.fecha_inicio || new Date().toISOString().split("T")[0],
      })
      .select()
      .single();

    if (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
    return { success: true, client: data };
  };

  // ─── Actualizar campo de un cliente ───
  const updateClient = async (clientId, field, value) => {
    const { error: err } = await supabase
      .from("clientes")
      .update({ [field]: value })
      .eq("id", clientId);

    if (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
    return { success: true };
  };

  // ─── Actualizar estatus (con fecha_final si es dispersión) ───
  const updateEstatus = async (clientId, nuevoEstatus, actualizacion = "") => {
    const updates = {
      estatus: nuevoEstatus,
      actualizacion,
    };

    if (nuevoEstatus === "Dispersión" || nuevoEstatus === "Rechazado") {
      updates.fecha_final = new Date().toISOString().split("T")[0];
    }

    const { error: err } = await supabase
      .from("clientes")
      .update(updates)
      .eq("id", clientId);

    if (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
    return { success: true };
  };

  // ─── Eliminar cliente ───
  const deleteClient = async (clientId) => {
    const { error: err } = await supabase
      .from("clientes")
      .delete()
      .eq("id", clientId);

    if (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
    // Actualizar estado local inmediatamente (realtime también lo hará)
    setClients((prev) => prev.filter((c) => c.id !== clientId));
    return { success: true };
  };

  // ─── Stats calculados ───
  const stats = {
    totalClientes: clients.length,
    enPipeline: clients.filter(
      (c) => !["Dispersión", "Rechazado"].includes(c.estatus)
    ).length,
    dispersiones: clients.filter((c) => c.estatus === "Dispersión"),
    // Nómina: suma montos solo de crédito de nómina dispersados
    totalMontoNomina: clients
      .filter(
        (c) => c.producto === "Crédito de nómina" && c.estatus === "Dispersión"
      )
      .reduce((sum, c) => sum + (c.monto || 0), 0),
    // Motos: cuenta UNIDADES (1 por venta), NO suma pesos
    motosVendidas: clients.filter(
      (c) => c.producto !== "Crédito de nómina" && c.estatus === "Dispersión"
    ).length,
  };

  return {
    clients,
    loading,
    error,
    stats,
    addClient,
    updateClient,
    updateEstatus,
    deleteClient,
    refetch: fetchClients,
  };
}
