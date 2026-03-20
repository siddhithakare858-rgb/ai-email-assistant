import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchStatus, fetchLogs, processEmails, fetchHealth, type LogEntry } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { LightningLogo } from "@/components/LightningLogo";
import { Mail, FileText, Clock, Zap, Send, RefreshCw, LogOut, ChevronRight, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

const ACTION_STYLES: Record<string, { bg: string; text: string }> = {
  SCHEDULED: { bg: "bg-accent/10", text: "text-accent" },
  SUMMARIZED: { bg: "bg-primary/10", text: "text-primary" },
  IGNORED: { bg: "bg-muted", text: "text-muted-foreground" },
  ERROR: { bg: "bg-destructive/10", text: "text-destructive" },
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function useUptime() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const connectedEmail = localStorage.getItem("mailmind_email") || "";
  const uptime = useUptime();

  const [messageId, setMessageId] = useState("");
  const [processResult, setProcessResult] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [processing, setProcessing] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    if (!connectedEmail) navigate("/");
  }, [connectedEmail, navigate]);

  const { data: status, isError: isStatusError, isFetching: isStatusFetching } = useQuery({
    queryKey: ["status"],
    queryFn: fetchStatus,
    refetchInterval: 30000,
    retry: 1,
    onError: (err: any) => {
      toast({
        title: "Unable to fetch status",
        description: err?.message || "Please check your network",
        variant: "destructive",
      });
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["logs"],
    queryFn: fetchLogs,
    refetchInterval: 15000,
    retry: 1,
    onError: (err: any) => {
      toast({
        title: "Unable to fetch activity log",
        description: err?.message || "Please check your network",
        variant: "destructive",
      });
    },
  });

  const { data: health, isError: isHealthError } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 15000,
    retry: 1,
    onError: (err: any) => {
      toast({
        title: "Health check failed",
        description: err?.message || "Could not reach API",
        variant: "destructive",
      });
    },
  });

  const handleProcess = useCallback(async () => {
    if (!messageId.trim()) return;
    setProcessing(true);
    setProcessResult(null);
    try {
      const res = await processEmails({ message_ids: [messageId.trim()], organizer_email: connectedEmail });
      const msg = JSON.stringify(res, null, 2);
      setProcessResult({ type: "success", msg });
      toast({
        title: "Email processed",
        description: "The message has been sent for processing.",
      });
      setMessageId("");
      queryClient.invalidateQueries({ queryKey: ["logs"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
    } catch (err: any) {
      const message = err?.message || "Something went wrong";
      setProcessResult({ type: "error", msg: message });
      toast({
        title: "Process failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  }, [messageId, connectedEmail, queryClient, toast]);

  const handleSwitch = () => {
    localStorage.removeItem("mailmind_email");
    navigate("/");
  };

  const stats = [
    { icon: Mail, label: "Emails Processed Today", value: status?.emails_processed_today ?? "—" },
    { icon: FileText, label: "Last Email Subject", value: status?.last_email_subject || "No emails yet" },
    { icon: Clock, label: "Agent Uptime", value: uptime },
  ];

  const isAgentActive = Boolean(health?.status === "ok" && health?.gmail_connected && health?.polling_active);
  const healthStatusText = isAgentActive ? "Agent Active" : "Agent Offline";

  const timeSince = (ts?: string) => {
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    } catch {
      return ts;
    }
  };

  const steps = [
    { num: 1, title: "Email Received", desc: "Someone emails asking to meet" },
    { num: 2, title: "AI Parses Intent", desc: "Reads and extracts availability" },
    { num: 3, title: "Meeting Booked", desc: "Calendar invite sent automatically" },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="glass-card sticky top-0 z-50 border-t-0 border-x-0 rounded-none">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LightningLogo size={18} />
            <span className="font-semibold text-foreground text-sm">MailMind AI</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 glass-card px-3 py-1.5 rounded-full text-xs">
              <span className={`w-2 h-2 rounded-full pulse-dot ${isAgentActive ? "bg-accent" : "bg-destructive"}`} />
              {healthStatusText}
            </div>
            <div className="hidden sm:flex flex-col text-right text-xs text-muted-foreground">
              <span className="truncate max-w-[220px]">{connectedEmail || "No account"}</span>
              <span>Last checked: {status?.last_checked ? formatTime(status.last_checked) : "…"}</span>
            </div>
            <button onClick={handleSwitch} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <LogOut size={12} /> Switch
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((s, i) => (
            <div key={s.label} className={`glass-card rounded-xl p-5 animate-fade-up`} style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-3">
                <s.icon size={14} className="text-primary" />
                {s.label}
              </div>
              <p className="text-xl font-semibold text-foreground truncate tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Health & Sync */}
        <section className="animate-fade-up" style={{ animationDelay: "245ms" }}>
          <div className="glass-card rounded-xl p-4 border border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-xs text-muted-foreground">API health: <span className={isAgentActive ? "text-accent" : "text-destructive"}>{healthStatusText}</span></p>
              <p className="text-xs text-muted-foreground">Last API sync: <span className="text-foreground">{timeSince(health?.timestamp)}</span></p>
            </div>
            {!isAgentActive && (
              <p className="mt-2 text-xs text-destructive/80">Your agent is currently offline. The assistant will resume as soon as connection is restored.</p>
            )}
          </div>
        </section>

        {/* How It Works */}
        <section className="animate-fade-up" style={{ animationDelay: "250ms" }}>
          <h2 className="text-sm font-medium text-muted-foreground mb-4">How It Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {steps.map((step, i) => (
              <div key={step.num} className="glass-card rounded-xl p-5 flex items-start gap-4">
                <div className="gradient-primary w-8 h-8 rounded-lg flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
                  {step.num}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{step.desc}</p>
                </div>
                {i < steps.length - 1 && <ChevronRight size={14} className="text-muted-foreground hidden sm:block ml-auto shrink-0 mt-1" />}
              </div>
            ))}
          </div>
        </section>

        {/* Activity Feed */}
        <section className="animate-fade-up" style={{ animationDelay: "350ms" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-muted-foreground">Live Activity Feed</h2>
            <button
              onClick={() => { queryClient.invalidateQueries({ queryKey: ["logs"] }); queryClient.invalidateQueries({ queryKey: ["status"] }); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          <div className="glass-card rounded-xl divide-y divide-border overflow-hidden">
            {!isAgentActive && (
              <div className="p-4 text-center bg-[#221f2f] border-b border-border">
                <p className="text-xs text-destructive">Agent is offline, attempting reconnect... (Waiting for /health success)</p>
              </div>
            )}

            {!logs || logs.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-3 h-3 rounded-full bg-primary/40 mx-auto mb-3 pulse-dot" />
                <p className="text-sm text-muted-foreground">Agent is monitoring your inbox...</p>
              </div>
            ) : (
              logs.slice(0, 15).map((entry: LogEntry, i: number) => {
                const style = ACTION_STYLES[entry.action_taken?.toUpperCase()] || ACTION_STYLES.IGNORED;
                return (
                  <div key={entry.message_id + i} className="flex items-center gap-3 px-5 py-3 animate-slide-in-top" style={{ animationDelay: `${i * 40}ms` }}>
                    <span className="text-xs text-muted-foreground tabular-nums w-14 shrink-0">{formatTime(entry.processed_at)}</span>
                    <span className="text-sm text-foreground truncate flex-1">{entry.subject || "—"}</span>
                    <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                      {entry.action_taken}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Manual Trigger */}
        <section className="animate-fade-up" style={{ animationDelay: "450ms" }}>
          <h2 className="text-sm font-medium text-muted-foreground mb-4">Manual Trigger</h2>
          <div className="glass-card rounded-xl p-5">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={messageId}
                onChange={(e) => setMessageId(e.target.value)}
                placeholder="Enter Gmail Message ID"
                className="flex-1 h-10 px-4 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow text-sm"
              />
              <button
                onClick={handleProcess}
                disabled={processing || !messageId.trim()}
                className="h-10 px-5 rounded-lg gradient-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50"
              >
                {processing ? <Loader2 size={14} className="animate-spin" /> : <><Send size={14} /> Process Now</>}
              </button>
            </div>
            {processResult && (
              <div className={`mt-3 flex items-start gap-2 p-3 rounded-lg text-sm ${processResult.type === "success" ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
                {processResult.type === "success" ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
                <pre className="whitespace-pre-wrap text-xs break-all">{processResult.msg}</pre>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
