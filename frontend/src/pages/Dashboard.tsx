import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  fetchStatus, 
  fetchLogs, 
  processEmails, 
  fetchHealth, 
  fetchStats, 
  fetchRecentEmails, 
  fetchCalendarEvents,
  type LogEntry,
  type CalendarEvent 
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { LightningLogo } from "@/components/LightningLogo";
import { 
  Mail, 
  FileText, 
  Clock, 
  Zap, 
  Send, 
  RefreshCw, 
  LogOut, 
  ChevronRight, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Inbox, 
  Calendar as CalendarIcon,
  Activity,
  User,
  ShieldCheck
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

const ACTION_STYLES: Record<string, { bg: string; text: string }> = {
  scheduling: { bg: "bg-blue-500/10", text: "text-blue-500" },
  update: { bg: "bg-green-500/10", text: "text-green-500" },
  ignored: { bg: "bg-gray-500/10", text: "text-gray-500" },
  error: { bg: "bg-red-500/10", text: "text-red-500" },
};

function formatTime(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const connectedEmail = localStorage.getItem("mailmind_email") || "";

  const [messageId, setMessageId] = useState("");
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!connectedEmail) navigate("/");
  }, [connectedEmail, navigate]);

  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: fetchStatus,
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
    refetchInterval: 15000,
  });

  const { data: recentEmails } = useQuery({
    queryKey: ["recentEmails"],
    queryFn: fetchRecentEmails,
    refetchInterval: 15000,
  });

  const { data: calendarEvents } = useQuery({
    queryKey: ["calendarEvents"],
    queryFn: fetchCalendarEvents,
    refetchInterval: 60000,
  });

  const { data: logs } = useQuery({
    queryKey: ["logs"],
    queryFn: fetchLogs,
    refetchInterval: 15000,
  });

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 15000,
  });

  const handleProcess = useCallback(async () => {
    if (!messageId.trim()) return;
    setProcessing(true);
    try {
      await processEmails({ message_ids: [messageId.trim()], organizer_email: connectedEmail });
      toast({
        title: "Email processed",
        description: "The message has been sent for processing.",
      });
      setMessageId("");
      queryClient.invalidateQueries({ queryKey: ["logs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["recentEmails"] });
    } catch (err: any) {
      toast({
        title: "Process failed",
        description: err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  }, [messageId, connectedEmail, queryClient, toast]);

  const handleLogout = () => {
    localStorage.removeItem("mailmind_email");
    navigate("/");
  };

  const isAgentActive = Boolean(health?.status === "ok" && health?.gmail_connected && health?.polling_active);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navigation */}
      <header className="border-b bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <LightningLogo size={20} />
            </div>
            <span className="font-bold text-lg tracking-tight">MailMind AI</span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/50 border text-xs font-medium">
              <span className={`w-2 h-2 rounded-full ${isAgentActive ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
              {isAgentActive ? "System Online" : "System Offline"}
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden lg:flex flex-col items-end">
                <span className="text-xs font-semibold">{connectedEmail}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Connected Account</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card border-none shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2 space-y-0">
              <CardDescription className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-2">
                <Inbox className="h-3 w-3 text-blue-500" /> Total Received
              </CardDescription>
              <CardTitle className="text-3xl font-bold tabular-nums">{stats?.total_received ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          
          <Card className="bg-card border-none shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2 space-y-0">
              <CardDescription className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-2">
                <Send className="h-3 w-3 text-green-500" /> AI Responses
              </CardDescription>
              <CardTitle className="text-3xl font-bold tabular-nums">{stats?.total_sent ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          
          <Card className="bg-card border-none shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2 space-y-0">
              <CardDescription className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-2">
                <Mail className="h-3 w-3 text-orange-500" /> Unread Count
              </CardDescription>
              <CardTitle className="text-3xl font-bold tabular-nums">{stats?.unread_count ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          
          <Card className="bg-card border-none shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2 space-y-0">
              <CardDescription className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-2">
                <Clock className="h-3 w-3 text-purple-500" /> Last Active
              </CardDescription>
              <CardTitle className="text-lg font-semibold pt-1">
                {status?.last_checked ? formatTime(status.last_checked) : "Just now"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Column - Inbox & Activity */}
          <div className="lg:col-span-2 space-y-8">
            <Tabs defaultValue="inbox" className="w-full">
              <div className="flex items-center justify-between mb-4">
                <TabsList className="bg-secondary/50">
                  <TabsTrigger value="inbox" className="text-xs">Inbox Activity</TabsTrigger>
                  <TabsTrigger value="logs" className="text-xs">System Logs</TabsTrigger>
                </TabsList>
                <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries()} className="text-xs h-8">
                  <RefreshCw className="h-3 w-3 mr-2" /> Refresh
                </Button>
              </div>

              <TabsContent value="inbox" className="mt-0">
                <Card className="border-none shadow-sm overflow-hidden">
                  <ScrollArea className="h-[500px]">
                    <div className="divide-y">
                      {!recentEmails || recentEmails.length === 0 ? (
                        <div className="p-20 text-center text-muted-foreground">
                          <Inbox className="h-10 w-10 mx-auto mb-4 opacity-20" />
                          <p>No recent email activity detected.</p>
                        </div>
                      ) : (
                        recentEmails.map((email, i) => (
                          <div key={email.message_id + i} className="p-4 hover:bg-secondary/20 transition-colors flex items-start gap-4">
                            <div className={`mt-1 p-2 rounded-full ${ACTION_STYLES[email.action_taken]?.bg || "bg-secondary"}`}>
                              {email.action_taken === 'scheduling' ? <CalendarIcon className="h-4 w-4 text-blue-500" /> : 
                               email.action_taken === 'update' ? <Zap className="h-4 w-4 text-green-500" /> : 
                               <Mail className="h-4 w-4 text-gray-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <h4 className="text-sm font-semibold truncate">{email.subject || "No Subject"}</h4>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDate(email.processed_at)} {formatTime(email.processed_at)}</span>
                              </div>
                              <p className="text-xs text-muted-foreground truncate mb-2">Message ID: {email.message_id}</p>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={`text-[10px] py-0 px-2 font-normal ${ACTION_STYLES[email.action_taken]?.text}`}>
                                  {email.action_taken}
                                </Badge>
                                <Badge variant="secondary" className="text-[10px] py-0 px-2 font-normal">
                                  {email.status}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </Card>
              </TabsContent>

              <TabsContent value="logs" className="mt-0">
                <Card className="border-none shadow-sm overflow-hidden">
                  <ScrollArea className="h-[500px]">
                    <div className="p-4 space-y-4">
                      {logs?.map((log, i) => (
                        <div key={i} className="flex gap-4 text-xs">
                          <span className="text-muted-foreground whitespace-nowrap">{formatTime(log.processed_at)}</span>
                          <div className="space-y-1">
                            <p className="font-medium">[{log.action_taken}] {log.subject}</p>
                            <p className="text-muted-foreground">{log.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - Calendar & AI Status */}
          <div className="space-y-8">
            {/* Calendar Card */}
            <Card className="border-none shadow-sm overflow-hidden">
              <CardHeader className="bg-primary/5 pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-primary" /> Upcoming Events
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px]">{calendarEvents?.length ?? 0} Events</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[300px]">
                  <div className="divide-y">
                    {!calendarEvents || calendarEvents.length === 0 ? (
                      <div className="p-12 text-center text-muted-foreground text-xs">
                        No upcoming events found.
                      </div>
                    ) : (
                      calendarEvents.map((event) => (
                        <a 
                          key={event.id} 
                          href={event.htmlLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="block p-4 hover:bg-secondary/20 transition-colors"
                        >
                          <h4 className="text-sm font-medium mb-1 truncate">{event.summary}</h4>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDate(event.start.dateTime)} • {formatTime(event.start.dateTime)}
                          </div>
                        </a>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* AI Action Panel */}
            <Card className="border-none shadow-sm bg-gradient-to-br from-card to-secondary/30">
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-accent" /> AI Action Panel
                </CardTitle>
                <CardDescription className="text-[10px]">Current agent intelligence status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Email Polling</span>
                    <Badge variant={isAgentActive ? "default" : "destructive"} className="text-[10px] py-0">
                      {isAgentActive ? "Running" : "Stopped"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Pattern Recognition</span>
                    <span className="font-medium">Active</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Auto-Response</span>
                    <span className="font-medium">Enabled</span>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-3">
                  <h5 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Manual Trigger</h5>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Message ID" 
                      value={messageId}
                      onChange={(e) => setMessageId(e.target.value)}
                      className="h-8 text-xs bg-background/50"
                    />
                    <Button 
                      size="sm" 
                      onClick={handleProcess}
                      disabled={processing || !messageId}
                      className="h-8 px-3"
                    >
                      {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="border-t py-6 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-muted-foreground">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="h-3 w-3" />
            <span>Experimental AI Assistant • v1.2.0</span>
          </div>
          <div className="flex items-center gap-6 text-xs">
            <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-foreground transition-colors">Support</a>
            <a href="#" className="hover:text-foreground transition-colors">Documentation</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
