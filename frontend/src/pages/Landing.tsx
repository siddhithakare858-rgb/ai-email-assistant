import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LightningLogo } from "@/components/LightningLogo";
import { ParticleBackground } from "@/components/ParticleBackground";
import { Mail, Calendar, Clock, ArrowRight, Loader2 } from "lucide-react";

const features = [
  { icon: Mail, label: "Reads your Gmail" },
  { icon: Clock, label: "Finds free slots" },
  { icon: Calendar, label: "Books meetings" },
];

export default function Landing() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleActivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setLoading(true);
    setTimeout(() => {
      localStorage.setItem("mailmind_email", email);
      navigate("/dashboard");
    }, 800);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <ParticleBackground />
      {/* Gradient orb - intentional decorative bg */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, #6c63ff 0%, transparent 70%)" }} />

      <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
        <div className="animate-fade-up">
          <LightningLogo size={36} className="mx-auto mb-8" />
        </div>

        <h1 className="animate-fade-up-delay-1 text-5xl sm:text-6xl font-bold tracking-tight text-foreground leading-[1.05]">
          Meet <span className="gradient-text">MailMind AI</span>
        </h1>

        <p className="animate-fade-up-delay-2 mt-6 text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed" style={{ textWrap: "balance" }}>
          Your autonomous AI assistant that reads emails, finds availability, and schedules meetings — automatically.
        </p>

        <div className="animate-fade-up-delay-3 flex flex-wrap items-center justify-center gap-3 mt-8">
          {features.map((f) => (
            <div key={f.label} className="glass-card flex items-center gap-2 px-4 py-2 rounded-full text-sm text-muted-foreground">
              <f.icon size={14} className="text-primary" />
              {f.label}
            </div>
          ))}
        </div>

        <form onSubmit={handleActivate} className="animate-fade-up-delay-4 mt-10 flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your Gmail address to get started"
            required
            className="flex-1 h-12 px-4 rounded-lg bg-secondary border border-border text-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="h-12 px-6 rounded-lg gradient-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <>Activate My Assistant <ArrowRight size={16} /></>}
          </button>
        </form>

        <p className="animate-fade-up-delay-5 mt-4 text-xs text-muted-foreground">
          No setup needed. Already running.
        </p>
      </div>
    </div>
  );
}
