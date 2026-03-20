import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, Mail, Users, CheckCircle, AlertCircle, ExternalLink, Loader2, Send, Sparkles, Copy, Brain } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import clsx from 'clsx';

function Spinner({ label }) {
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
      {label ? <span className="text-sm text-slate-300">{label}</span> : null}
    </div>
  );
}

function parseMessageIds(input) {
  // Accept comma or whitespace separated IDs.
  return input
    .split(/[\s,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function App() {
  const apiUrl = useMemo(
    () => process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000/process-emails',
    []
  );

  const [messageIdsInput, setMessageIdsInput] = useState('');
  const [organizerEmail, setOrganizerEmail] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('Team Meeting');
  const [meetingDescription, setMeetingDescription] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [result, setResult] = useState(null);
  const [successPulse, setSuccessPulse] = useState(false);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (!successPulse) return;
    const t = setTimeout(() => setSuccessPulse(false), 3200);
    return () => clearTimeout(t);
  }, [successPulse]);

  useEffect(() => {
    if (result) {
      setShowResult(false);
      const t = setTimeout(() => setShowResult(true), 100);
      return () => clearTimeout(t);
    }
  }, [result]);

  const copyMeetingDetails = () => {
    const details = `Meeting: ${meetingTitle}\nTime: ${result.overlap_start_ist} - ${result.overlap_end_ist} (IST)\nParticipants: ${participants.join(', ')}\nCalendar: ${result.calendar_event_link}`;
    navigator.clipboard.writeText(details);
    toast.success('Meeting details copied to clipboard!');
  };

  async function onSchedule(e) {
    e.preventDefault();
    setError('');
    setResult(null);

    const message_ids = parseMessageIds(messageIdsInput);
    if (message_ids.length < 2 || message_ids.length > 3) {
      const errorMsg = 'Please provide 2-3 message IDs (comma or space separated).';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }
    if (!organizerEmail.trim()) {
      const errorMsg = 'Organizer email is required.';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_ids,
          organizer_email: organizerEmail.trim(),
          meeting_title: meetingTitle.trim(),
          meeting_description: meetingDescription.trim(),
        }),
      });

      if (!res.ok) {
        let detail = `Request failed (${res.status})`;
        try {
          const data = await res.json();
          // FastAPI typically returns { detail: "..." } or { detail: [ ... ] }
          if (typeof data?.detail === 'string') detail = data.detail;
          else if (Array.isArray(data?.detail) && data.detail[0]?.msg) detail = data.detail[0].msg;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(detail);
      }

      const data = await res.json();
      setResult(data);
      setSuccessPulse(true);
      toast.success('Meeting scheduled successfully!');
    } catch (err) {
      const errorMsg = err?.message || 'Something went wrong. Please try again.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  const participants = result?.replied_to || [];

  return (
    <>
      <Toaster 
        position="top-right" 
        toastOptions={{
          duration: 4000,
          style: {
            background: '#ffffff',
            color: '#1e293b',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          },
        }}
      />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-4 shadow-xl">
                <Brain className="h-8 w-8 text-white" />
              </div>
              <div className="text-left">
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900">
                  AI Scheduling Assistant
                </h1>
                <p className="mt-2 text-lg text-slate-600">
                  Smart meeting coordination powered by artificial intelligence
                </p>
              </div>
            </div>

            {successPulse ? (
              <div className="inline-flex items-center gap-3 rounded-full border border-emerald-500/50 bg-emerald-50 px-6 py-3 text-base font-medium text-emerald-700 animate-pulse shadow-lg">
                <CheckCircle className="h-5 w-5" />
                Meeting Successfully Scheduled! 🎉
              </div>
            ) : (
              <div className="text-sm text-slate-500">
                Powered by Advanced AI • Secure & Private
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/80 backdrop-blur-sm p-8 shadow-xl">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-slate-900 flex items-center gap-3">
                <Calendar className="h-6 w-6 text-indigo-600" />
                Schedule Your Meeting
              </h2>
              <p className="mt-2 text-slate-600">Let our AI analyze availability and find the perfect time</p>
            </div>
            
            <form onSubmit={onSchedule} className="space-y-8">
              <div className="grid gap-8 lg:grid-cols-2">
                <div className="space-y-6">
                  <div>
                    <label className="block text-base font-semibold text-slate-900 mb-3">
                      <Mail className="inline h-5 w-5 mr-2 text-indigo-600" />
                      Email Message IDs
                      <span className="ml-3 text-sm font-normal text-slate-500">
                        (2-3 IDs, comma or space separated)
                      </span>
                    </label>
                    <textarea
                      value={messageIdsInput}
                      onChange={(e) => setMessageIdsInput(e.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-base text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none shadow-sm"
                      placeholder="185c1b2f3a4b5c6d&#10;185c1b2f3a4b5c6e&#10;185c1b2f3a4b5c6f"
                      rows={4}
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-base font-semibold text-slate-900 mb-3">
                      <Users className="inline h-5 w-5 mr-2 text-indigo-600" />
                      Your Email
                    </label>
                    <input
                      value={organizerEmail}
                      onChange={(e) => setOrganizerEmail(e.target.value)}
                      type="email"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-base text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
                      placeholder="you@example.com"
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <label className="block text-base font-semibold text-slate-900 mb-3">
                    Meeting Title
                  </label>
                  <input
                    value={meetingTitle}
                    onChange={(e) => setMeetingTitle(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-base text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
                    placeholder="Team Meeting"
                  />
                </div>

                <div>
                  <label className="block text-base font-semibold text-slate-900 mb-3">
                    Description (Optional)
                  </label>
                  <input
                    value={meetingDescription}
                    onChange={(e) => setMeetingDescription(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-base text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
                    placeholder="Weekly sync to discuss project updates"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={clsx(
                  "w-full inline-flex items-center justify-center gap-3 rounded-2xl px-8 py-5 text-base font-semibold text-white shadow-xl transition-all transform",
                  loading
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 hover:scale-[1.02] active:scale-[0.98]"
                )}
              >
                {loading ? (
                  <>
                    <Brain className="h-5 w-5 animate-pulse" />
                    AI is analyzing emails...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Find Meeting Time
                  </>
                )}
              </button>
            </form>

            {error ? (
              <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6" role="alert">
                <div className="flex items-start gap-4">
                  <AlertCircle className="h-6 w-6 text-rose-500 flex-shrink-0 mt-1" />
                  <div>
                    <div className="text-base font-semibold text-rose-900">Something went wrong</div>
                    <div className="mt-2 text-base text-rose-700">{error}</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {result ? (
            <div
              className={clsx(
                "mt-12 rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-10 shadow-2xl transition-all duration-700",
                showResult
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              )}
            >
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg mb-6">
                  <CheckCircle className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-slate-900 mb-3">
                  Perfect! Meeting Scheduled ✨
                </h2>
                <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                  Our AI successfully analyzed all participants' availability and found the ideal time slot for your meeting.
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-8 mb-8 shadow-lg">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-3 text-sm font-medium text-emerald-600 bg-emerald-100 px-4 py-2 rounded-full mb-4">
                    <Clock className="h-4 w-4" />
                    OPTIMAL MEETING TIME
                  </div>
                  <div className="text-4xl sm:text-5xl font-bold text-slate-900 mb-2">
                    {result.overlap_start_ist}
                  </div>
                  <div className="text-xl text-slate-600">
                    to {result.overlap_end_ist} (IST)
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="text-center p-6 bg-slate-50 rounded-xl">
                    <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-500 mb-3">
                      <Users className="h-4 w-4" />
                      PARTICIPANTS
                    </div>
                    <div className="text-lg font-semibold text-slate-900">
                      {participants.length} Confirmed
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3 justify-center">
                      {participants.length ? (
                        participants.map((p) => (
                          <span
                            key={p}
                            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 font-medium shadow-sm"
                          >
                            {p}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">No participants</span>
                      )}
                    </div>
                  </div>

                  <div className="text-center p-6 bg-slate-50 rounded-xl">
                    <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-500 mb-3">
                      <Calendar className="h-4 w-4" />
                      MEETING DETAILS
                    </div>
                    <div className="text-lg font-semibold text-slate-900 mb-1">
                      {meetingTitle}
                    </div>
                    <div className="text-sm text-slate-600">
                      Event ID: {result.calendar_event_id}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                {result.calendar_event_link ? (
                  <a
                    href={result.calendar_event_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-4 text-base font-semibold text-white shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <ExternalLink className="h-5 w-5" />
                    Open in Calendar
                  </a>
                ) : (
                  <span className="text-base text-slate-500">Calendar link not available</span>
                )}
                
                <button
                  onClick={copyMeetingDetails}
                  className="inline-flex items-center gap-3 rounded-2xl border-2 border-slate-300 bg-white px-8 py-4 text-base font-semibold text-slate-700 shadow-lg transition-all hover:border-slate-400 hover:bg-slate-50"
                >
                  <Copy className="h-5 w-5" />
                  Copy Details
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
