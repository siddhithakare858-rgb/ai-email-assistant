const BASE_URL = "https://ai-email-assistant-hhqz.onrender.com";

export interface Status {
  is_polling: boolean;
  last_checked: string;
  emails_processed_today: number;
  last_email_subject: string;
}

export interface LogEntry {
  message_id: string;
  subject: string;
  processed_at: string;
  action_taken: string;
  status: string;
}

export interface ProcessRequest {
  message_ids: string[];
  organizer_email: string;
}

export async function fetchStatus(): Promise<Status> {
  const res = await fetch(`${BASE_URL}/status`);
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}

export async function fetchLogs(): Promise<LogEntry[]> {
  const res = await fetch(`${BASE_URL}/logs`);
  if (!res.ok) throw new Error("Failed to fetch logs");
  return res.json();
}

export async function processEmails(data: ProcessRequest) {
  const res = await fetch(`${BASE_URL}/process-emails`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to process emails");
  return res.json();
}

export async function fetchHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
}
