import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API_BASE = 'https://ai-email-assistant-hhqz.onrender.com';

const COLORS = {
  bg: '#0a0a0f',
  card: '#12121a',
  accent: '#6c63ff',
  success: '#00d4aa',
  warning: '#ff6b6b',
};

function LightningLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M13 2L3 14h8l-1 8 10-12h-8l1-8Z"
        stroke={COLORS.accent}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M13 2L3 14h8l-1 8 10-12h-8l1-8Z"
        fill="rgba(108,99,255,0.18)"
      />
    </svg>
  );
}

function formatCompactTimestamp(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso ?? '');
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso ?? '');
  }
}

function truncateMiddle(s, max = 34) {
  const str = String(s ?? '');
  if (str.length <= max) return str;
  const left = Math.ceil((max - 3) / 2);
  const right = Math.floor((max - 3) / 2);
  return `${str.slice(0, left)}...${str.slice(str.length - right)}`;
}

function computeUptimeHuman(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function safeJson(data) {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export default function App() {
  const startedAtRef = useRef(Date.now());
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');

  const [logs, setLogs] = useState([]);
  const [logsError, setLogsError] = useState('');
  const [newLogKeys, setNewLogKeys] = useState({});
  const knownKeysRef = useRef(new Set());

  const [messageId, setMessageId] = useState('');
  const [triggerBusy, setTriggerBusy] = useState(false);
  const [triggerResult, setTriggerResult] = useState(null);
  const [triggerError, setTriggerError] = useState('');

  const [, setUptimeTick] = useState(0);

  const statusUrl = useMemo(() => `${API_BASE}/status`, []);
  const logsUrl = useMemo(() => `${API_BASE}/logs`, []);
  const processUrl = useMemo(() => `${API_BASE}/process-emails`, []);

  const rootStyle = {
    minHeight: '100vh',
    background: COLORS.bg,
    color: 'rgba(255,255,255,0.92)',
    padding: '22px 16px 40px',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Noto Sans", "Liberation Sans", sans-serif',
  };

  const glassCard = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 18,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    boxShadow: '0 18px 60px rgba(0,0,0,0.25)',
  };

  const headerPillBase = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)',
    transition: 'transform 180ms ease, border-color 180ms ease, background 180ms ease',
  };

  useEffect(() => {
    const t = setInterval(() => setUptimeTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchStatus = useCallback(async () => {
    setStatusError('');
    try {
      const res = await fetch(statusUrl, { method: 'GET' });
      if (!res.ok) throw new Error(`Status request failed (${res.status})`);
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      setStatusError(e?.message || 'Failed to fetch status');
    }
  }, [statusUrl]);

  const fetchLogs = useCallback(async () => {
    setLogsError('');
    try {
      const res = await fetch(logsUrl, { method: 'GET' });
      if (!res.ok) throw new Error(`Logs request failed (${res.status})`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Logs response was not an array');

      const incoming = data.slice(0, 20);

      // Detect new entries by a stable key.
      const newKeys = {};
      const nextKnown = new Set(knownKeysRef.current);
      for (const entry of incoming) {
        const key = `${entry.logged_at ?? ''}|${entry.action_taken ?? ''}|${entry.subject ?? ''}`;
        if (!knownKeysRef.current.has(key)) {
          newKeys[key] = true;
        }
        nextKnown.add(key);
      }

      knownKeysRef.current = nextKnown;
      setNewLogKeys(newKeys);
      setLogs(incoming);

      setTimeout(() => setNewLogKeys({}), 900);
    } catch (e) {
      setLogsError(e?.message || 'Failed to fetch logs');
    }
  }, [logsUrl]);

  useEffect(() => {
    fetchStatus();
    fetchLogs();
    const statusInt = setInterval(fetchStatus, 30000);
    const logsInt = setInterval(fetchLogs, 15000);
    return () => {
      clearInterval(statusInt);
      clearInterval(logsInt);
    };
  }, [fetchStatus, fetchLogs]);

  async function onProcessNow() {
    setTriggerBusy(true);
    setTriggerError('');
    setTriggerResult(null);
    const trimmed = messageId.trim();
    if (!trimmed) {
      setTriggerError('Please enter a Gmail message id.');
      setTriggerBusy(false);
      return;
    }

    try {
      const res = await fetch(processUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_ids: [trimmed],
          organizer_email: 'dashboard@local',
        }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setTriggerError(body?.detail || `Request failed (${res.status})`);
        setTriggerResult(body);
        return;
      }

      setTriggerResult(body);
    } catch (e) {
      setTriggerError(e?.message || 'Failed to process message');
    } finally {
      setTriggerBusy(false);
    }
  }

  async function onRefreshStatus() {
    await Promise.all([fetchStatus(), fetchLogs()]);
  }

  const isActive = Boolean(status?.is_polling);
  const lastChecked = status?.last_checked ? formatCompactTimestamp(status.last_checked) : '—';
  const emailsProcessedToday = Number(status?.emails_processed_today ?? 0);
  const lastEmailSubject = truncateMiddle(status?.last_email_subject || 'No subject', 44);
  const uptimeMs = Date.now() - startedAtRef.current;
  const uptime = computeUptimeHuman(uptimeMs);

  const badgeForAction = (actionTaken, statusStr) => {
    const upperAction = String(actionTaken ?? '').toLowerCase();
    let label = 'IGNORED';
    let bg = 'rgba(255,107,107,0.14)';
    let border = 'rgba(255,107,107,0.28)';
    let color = COLORS.warning;

    if (upperAction.includes('schedule') || upperAction === 'scheduling') {
      label = 'SCHEDULED';
      bg = 'rgba(108,99,255,0.14)';
      border = 'rgba(108,99,255,0.30)';
      color = COLORS.accent;
    } else if (upperAction === 'update') {
      label = 'SUMMARIZED';
      bg = 'rgba(108,99,255,0.14)';
      border = 'rgba(108,99,255,0.30)';
      color = COLORS.accent;
    } else if (upperAction === 'ignored' || upperAction === 'ignore' || statusStr === 'skipped') {
      label = 'IGNORED';
      bg = 'rgba(255,107,107,0.14)';
      border = 'rgba(255,107,107,0.30)';
      color = COLORS.warning;
    }

    return { label, bg, border, color };
  };

  const hoverTransition = 'transform 160ms ease, background 160ms ease, border-color 160ms ease';
  const primaryButtonStyle = {
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    padding: '12px 16px',
    border: `1px solid rgba(108,99,255,0.35)`,
    background: `linear-gradient(135deg, rgba(108,99,255,1) 0%, rgba(108,99,255,0.70) 100%)`,
    color: 'white',
    fontWeight: 700,
    cursor: triggerBusy ? 'not-allowed' : 'pointer',
    opacity: triggerBusy ? 0.7 : 1,
    transition: hoverTransition,
    userSelect: 'none',
  };

  const secondaryButtonStyle = {
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    padding: '12px 16px',
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.02)',
    color: 'rgba(255,255,255,0.92)',
    fontWeight: 650,
    cursor: 'pointer',
    transition: hoverTransition,
    userSelect: 'none',
  };

  return (
    <div style={rootStyle} className="mmAppRoot">
      <style>{`
        @keyframes mmFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes mmPulseDot { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0,212,170,0.35); } 70% { transform: scale(1.05); box-shadow: 0 0 0 12px rgba(0,212,170,0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0,212,170,0); } }
        @keyframes mmSlideInTop { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes mmSubtleFloat { 0% { transform: translateY(0); opacity: 0.75; } 50% { transform: translateY(-3px); opacity: 1; } 100% { transform: translateY(0); opacity: 0.75; } }
        .mmFadeIn { animation: mmFadeIn 520ms ease both; }
        .mmNewLog { animation: mmSlideInTop 520ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        .mmHoverable:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.14) !important; background: rgba(255,255,255,0.04) !important; }
        .mmActiveDot { animation: mmPulseDot 1.4s ease-in-out infinite; }
        @media (max-width: 900px) {
          .mmTwoCol { grid-template-columns: 1fr !important; }
          .mmStats { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="mmFadeIn" style={{ maxWidth: 1160, margin: '0 auto' }}>
        {/* HEADER BAR */}
        <div style={{ ...glassCard, padding: 16, marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(108,99,255,0.12)',
                  border: '1px solid rgba(108,99,255,0.30)',
                }}
              >
                <LightningLogo />
              </div>
              <div style={{ fontSize: 18, fontWeight: 850, letterSpacing: 0.2 }}>
                MailMind AI
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div
                className="mmHoverable"
                style={{
                  ...headerPillBase,
                  borderColor: isActive ? 'rgba(0,212,170,0.35)' : 'rgba(255,107,107,0.35)',
                }}
              >
                <span
                  className={isActive ? 'mmActiveDot' : ''}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: isActive ? COLORS.success : COLORS.warning,
                    display: 'inline-block',
                    boxShadow: isActive ? '0 0 0 0 rgba(0,212,170,0.35)' : 'none',
                  }}
                />
                <span style={{ fontWeight: 750, fontSize: 13 }}>
                  {isActive ? 'Agent Active' : 'Agent Offline'}
                </span>
              </div>

              <div style={{ padding: '0 2px', minWidth: 240 }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
                  Last checked
                </div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{lastChecked}</div>
                {statusError ? (
                  <div style={{ marginTop: 6, fontSize: 12, color: COLORS.warning, wordBreak: 'break-word' }}>
                    {statusError}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* STATS ROW */}
        <div className="mmStats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          <div style={{ ...glassCard, padding: 16 }} className="mmHoverable">
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 10 }}>Emails processed today</div>
            <div style={{ fontSize: 34, fontWeight: 900, color: COLORS.success }}>{emailsProcessedToday}</div>
            <div style={{ fontSize: 12, marginTop: 8, color: 'rgba(255,255,255,0.60)' }}>From your poller</div>
          </div>

          <div style={{ ...glassCard, padding: 16 }} className="mmHoverable">
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 10 }}>Last email subject</div>
            <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{lastEmailSubject}</div>
            <div style={{ fontSize: 12, marginTop: 8, color: 'rgba(255,255,255,0.60)' }}>Most recent processed</div>
          </div>

          <div style={{ ...glassCard, padding: 16 }} className="mmHoverable">
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 10 }}>Agent uptime</div>
            <div style={{ fontSize: 34, fontWeight: 900, color: COLORS.accent }}>{uptime}</div>
            <div style={{ fontSize: 12, marginTop: 8, color: 'rgba(255,255,255,0.60)' }}>
              Since page load
            </div>
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="mmTwoCol" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12, alignItems: 'start' }}>
          {/* LIVE ACTIVITY FEED */}
          <div style={{ ...glassCard, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 0.2 }}>Live Activity Feed</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{logsError ? 'Updating failed' : 'Auto-refreshing'}</div>
            </div>

            {logsError ? (
              <div style={{ color: COLORS.warning, fontSize: 13, marginBottom: 10, wordBreak: 'break-word' }}>{logsError}</div>
            ) : null}

            {logs.length === 0 ? (
              <div
                style={{
                  padding: '26px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  color: 'rgba(255,255,255,0.70)',
                }}
              >
                <div style={{ animation: 'mmSubtleFloat 1.8s ease-in-out infinite', fontWeight: 750 }}>
                  Waiting for emails...
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {logs.map((entry) => {
                  const action = badgeForAction(entry.action_taken, entry.status);
                  const key = `${entry.logged_at ?? ''}|${entry.action_taken ?? ''}|${entry.subject ?? ''}`;
                  const isNew = Boolean(newLogKeys[key]);

                  return (
                        <div key={key} className={isNew ? 'mmNewLog' : ''} style={{ ...glassCard, padding: 14, ...logItemShadowStyle() }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.60)' }}>
                          {formatCompactTimestamp(entry.logged_at)}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 900,
                            padding: '6px 10px',
                            borderRadius: 999,
                            border: `1px solid ${action.border}`,
                            background: action.bg,
                            color: action.color,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {action.label}
                        </div>
                      </div>

                      <div style={{ marginTop: 10, fontWeight: 850, lineHeight: 1.25, wordBreak: 'break-word' }}>
                        {entry.subject ? entry.subject : 'No subject'}
                      </div>
                      {entry.message_id ? (
                        <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                          {truncateMiddle(entry.message_id, 36)}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* MANUAL TRIGGER PANEL */}
          <div style={{ ...glassCard, padding: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Manual Trigger Panel</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 14 }}>
              Process a specific Gmail message id on demand.
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.60)', marginBottom: 6, fontWeight: 700 }}>
                Enter Gmail Message ID
              </div>
              <input
                value={messageId}
                onChange={(e) => setMessageId(e.target.value)}
                placeholder=""
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: 'rgba(255,255,255,0.94)',
                  borderRadius: 14,
                  padding: '12px 12px',
                  outline: 'none',
                  transition: 'border-color 160ms ease, background 160ms ease',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(108,99,255,0.55)';
                  e.target.style.background = 'rgba(255,255,255,0.03)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.10)';
                  e.target.style.background = 'rgba(255,255,255,0.02)';
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 12 }}>
              <div
                className="mmHoverable"
                style={primaryButtonStyle}
                onClick={() => {
                  if (!triggerBusy) onProcessNow();
                }}
                role="button"
                aria-disabled={triggerBusy}
              >
                {triggerBusy ? (
                  <span style={{ fontWeight: 900 }}>Processing...</span>
                ) : (
                  <span style={{ fontWeight: 900 }}>Process Now</span>
                )}
              </div>

              <div
                className="mmHoverable"
                style={secondaryButtonStyle}
                onClick={onRefreshStatus}
                role="button"
              >
                Refresh Status
              </div>
            </div>

            {triggerError ? (
              <div
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(255,107,107,0.30)',
                  background: 'rgba(255,107,107,0.12)',
                  padding: 12,
                  marginTop: 8,
                }}
              >
                <div style={{ fontWeight: 900, color: COLORS.warning, marginBottom: 6 }}>
                  Error
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginBottom: 8, wordBreak: 'break-word' }}>
                  {triggerError}
                </div>
                {triggerResult ? (
                  <pre
                    style={{
                      margin: 0,
                      fontSize: 12,
                      overflow: 'auto',
                      maxHeight: 220,
                      color: 'rgba(255,255,255,0.92)',
                      whiteSpace: 'pre',
                    }}
                  >
                    {safeJson(triggerResult)}
                  </pre>
                ) : null}
              </div>
            ) : null}

            {triggerResult && !triggerError ? (
              <div
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(0,212,170,0.30)',
                  background: 'rgba(0,212,170,0.10)',
                  padding: 12,
                  marginTop: 10,
                }}
              >
                <div style={{ fontWeight: 900, color: COLORS.success, marginBottom: 6 }}>
                  Success
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontSize: 12,
                    overflow: 'auto',
                    maxHeight: 220,
                    color: 'rgba(255,255,255,0.92)',
                    whiteSpace: 'pre',
                  }}
                >
                  {safeJson(triggerResult)}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function logItemShadowStyle() {
  return {
    boxShadow: '0 14px 50px rgba(0,0,0,0.22)',
    transition: 'transform 180ms ease, border-color 180ms ease, background 180ms ease',
  };
}
