import React from 'react';
import { Lock, Sparkles, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export function LoginScreen({ onLogin, error }: { onLogin: (pw: string) => void; error: string }) {
  const [pw, setPw] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(pw);
  };

  return (
    <div className="min-h-screen bg-[#070B14] relative flex items-center justify-center p-4 overflow-hidden selection:bg-indigo-500 selection:text-white font-sans">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/3 w-[450px] h-[450px] bg-blue-600/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-10 right-10 w-72 h-72 bg-purple-600/15 rounded-full blur-[90px] pointer-events-none" />

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293d0f_1px,transparent_1px),linear-gradient(to_bottom,#1f293d0f_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-scale-in">
        <div className="dark-glass-panel rounded-3xl p-8 md:p-10 shadow-2xl shadow-indigo-950/50 border border-white/10 backdrop-blur-2xl">
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <div className="relative w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-600 to-indigo-700 p-0.5 shadow-lg shadow-indigo-500/40 animate-float">
              <div className="w-full h-full bg-[#090D16] rounded-[14px] flex items-center justify-center">
                <img src="/logo-immeit.webp" alt="IMMEIT" className="w-10 h-10 rounded-lg object-cover" />
              </div>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight mb-2 flex items-center justify-center gap-2">
              IMMEIT <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Hub</span>
            </h1>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1.5">
              <ShieldCheck size={14} className="text-indigo-400" />
              Plateforme Interne Sécurisée
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Mot de passe d'accès
              </label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="••••••••••••"
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  autoFocus
                  className="w-full h-11 px-4 text-sm rounded-xl bg-slate-950/60 border border-slate-800 text-white placeholder-slate-500 transition-all duration-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 focus:outline-none"
                />
              </div>
            </div>

            {error && (
              <div className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3.5 py-2.5 text-center animate-slide-down">
                {error}
              </div>
            )}

            <Button type="submit" variant="gradient" size="lg" className="w-full mt-2">
              <Lock size={16} />
              Se connecter
            </Button>
          </form>

          {/* Footer Note */}
          <div className="mt-8 pt-6 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-500 font-medium">
              IMMEIT &copy; {new Date().getFullYear()} &bull; Maintenance &amp; Fiabilité Industrielle
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
