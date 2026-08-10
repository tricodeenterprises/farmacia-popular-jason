import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import PacientePanel from "@/components/farmacia/PacientePanel";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ClienteProfile() {
  const { id } = useParams<{ id: string }>();
  const { isMaster, user } = useAuth();
  const navigate = useNavigate();
  const [paciente, setPaciente] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [showHardDelete, setShowHardDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [hasDispensacoes, setHasDispensacoes] = useState(false);
  const [senhaMaster, setSenhaMaster] = useState("");
  const [hardDeleting, setHardDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("pacientes")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      setPaciente(data);

      const { count } = await supabase
        .from("dispensacoes")
        .select("id", { count: "exact", head: true })
        .eq("paciente_id", id)
        .eq("cancelada", false);
      setHasDispensacoes((count || 0) > 0);

      setLoading(false);
    };
    fetch();
  }, [id]);

  const handleSoftDelete = async () => {
    if (!paciente) return;
    setDeleting(true);
    const { error } = await supabase
      .from("pacientes")
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .eq("id", paciente.id);
    if (error) { toast.error("Erro ao excluir."); setDeleting(false); return; }
    await supabase.from("logs").insert({
      user_id: user?.id,
      acao: "excluir_cliente",
      detalhes: { paciente_id: paciente.id, nome: paciente.nome },
    });
    toast.success("Cliente excluído (soft delete).");
    setPaciente({ ...paciente, ativo: false });
    setShowDelete(false);
    setDeleting(false);
  };

  const handleReactivate = async () => {
    if (!paciente) return;
    setReactivating(true);
    const { error } = await supabase
      .from("pacientes")
      .update({ ativo: true, updated_at: new Date().toISOString() })
      .eq("id", paciente.id);
    if (error) { toast.error("Erro ao reativar."); setReactivating(false); return; }
    await supabase.from("logs").insert({
      user_id: user?.id,
      acao: "reativar_cliente",
      detalhes: { paciente_id: paciente.id, nome: paciente.nome },
    });
    toast.success("Cliente reativado!");
    setPaciente({ ...paciente, ativo: true });
    setReactivating(false);
  };

  const handleHardDelete = async () => {
    if (!paciente || !senhaMaster.trim()) return;
    setHardDeleting(true);

    // Validate master password from configuracoes
    const { data: configData } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "senha_master_exclusao")
      .single();

    if (!configData || configData.valor !== senhaMaster) {
      toast.error("Senha master incorreta!");
      setHardDeleting(false);
      return;
    }

    // Delete related records first, then the patient
    await supabase.from("dispensacoes").delete().eq("paciente_id", paciente.id);
    await supabase.from("documentos").delete().eq("paciente_id", paciente.id);
    await supabase.from("receitas").delete().eq("paciente_id", paciente.id);
    await supabase.from("ciclos").delete().eq("paciente_id", paciente.id);

    const { error } = await supabase.from("pacientes").delete().eq("id", paciente.id);
    if (error) {
      toast.error("Erro ao excluir permanentemente.");
      setHardDeleting(false);
      return;
    }

    await supabase.from("logs").insert({
      user_id: user?.id,
      acao: "excluir_cliente_permanente",
      detalhes: { paciente_id: paciente.id, nome: paciente.nome, cpf: paciente.cpf },
    });

    toast.success("Cliente excluído permanentemente!");
    setShowHardDelete(false);
    setHardDeleting(false);
    navigate(-1);
  };

  if (loading) {
    return (
      <AppLayout title="Perfil do Cliente">
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AppLayout>
    );
  }

  if (!paciente) {
    return (
      <AppLayout title="Perfil do Cliente">
        <div className="text-center py-20 space-y-4">
          <p className="text-muted-foreground">Cliente não encontrado.</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={paciente.nome}>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="min-h-[44px]">
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <Badge variant={paciente.ativo ? "default" : "destructive"} className="text-xs">
              {paciente.ativo ? "Ativo" : "Inativo"}
            </Badge>
          </div>

          {isMaster && (
            <div className="flex gap-2 w-full sm:w-auto">
              {paciente.ativo ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDelete(true)}
                  className="flex-1 sm:flex-none min-h-[44px]"
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Excluir
                </Button>
              ) : (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleReactivate}
                    disabled={reactivating}
                    className="flex-1 sm:flex-none min-h-[44px]"
                  >
                    <RotateCcw className="w-4 h-4 mr-1" /> {reactivating ? "Reativando..." : "Reativar"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { setSenhaMaster(""); setShowHardDelete(true); }}
                    className="flex-1 sm:flex-none min-h-[44px]"
                  >
                    <AlertTriangle className="w-4 h-4 mr-1" /> Excluir Permanente
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {!paciente.ativo && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center">
            <p className="text-sm text-destructive font-semibold">⚠️ Este cliente está INATIVO. Dispensações não são permitidas.</p>
          </div>
        )}

        <PacientePanel paciente={paciente} />
      </div>

      {/* Soft Delete Confirmation */}
      {showDelete && (
        <Dialog open onOpenChange={() => setShowDelete(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive">Excluir Cliente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold">{paciente.nome}</p>
                <p className="text-sm font-mono">{paciente.cpf}</p>
                {hasDispensacoes && (
                  <p className="text-xs text-muted-foreground mt-2">
                    ℹ️ Este cliente possui dispensações. Os dados históricos serão mantidos.
                  </p>
                )}
                <p className="text-sm text-muted-foreground mt-2">
                  ⚠️ O cliente será desativado e não aparecerá mais nas buscas.
                </p>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowDelete(false)} className="min-h-[44px]">Cancelar</Button>
                <Button variant="destructive" onClick={handleSoftDelete} disabled={deleting} className="min-h-[44px]">
                  {deleting ? "Excluindo..." : "Confirmar Exclusão"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Hard Delete Confirmation */}
      {showHardDelete && (
        <Dialog open onOpenChange={() => setShowHardDelete(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Exclusão Permanente
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold">{paciente.nome}</p>
                <p className="text-sm font-mono">{paciente.cpf}</p>
                <p className="text-sm text-destructive font-semibold mt-2">
                  🚨 ATENÇÃO: Esta ação é IRREVERSÍVEL! Todos os dados do cliente, incluindo dispensações, receitas e documentos serão apagados permanentemente.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Senha Master de Exclusão</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder="Digite a senha master"
                  value={senhaMaster}
                  onChange={(e) => setSenhaMaster(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowHardDelete(false)} className="min-h-[44px]">Cancelar</Button>
                <Button
                  variant="destructive"
                  onClick={handleHardDelete}
                  disabled={hardDeleting || !senhaMaster.trim()}
                  className="min-h-[44px]"
                >
                  {hardDeleting ? "Excluindo..." : "Excluir Permanentemente"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}