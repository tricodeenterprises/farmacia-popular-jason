import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface GaleriaItem {
  id: string;
  arquivo_url: string;
  created_at: string;
}

const MAX_PHOTOS = 10;

export function useGaleria(pacienteId: string) {
  const { user } = useAuth();
  const [fotos, setFotos] = useState<GaleriaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFotos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("galeria_temp")
      .select("id, arquivo_url, created_at")
      .eq("paciente_id", pacienteId)
      .order("created_at", { ascending: false });
    setFotos(data || []);
    setLoading(false);
  }, [pacienteId]);

  useEffect(() => {
    fetchFotos();
  }, [fetchFotos]);

  const addFoto = useCallback(async (file: File): Promise<boolean> => {
    if (fotos.length >= MAX_PHOTOS) return false;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `pacientes/${pacienteId}/galeria_temp/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("documentos").upload(path, file);
    if (upErr) { console.error("Upload galeria error:", upErr); return false; }
    const { data: urlData } = supabase.storage.from("documentos").getPublicUrl(path);
    const { error: dbErr } = await supabase.from("galeria_temp").insert({
      paciente_id: pacienteId,
      arquivo_url: urlData.publicUrl,
      uploaded_by: user?.id,
    });
    if (dbErr) { console.error("DB galeria error:", dbErr); return false; }
    await fetchFotos();
    return true;
  }, [pacienteId, user?.id, fotos.length, fetchFotos]);

  const removeFoto = useCallback(async (id: string) => {
    await supabase.from("galeria_temp").delete().eq("id", id);
    setFotos(prev => prev.filter(f => f.id !== id));
  }, []);

  const limparGaleria = useCallback(async () => {
    await supabase.from("galeria_temp").delete().eq("paciente_id", pacienteId);
    setFotos([]);
  }, [pacienteId]);

  return {
    fotos,
    loading,
    canAdd: fotos.length < MAX_PHOTOS,
    count: fotos.length,
    maxPhotos: MAX_PHOTOS,
    addFoto,
    removeFoto,
    limparGaleria,
    refresh: fetchFotos,
  };
}
