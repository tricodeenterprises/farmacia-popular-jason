@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');



@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 210 28% 97%;
    --foreground: 222 44% 12%;
    --card: 0 0% 100%;
    --card-foreground: 222 44% 12%;
    --popover: 0 0% 100%;
    --popover-foreground: 222 44% 12%;
    --primary: 158 68% 35%;
    --primary-foreground: 0 0% 100%;
    --secondary: 214 26% 93%;
    --secondary-foreground: 222 35% 20%;
    --muted: 214 24% 94%;
    --muted-foreground: 215 15% 42%;
    --accent: 199 90% 92%;
    --accent-foreground: 202 80% 26%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 0 0% 100%;
    --border: 214 20% 87%;
    --input: 214 20% 88%;
    --ring: 158 68% 35%;
    --radius: 1rem;
    --font-body: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --sidebar-background: 0 0% 100%;
    --sidebar-foreground: 222 44% 12%;
    --sidebar-primary: 158 68% 35%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 214 24% 94%;
    --sidebar-accent-foreground: 222 44% 12%;
    --sidebar-border: 214 20% 87%;
    --sidebar-ring: 158 68% 35%;
  }

  * { @apply border-border; }

  body {
    @apply bg-background text-foreground;
    font-family: var(--font-body);
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    background:
      radial-gradient(circle at 12% -10%, hsl(158 68% 35% / 0.13), transparent 28%),
      radial-gradient(circle at 100% 8%, hsl(199 90% 58% / 0.11), transparent 24%),
      linear-gradient(180deg, hsl(210 28% 98%), hsl(214 25% 94%));
    min-height: 100vh;
  }

  input, textarea, [contenteditable="true"] { -webkit-user-select: text; user-select: text; }

  h1, h2, h3, h4, h5, h6 { font-family: var(--font-body); letter-spacing: -0.03em; }
}

@layer utilities {
  .app-shell { min-height: 100vh; background: transparent; }

  .page-wrap { @apply w-full max-w-6xl mx-auto px-3 py-3 sm:px-6 sm:py-5 space-y-3; }

  .compact-header {
    background: hsl(0 0% 100% / 0.88);
    backdrop-filter: blur(18px);
    border: 1px solid hsl(214 20% 87% / 0.85);
    box-shadow: 0 10px 32px hsl(221 45% 16% / 0.08);
  }

  .mobile-bar {
    background: hsl(0 0% 100% / 0.92);
    backdrop-filter: blur(18px);
    border: 1px solid hsl(214 20% 87% / 0.9);
    box-shadow: 0 -12px 34px hsl(221 45% 16% / 0.14);
  }

  .surface-panel {
    background: hsl(0 0% 100% / 0.91);
    backdrop-filter: blur(14px);
    border: 1px solid hsl(214 20% 87% / 0.9);
    box-shadow: 0 16px 38px hsl(221 45% 16% / 0.08);
  }

  .surface-flat { @apply rounded-2xl border bg-white shadow-sm; }

  .hero-compact {
    background:
      radial-gradient(circle at 90% 0%, hsl(199 90% 58% / 0.16), transparent 34%),
      linear-gradient(135deg, hsl(0 0% 100% / 0.96), hsl(156 65% 96% / 0.93));
    border: 1px solid hsl(214 20% 87% / 0.9);
    box-shadow: 0 18px 42px hsl(221 45% 16% / 0.08);
  }

  .action-primary {
    background: linear-gradient(135deg, hsl(158 68% 35%), hsl(170 68% 31%));
    color: white;
    box-shadow: 0 14px 28px hsl(158 68% 35% / 0.25);
  }

  .action-primary:hover { filter: brightness(0.98); }

  .chip { @apply inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold; }

  .status-liberado { background: hsl(151 60% 92%); color: hsl(154 69% 25%); border-color: hsl(151 45% 78%); }
  .status-bloqueado { background: hsl(0 80% 96%); color: hsl(0 65% 42%); border-color: hsl(0 65% 84%); }
  .status-proximo { background: hsl(45 100% 93%); color: hsl(34 84% 33%); border-color: hsl(45 86% 80%); }
  .status-info { background: hsl(201 92% 94%); color: hsl(202 80% 28%); border-color: hsl(201 74% 82%); }

  .list-card { @apply rounded-2xl border bg-white p-3 shadow-sm; }

  .pressable { transition: transform .16s ease, box-shadow .16s ease, background .16s ease; }
  .pressable:active { transform: scale(.985); }
  @media (hover:hover) { .pressable:hover { transform: translateY(-2px); box-shadow: 0 14px 30px hsl(221 45% 16% / 0.1); } }

  .mini-field { @apply rounded-xl bg-muted/70 px-3 py-2; }
  .mini-label { @apply text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold; }
  .mini-value { @apply text-sm font-extrabold text-foreground mt-0.5; }

  .safe-area-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }

  .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  .hide-scrollbar::-webkit-scrollbar { display: none; }

  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: hsl(214 18% 76%); border-radius: 999px; }
}
