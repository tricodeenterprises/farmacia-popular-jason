import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Users, Edit2, Key, Shield } from "lucide-react";
import AppLayout from "@/components/AppLayout";

export default function GerenciarUsuarios() {
  const { isMaster, user } = useAuth();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [senha, setSenha] = useState("");
  const [role, setRole] = useState<"operador" | "master" | "chefe">("operador");
  const [creating, setCreating] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [editNome, setEditNome] = useState("");
  const [editRole, setEditRole] = useState<"operador" | "master" | "chefe">("operador");
  const [editSenha, setEditSenha] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const fetchUsuarios = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles").select("*").order("created_at", { ascending: false });
    if (profiles && profiles.length > 0) {
      const { data: allRoles } = await supabase.from("user_roles").select("user_id, role");
      const rolesMap: Record<string, string> = {};
      (allRoles || []).forEach((r: any) => { rolesMap[r.user_id] = r.role; });
      setUsuarios(profiles.map((p: any) => ({ ...p, actualRole: rolesMap[p.id] || "operador" })));
    } else {
      setUsuarios([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsuarios(); }, []);

  if (!isMaster) {
    return (
      <AppLayout title="Usuários">
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Acesso restrito ao administrador.</p>
        </div>
      </AppLayout>
    );
  }

  const handleCreate = async () => {
    if (!username.trim()) { toast.error("Nome de usuário obrigatório."); return; }
    if (senha.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres."); return; }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { username: username.trim(), password: senha, role },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); setCreating(false); return; }
      toast.success(`Usuário ${username} criado!`);
      setUsername(""); setSenha(""); setRole("operador");
      await supabase.from("logs").insert({ user_id: user?.id, acao: "criar_usuario", detalhes: { username: username.trim(), role } });
      fetchUsuarios();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Falha"));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (u: any) => {
    setEditUser(u);
    setEditNome(u.nome);
    setEditRole(u.actualRole as any);
    setEditSenha("");
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    setEditSaving(true);
    try {
      if (editNome.trim() !== editUser.nome) {
        await supabase.from("profiles").update({ nome: editNome.trim() }).eq("id", editUser.id);
      }
      if (editUser.id !== user?.id && editRole !== editUser.actualRole) {
        await supabase.from("user_roles").update({ role: editRole }).eq("user_id", editUser.id);
      }
      if (editSenha.length > 0) {
        if (editSenha.length < 6) { toast.error("Senha mínima 6 caracteres."); setEditSaving(false); return; }
        const { data, error } = await supabase.functions.invoke("create-user", {
          body: { action: "reset-password", userId: editUser.id, password: editSenha },
        });
        if (error || data?.error) { toast.error("Erro ao alterar senha."); setEditSaving(false); return; }
      }
      await supabase.from("logs").insert({
        user_id: user?.id, acao: "editar_usuario",
        detalhes: { target_user: editUser.id, nome: editNome, role: editRole, senha_alterada: editSenha.length > 0 },
      });
      toast.success("Usuário atualizado!");
      setEditUser(null);
      fetchUsuarios();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Falha"));
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <AppLayout title="Gerenciar Usuários">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Novo Usuário
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nome de Usuário *</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Nome de usuário" autoComplete="off" className="min-h-[44px]" />
            </div>
            <div className="space-y-2">
              <Label>Senha *</Label>
              <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" className="min-h-[44px]" />
            </div>
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                 <SelectContent>
                   <SelectItem value="operador">Operador</SelectItem>
                   <SelectItem value="inspetor">Inspetor</SelectItem>
                   <SelectItem value="chefe">Chefe</SelectItem>
                   <SelectItem value="master">Administrador (Master)</SelectItem>
                 </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={creating} className="w-full min-h-[44px]">
              {creating ? "Criando..." : "Criar Usuário"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Usuários Cadastrados</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-center py-4">Carregando...</p>
            ) : usuarios.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Nenhum usuário encontrado.</p>
            ) : (
              <div className="space-y-2">
                {usuarios.map((u) => (
                  <div key={u.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-lg bg-muted/50 gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{u.nome}</p>
                      {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                       <Badge variant={u.actualRole === "master" ? "default" : u.actualRole === "chefe" || u.actualRole === "inspetor" ? "outline" : "secondary"}>
                         {u.actualRole === "master" ? "Admin" : u.actualRole === "chefe" ? "Chefe" : u.actualRole === "inspetor" ? "Inspetor" : "Operador"}
                      </Badge>
                      <Badge variant={u.ativo ? "outline" : "destructive"}>
                        {u.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                      {u.id === user?.id && <Badge variant="outline">Você</Badge>}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)} className="min-h-[44px]">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {editUser && (
        <Dialog open onOpenChange={() => setEditUser(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} autoComplete="off" className="min-h-[44px]" />
                {editUser.id === user?.id && <p className="text-xs text-muted-foreground">Você pode alterar sua própria senha aqui; o perfil permanece travado por segurança.</p>}
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Shield className="w-4 h-4" /> Perfil</Label>
                <Select value={editRole} onValueChange={(v) => setEditRole(v as any)} disabled={editUser.id === user?.id}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="operador">Operador</SelectItem>
                     <SelectItem value="inspetor">Inspetor</SelectItem>
                     <SelectItem value="chefe">Chefe</SelectItem>
                     <SelectItem value="master">Administrador (Master)</SelectItem>
                   </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Key className="w-4 h-4" /> Nova Senha (vazio = manter)</Label>
                <Input type="password" value={editSenha} onChange={(e) => setEditSenha(e.target.value)} placeholder="Nova senha..." autoComplete="new-password" className="min-h-[44px]" />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setEditUser(null)} className="min-h-[44px]">Cancelar</Button>
                <Button onClick={handleEditSave} disabled={editSaving} className="min-h-[44px]">
                  {editSaving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
