import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Users, Clock, Calendar, CheckCircle, AlertCircle, ExternalLink, Copy, Brain, Zap, ArrowRight, User, Activity, Shield, Sparkles } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import clsx from 'clsx';

function Spinner({ label }) {
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <Brain className="h-4 w-4 animate-pulse text-purple-400" />
      {label ? <span className="text-sm text-purple-200">{label}</span> : null}
    </div>
  );
}

export default function App() {
  const apiUrl = useMemo(
    () => process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000',
    []
  );

  // Screen state management
  const [currentScreen, setCurrentScreen] = useState('landing');
  const [userEmail, setUserEmail] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  // Existing state for dashboard
  const [messageIdsInput, setMessageIdsInput] = useState('');
  const [organizerEmail, setOrganizerEmail] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('Team Meeting');
  const [meetingDescription, setMeetingDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [successPulse, setSuccessPulse] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const participants = result?.replied_to || [];

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

  useEffect(() => {
    // Check if user is already connected
    const savedEmail = localStorage.getItem('userEmail');
    if (savedEmail) {
      setUserEmail(savedEmail);
      setIsConnected(true);
      setCurrentScreen('dashboard');
    }
  }, []);

  const copyMeetingDetails = () => {
    const details = `Meeting: ${meetingTitle}\nTime: ${result.overlap_start_ist} - ${result.overlap_end_ist} (IST)\nParticipants: ${participants.join(', ')}\nCalendar: ${result.calendar_event_link}`;
    navigator.clipboard.writeText(details);
    toast.success('Meeting details copied to clipboard!');
  };

  const handleConnectGmail = () => {
    if (!userEmail.trim()) {
      toast.error('Please enter your email address');
      return;
    }
    localStorage.setItem('userEmail', userEmail);
    setUserEmail(userEmail);
    setIsConnected(true);
    toast.success('Gmail connected successfully!');
    
    setTimeout(() => {
      setCurrentScreen('dashboard');
    }, 500);
  };

  const handleSwitchAccount = () => {
    localStorage.removeItem('userEmail');
    setUserEmail('');
    setIsConnected(false);
    setCurrentScreen('landing');
  };

  const onSchedule = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);

    if (!userEmail.trim()) {
      toast.error('Please connect your Gmail first');
      return;
    }

    const message_ids = messageIdsInput.split(',').map(id => id.trim()).filter(id => id);
    if (message_ids.length < 2 || message_ids.length > 3) {
      const errorMsg = 'Please provide 2-3 message IDs (comma or space separated).';
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
          organizer_email: userEmail,
          calendar_summary: meetingTitle,
        }),
      });

      if (!res.ok) {
        let detail = `Request failed (${res.status})`;
        try {
          const data = await res.json();
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
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
      toast.error(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Screen 1: Landing Page
  if (currentScreen === 'landing') {
    return (
      <>
        <Toaster 
          position="top-right" 
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid #334155',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            },
          }}
        />
        
        {/* Animated Particles Background */}
        <div className="particles">
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
        </div>

        <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
          <div className="w-full max-w-md animate-fade-in">
            {/* Lightning Bolt Icon with Purple Gradient Background */}
            <div className="flex justify-center mb-8">
              <div className="gradient-icon-bg">
                <Zap className="h-16 w-16 text-white" />
              </div>
            </div>

            {/* Title and Subtitle with Gradient Text */}
            <div className="text-center mb-8">
              <h1 className="text-5xl font-bold mb-3 tracking-tight gradient-text">
                MailMind AI
              </h1>
              <p className="text-lg text-gray-300 leading-relaxed">
                Your autonomous AI email scheduling assistant
              </p>
            </div>

            {/* Connection Card with Glassmorphism */}
            <div className="glassmorphism rounded-2xl p-8 shadow-2xl">
              <div className="space-y-6">
                <div>
                  <label className="block text-base font-semibold text-gray-200 mb-3">
                    <Mail className="inline h-5 w-5 mr-2 text-purple-400" />
                    Enter your Gmail address to connect your assistant
                  </label>
                  <input
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="w-full px-5 py-4 text-lg glassmorphism rounded-xl text-white placeholder-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all interactive-input"
                    placeholder="you@gmail.com"
                    autoComplete="off"
                  />
                </div>

                <button
                  onClick={handleConnectGmail}
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-4 px-6 rounded-xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 interactive-button"
                >
                  Activate My Assistant
                  <ArrowRight className="h-5 w-5" />
                </button>

                <p className="text-center text-sm text-gray-400">
                  Your assistant is already running. This connects your view.
                </p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Screen 2: Dashboard
  return (
    <>
      <Toaster 
        position="top-right" 
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #334155',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          },
        }}
      />
      <div className="min-h-screen dashboard-page">
        {/* Header */}
        <div className="dashboard-header">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="gradient-icon-bg">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">MailMind AI</h1>
                <p className="text-sm text-gray-400 flex items-center gap-2">
                  <span className="status-pill">
                    <div className="green-dot"></div>
                    Agent Active
                  </span>
                  {isConnected && (
                    <span className="text-purple-400 font-medium">
                      • {userEmail}
                    </span>
                  )}
                  <button
                    onClick={handleSwitchAccount}
                    className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
                  >
                    Switch account
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Stats Cards */}
            <div className="lg:col-span-1 space-y-6">
              <div className="dashboard-card">
                <div className="flex items-center gap-3 mb-4">
                  <Mail className="h-5 w-5 text-purple-400" />
                  <h3 className="text-lg font-semibold text-white">Emails Processed</h3>
                </div>
                <div className="stats-number">0</div>
                <p className="stats-subtitle">Agent started recently</p>
              </div>

              <div className="dashboard-card">
                <div className="flex items-center gap-3 mb-4">
                  <Calendar className="h-5 w-5 text-purple-400" />
                  <h3 className="text-lg font-semibold text-white">Meetings Scheduled</h3>
                </div>
                <div className="stats-number">0</div>
                <p className="stats-subtitle">This week</p>
              </div>
            </div>

            {/* Main Panel */}
            <div className="lg:col-span-2 space-y-6">
              {/* Schedule Meeting Form */}
              <div className="dashboard-card">
                <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-3">
                  <Calendar className="h-6 w-6 text-purple-400" />
                  Schedule New Meeting
                </h2>
                
                <form onSubmit={onSchedule} className="space-y-6">
                  <div>
                    <label className="block text-base font-semibold text-white mb-3">
                      <Mail className="inline h-5 w-5 mr-2 text-purple-400" />
                      Email Message IDs
                      <span className="ml-3 text-sm font-normal text-gray-400">
                        (2-3 IDs, comma or space separated)
                      </span>
                    </label>
                    <textarea
                      value={messageIdsInput}
                      onChange={(e) => setMessageIdsInput(e.target.value)}
                      className="w-full rounded-xl border border-gray-600 bg-gray-800 px-5 py-4 text-base text-white outline-none ring-0 placeholder:text-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all resize-none"
                      placeholder="185c1b2f3a4b5c6d&#10;185c1b2f3a4b5c6e&#10;185c1b2f3a4b5c6f"
                      rows={4}
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-white mb-3">
                      <Users className="inline h-5 w-5 mr-2 text-purple-400" />
                      Your Email
                    </label>
                    <input
                      value={userEmail}
                      readOnly
                      className="w-full rounded-xl border border-gray-600 bg-gray-800 px-5 py-4 text-base text-white outline-none ring-0 placeholder:text-gray-400 cursor-not-allowed"
                      placeholder={userEmail}
                    />
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <label className="block text-base font-semibold text-white mb-3">
                        Meeting Title
                      </label>
                      <input
                        value={meetingTitle}
                        onChange={(e) => setMeetingTitle(e.target.value)}
                        className="w-full rounded-xl border border-gray-600 bg-gray-800 px-5 py-4 text-base text-white outline-none ring-0 placeholder:text-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                        placeholder="Team Meeting"
                      />
                    </div>

                    <div>
                      <label className="block text-base font-semibold text-white mb-3">
                        Description (Optional)
                      </label>
                      <input
                        value={meetingDescription}
                        onChange={(e) => setMeetingDescription(e.target.value)}
                        className="w-full rounded-xl border border-gray-600 bg-gray-800 px-5 py-4 text-base text-white outline-none ring-0 placeholder:text-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                        placeholder="Weekly sync to discuss project updates"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={clsx(
                      "w-full inline-flex items-center justify-center gap-3 rounded-xl px-8 py-5 text-base font-semibold text-white shadow-xl transition-all transform",
                      loading
                        ? "bg-gray-600 cursor-not-allowed"
                        : "purple-button"
                    )}
                  >
                    {loading ? (
                      <>
                        <Brain className="h-5 w-5 animate-pulse" />
                        AI is analyzing emails...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-5 w-5" />
                        Find Meeting Time
                      </>
                    )}
                  </button>
                </form>

                {error ? (
                  <div className="mt-6 rounded-xl border border-rose-500/50 bg-rose-500/10 p-6" role="alert">
                    <div className="flex items-start gap-4">
                      <AlertCircle className="h-6 w-6 text-rose-400 flex-shrink-0 mt-1" />
                      <div>
                        <div className="text-base font-semibold text-rose-200">Something went wrong</div>
                        <div className="mt-2 text-base text-rose-100">{error}</div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* How It Works Section */}
              <div className="dashboard-card">
                <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-3">
                  <Shield className="h-6 w-6 text-purple-400" />
                  How it works
                </h2>
                
                <div className="space-y-4">
                  <div className="flex gap-4 p-4 step-card">
                    <div className="step-badge">1</div>
                    <div>
                      <h3 className="font-semibold text-white mb-2">Someone emails you asking to meet</h3>
                      <p className="text-gray-400">Forward scheduling emails to your MailMind AI assistant</p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 step-card">
                    <div className="step-badge">2</div>
                    <div>
                      <h3 className="font-semibold text-white mb-2">MailMind AI reads and parses their availability</h3>
                      <p className="text-gray-400">Advanced AI extracts time slots and preferences from natural language</p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 step-card">
                    <div className="step-badge">3</div>
                    <div>
                      <h3 className="font-semibold text-white mb-2">Meeting scheduled, calendar invite sent automatically</h3>
                      <p className="text-gray-400">Calendar events created and invites sent to all participants</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Activity Feed */}
              <div className="activity-monitor">
                <div className="flex justify-center mb-4">
                  <div className="green-dot"></div>
                  <span className="monitor-text">Agent is monitoring your inbox...</span>
                </div>
                <div className="text-center text-gray-500 text-sm">
                  Processed emails will appear here
                </div>
              </div>

              {/* Results Display */}
              {result ? (
                <div
                  className={clsx(
                    "mt-6 rounded-2xl border p-8 shadow-2xl transition-all duration-700",
                    showResult
                      ? "opacity-100 translate-y-0 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
                      : "opacity-0 translate-y-4 border-slate-200 bg-white"
                  )}
                >
                  <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg mb-6">
                      <CheckCircle className="h-8 w-8 text-white" />
                    </div>
                    <h2 className="text-3xl font-bold text-slate-900 mb-3">
                      Perfect! Meeting Scheduled ✨
                    </h2>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                      Our AI successfully analyzed all participants' availability and found the ideal time slot for your meeting.
                    </p>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-8 mb-8 shadow-lg">
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
                        className="inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <ExternalLink className="h-5 w-5" />
                        Open in Calendar
                      </a>
                    ) : (
                      <span className="text-base text-slate-500">Calendar link not available</span>
                    )}
                    
                    <button
                      onClick={copyMeetingDetails}
                      className="inline-flex items-center gap-3 rounded-xl border-2 border-slate-300 bg-white px-8 py-4 text-base font-semibold text-slate-700 shadow-lg transition-all hover:border-slate-400 hover:bg-slate-50"
                    >
                      <Copy className="h-5 w-5" />
                      Copy Details
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
