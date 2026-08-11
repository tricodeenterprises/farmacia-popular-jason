import { useState, useEffect, useCallback } from "react";
import { X, Download, Share, MoreVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "desktop" | "unknown";

function detectPlatform(): Platform {
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows|Macintosh|Linux/.test(ua) && !/Mobile/.test(ua)) return "desktop";
  return "unknown";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [installReady, setInstallReady] = useState(false);

  useEffect(() => {
    const plat = detectPlatform();
    console.log("[PWA] Platform:", plat);
    setPlatform(plat);

    if (isStandalone()) {
      console.log("[PWA] Already standalone.");
      return;
    }

    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed && Date.now() - parseInt(dismissed, 10) < 7 * 24 * 60 * 60 * 1000) {
      console.log("[PWA] Recently dismissed.");
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      console.log("[PWA] beforeinstallprompt captured! Install ready.");
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setInstallReady(true);
      // Show our popup after 2s
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // For platforms without beforeinstallprompt (iOS), show manual after 3s
    const fallback = setTimeout(() => {
      setShowPrompt((prev) => {
        if (!prev) {
          console.log("[PWA] No native prompt available, showing manual UI.");
          return true;
        }
        return prev;
      });
    }, 3000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(fallback);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      console.log("[PWA] Triggering native install...");
      try {
        await deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;
        console.log("[PWA] User choice:", result.outcome);
        if (result.outcome === "accepted") {
          setShowPrompt(false);
        }
      } catch (err) {
        console.log("[PWA] Prompt error:", err);
      }
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const handleDismiss = () => {
    console.log("[PWA] User dismissed install prompt");
    localStorage.setItem("pwa-install-dismissed", Date.now().toString());
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-[hsl(0,70%,45%)] to-[hsl(0,70%,35%)] p-6 text-center">
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-white/70 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src="/logo-sistema.png"
            alt="sistema"
            className="w-20 h-20 rounded-2xl mx-auto mb-3 shadow-lg border-2 border-white/20"
          />
          <h2 className="text-xl font-bold text-white font-[var(--font-display)]">
            Sistema
          </h2>
          <p className="text-white/80 text-sm mt-1">
            Instale nosso app para acesso rápido!
          </p>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {installReady ? (
            <>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Download className="h-4 w-4 text-primary" />
                  </div>
                  <span>Acesse direto da tela inicial</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary text-xs font-bold">⚡</span>
                  </div>
                  <span>Mais rápido e sem precisar do navegador</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary text-xs font-bold">📱</span>
                  </div>
                  <span>Funciona como um app nativo</span>
                </div>
              </div>
              <Button onClick={handleInstall} className="w-full h-12 text-base font-semibold rounded-xl">
                <Download className="h-5 w-5 mr-2" />
                Instalar Aplicativo
              </Button>
            </>
          ) : (
            <ManualInstructions platform={platform} />
          )}

          <button
            onClick={handleDismiss}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualInstructions({ platform }: { platform: Platform }) {
  if (platform === "ios") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Como instalar no iPhone/iPad:</p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">1</span>
            <span>Toque no ícone <Share className="inline h-4 w-4 text-primary" /> (Compartilhar) na barra inferior do Safari</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">2</span>
            <span>Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong> <Plus className="inline h-4 w-4 text-primary" /></span>
          </div>
          <div className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">3</span>
            <span>Toque em <strong>"Adicionar"</strong> no canto superior direito</span>
          </div>
        </div>
      </div>
    );
  }

  if (platform === "android") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Como instalar no Android:</p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">1</span>
            <span>Toque no ícone <MoreVertical className="inline h-4 w-4 text-primary" /> (menu) no canto superior do Chrome</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">2</span>
            <span>Toque em <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong></span>
          </div>
          <div className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">3</span>
            <span>Confirme tocando em <strong>"Instalar"</strong></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">Como instalar no computador:</p>
      <div className="space-y-2 text-sm text-muted-foreground">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">1</span>
          <span>Clique no ícone <Download className="inline h-4 w-4 text-primary" /> na barra de endereço do navegador</span>
        </div>
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">2</span>
          <span>Clique em <strong>"Instalar"</strong> na janela que aparecer</span>
        </div>
      </div>
    </div>
  );
}
