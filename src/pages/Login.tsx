import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import logoFarmacia from "@/assets/logo-sistema.png";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LogIn, Zap } from "lucide-react";

export default function Login() {
  const { signIn, effectiveRole, user, profileReady } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // After auth AND profile loaded, redirect based on role
  useEffect(() => {
    if (user && profileReady) {
      if ((effectiveRole as string) === "chefe" || (effectiveRole as string) === "inspetor") {
        navigate("/admin/auditoria", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    }
  }, [user, profileReady, effectiveRole]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim()) { setError("Nome de usuário obrigatório."); return; }
    if (password.length < 4) { setError("Senha deve ter pelo menos 4 caracteres."); return; }

    setLoading(true);
    const email = `${username.trim().toLowerCase().replace(/\s+/g, "_")}@farmacia.local`;
    const { error } = await signIn(email, password);
    if (error) {
      setError("Usuário ou senha incorretos.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0 bg-grid opacity-50" />
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px]"
        style={{
          background: "radial-gradient(ellipse, hsl(260 70% 55% / 0.06) 0%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 w-[400px] h-[300px]"
        style={{
          background: "radial-gradient(ellipse, hsl(200 80% 50% / 0.04) 0%, transparent 70%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="neon-border overflow-hidden shadow-lg">
          {/* Top accent line */}
          <div
            className="h-1 w-full"
            style={{ background: "linear-gradient(90deg, hsl(260 70% 55%), hsl(200 80% 50%), hsl(260 70% 55%))" }}
          />

          <CardHeader className="text-center space-y-4 pb-2">
            <motion.div
              className="mx-auto w-20 h-20 rounded-2xl overflow-hidden"
              style={{
                boxShadow: "0 4px 20px hsl(42 85% 50% / 0.15)",
                border: "2px solid hsl(42 85% 50% / 0.25)",
              }}
              whileHover={{ scale: 1.05, rotate: 2 }}
            >
              <img src={logoFarmacia} alt="sistema" className="w-full h-full object-cover" />
            </motion.div>
            <div>
              <CardTitle className="text-2xl text-gradient">Sistema</CardTitle>
              <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-primary" />
                Sistema
              </p>
            </div>
          </CardHeader>

          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Nome de Usuário
                </Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Digite seu nome de usuário"
                  autoComplete="off"
                  required
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Senha
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  className="min-h-[44px]"
                />
              </div>
              {error && (
                <motion.p
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2"
                >
                  {error}
                </motion.p>
              )}
              <Button type="submit" className="w-full min-h-[48px] text-base" disabled={loading} size="lg">
                <LogIn className="w-5 h-5 mr-2" />
                {loading ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
