import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { MessageSquarePlus, Send, Loader2 } from "lucide-react";

export default function FeedbackButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState("sugestao");
  const [mensagem, setMensagem] = useState("");
  const [tela, setTela] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!mensagem.trim()) { toast.error("Escreva uma mensagem."); return; }
    setSending(true);
    const { error } = await supabase.from("sugestoes").insert({
      user_id: user?.id,
      tipo,
      mensagem: mensagem.trim(),
      tela: tela.trim() || null,
    });
    if (error) { toast.error("Erro ao enviar. Tente novamente."); setSending(false); return; }
    toast.success("Obrigado pelo feedback! 🎉");
    setOpen(false);
    setMensagem("");
    setTela("");
    setSending(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="rounded-xl w-10 h-10 text-muted-foreground hover:text-primary hover:bg-primary/10"
        title="Enviar sugestão ou reportar erro"
      >
        <MessageSquarePlus className="w-5 h-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="w-5 h-5 text-primary" />
              Sugestão ou Erro
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sugestao">💡 Sugestão / Melhoria</SelectItem>
                  <SelectItem value="erro">🐛 Erro / Bug</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tela (opcional)</Label>
              <Select value={tela} onValueChange={setTela}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecione a tela" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dashboard">Dashboard / Busca</SelectItem>
                  <SelectItem value="paciente">Painel do Paciente</SelectItem>
                  <SelectItem value="dispensacao">Dispensação</SelectItem>
                  <SelectItem value="clientes">Gerenciar Clientes</SelectItem>
                  <SelectItem value="configuracoes">Configurações</SelectItem>
                  <SelectItem value="outra">Outra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mensagem *</Label>
              <Textarea
                placeholder="Descreva sua sugestão ou o erro encontrado..."
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                className="min-h-[100px] rounded-xl"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={sending || !mensagem.trim()} className="rounded-xl">
                {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                Enviar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
