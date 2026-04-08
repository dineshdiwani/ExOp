import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { ArrowLeft, MessageCircle, Mic, PhoneCall, PhoneOff, Send, Shield, User, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CALL_LABELS = {
  voice: 'Voice Call',
  video: 'Video Call',
};

const CALL_STATUS_STYLES = {
  requested: 'bg-amber-100 text-amber-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  missed: 'bg-slate-200 text-slate-700',
  cancelled: 'bg-slate-200 text-slate-700',
};

function formatCallStatus(call) {
  if (!call) return 'No call activity yet';

  if (call.status === 'requested') {
    return `${CALL_LABELS[call.call_type]} requested`;
  }

  if (call.status === 'accepted') {
    return `${CALL_LABELS[call.call_type]} accepted`;
  }

  if (call.status === 'rejected') {
    return call.resolution_reason || 'Call request declined';
  }

  if (call.status === 'cancelled') {
    return call.resolution_reason || 'Call request cancelled';
  }

  if (call.status === 'missed') {
    return call.resolution_reason || 'Call request timed out';
  }

  return call.status;
}

function getCallCountdown(expiresAt) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function playIncomingTone() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const audioContext = new AudioContextClass();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.03;

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.35);
  oscillator.onended = () => {
    audioContext.close().catch(() => {});
  };
}

export default function ChatRoom() {
  const { bookingId } = useParams();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [messages, setMessages] = useState([]);
  const [callRequests, setCallRequests] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [requestingCallType, setRequestingCallType] = useState(null);
  const [actingCallId, setActingCallId] = useState(null);
  const [summaryText, setSummaryText] = useState('');
  const [submittingSummary, setSubmittingSummary] = useState(false);
  const [incomingOpen, setIncomingOpen] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const messagesEndRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const lastAlertedCallIdRef = useRef(null);

  useEffect(() => {
    fetchData();
    pollIntervalRef.current = setInterval(refreshRoomState, 3000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchData, refreshRoomState]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const latestCall = callRequests[0] || null;
  const isClient = user?.user_id === booking?.client_id;
  const isExpert = user?.user_id === booking?.expert_id;
  const otherParty = isClient
    ? (booking?.expert?.name || booking?.expert?.alias)
    : (booking?.client?.alias || 'Anonymous Client');
  const isCallFeatureEnabled = booking?.payment_status === 'paid' && ['confirmed', 'in_progress'].includes(booking?.status);
  const activeCallRequest = latestCall?.status === 'requested' ? latestCall : null;
  const expertWhatsappNumber = (booking?.expert_profile?.whatsapp_number || '').replace(/\D/g, '');
  const whatsappHandoffUrl = useMemo(() => {
    if (!isClient || !latestCall || latestCall.status !== 'accepted' || !expertWhatsappNumber) return '';
    const callTypeLabel = latestCall.call_type === 'video' ? 'video call' : 'voice call';
    const message = `Hello, I am ready for the ${callTypeLabel} consultation. Booking: ${bookingId}`;
    return `https://wa.me/${expertWhatsappNumber}?text=${encodeURIComponent(message)}`;
  }, [isClient, latestCall, expertWhatsappNumber, bookingId]);

  const incomingCallRequest = useMemo(() => {
    if (!isExpert || !activeCallRequest) return null;
    return activeCallRequest.target_user_id === user?.user_id ? activeCallRequest : null;
  }, [activeCallRequest, isExpert, user?.user_id]);
  const needsCallSummary = isExpert && latestCall?.status === 'accepted' && !booking?.call_summary;

  useEffect(() => {
    if (!isExpert || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [isExpert]);

  useEffect(() => {
    if (!incomingCallRequest) {
      setIncomingOpen(false);
      return;
    }

    setIncomingOpen(true);
    setCountdown(getCallCountdown(incomingCallRequest.expires_at));

    if (lastAlertedCallIdRef.current !== incomingCallRequest.call_id) {
      lastAlertedCallIdRef.current = incomingCallRequest.call_id;
      playIncomingTone();
      toast.info(`Client wants to discuss on ${CALL_LABELS[incomingCallRequest.call_type].toLowerCase()}.`);
      if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification('Incoming client call request', {
          body: `Client requested a ${CALL_LABELS[incomingCallRequest.call_type].toLowerCase()} for booking ${bookingId}.`,
        });
        notification.onclick = () => {
          window.focus();
          setIncomingOpen(true);
          notification.close();
        };
      }
    }
  }, [incomingCallRequest, bookingId]);

  useEffect(() => {
    if (!incomingCallRequest) return;

    const timer = setInterval(() => {
      setCountdown(getCallCountdown(incomingCallRequest.expires_at));
    }, 1000);

    return () => clearInterval(timer);
  }, [incomingCallRequest]);

  const refreshRoomState = useCallback(async () => {
    try {
      const [messagesRes, callsRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/chat/messages/${bookingId}`),
        axios.get(`${API_URL}/api/calls/${bookingId}`)
      ]);
      if (messagesRes.status === 'fulfilled') {
        setMessages(messagesRes.value.data || []);
      }
      if (callsRes.status === 'fulfilled') {
        setCallRequests(callsRes.value.data || []);
      }
    } catch (error) {
      console.error('Error refreshing room state:', error);
    }
  }, [bookingId]);

  const fetchCalls = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/calls/${bookingId}`);
      setCallRequests(response.data || []);
    } catch (error) {
      console.error('Error fetching call requests:', error);
    }
  }, [bookingId]);

  const fetchData = useCallback(async () => {
    try {
      const [bookingRes, messagesRes, callsRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/bookings/${bookingId}`),
        axios.get(`${API_URL}/api/chat/messages/${bookingId}`),
        axios.get(`${API_URL}/api/calls/${bookingId}`)
      ]);
      if (bookingRes.status !== 'fulfilled' || messagesRes.status !== 'fulfilled') {
        throw new Error('Failed to load core chat data');
      }

      setBooking(bookingRes.value.data);
      setMessages(messagesRes.value.data || []);
      setCallRequests(callsRes.status === 'fulfilled' ? (callsRes.value.data || []) : []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load chat');
      navigate('/my-bookings');
    } finally {
      setLoading(false);
    }
  }, [bookingId, navigate]);

  const fetchBooking = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/bookings/${bookingId}`);
      setBooking(response.data);
    } catch (error) {
      console.error('Error fetching booking:', error);
    }
  }, [bookingId]);

  useEffect(() => {
    if (!token || !bookingId) return;

    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      auth: { token }
    });

    socket.on('connect', () => {
      socket.emit('join_booking', { booking_id: bookingId });
    });

    socket.on('call_event', (payload) => {
      if (!payload || payload.booking_id !== bookingId) return;
      fetchCalls();
      fetchBooking();
    });

    return () => {
      socket.off('call_event');
      socket.disconnect();
    };
  }, [token, bookingId, fetchCalls, fetchBooking]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      await axios.post(`${API_URL}/api/chat/messages`, {
        booking_id: bookingId,
        content: newMessage.trim()
      });
      setNewMessage('');
      refreshRoomState();
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleRequestCall = async (callType) => {
    setRequestingCallType(callType);
    try {
      await axios.post(`${API_URL}/api/calls/request`, {
        booking_id: bookingId,
        call_type: callType
      });
      await fetchCalls();
      toast.success(`${CALL_LABELS[callType]} requested. Waiting for expert response.`);
    } catch (error) {
      toast.error(error.response?.data?.detail || `Failed to request ${CALL_LABELS[callType].toLowerCase()}`);
    } finally {
      setRequestingCallType(null);
    }
  };

  const handleCallAction = async (callId, action) => {
    setActingCallId(callId);
    try {
      await axios.post(`${API_URL}/api/calls/${callId}/${action}`, {});
      await fetchCalls();
      await fetchBooking();

      if (action === 'accept') {
        toast.success('Call request accepted. Media handoff is the next integration step.');
      } else if (action === 'reject') {
        toast.success('Call request rejected.');
      } else {
        toast.success('Call request cancelled.');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update call request');
    } finally {
      setActingCallId(null);
    }
  };

  const handleOpenWhatsapp = () => {
    if (!whatsappHandoffUrl) {
      toast.error('Expert WhatsApp number is not configured yet.');
      return;
    }
    window.open(whatsappHandoffUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSubmitSummary = async () => {
    const content = summaryText.trim();
    if (content.length < 20) {
      toast.error('Summary must be at least 20 characters.');
      return;
    }

    setSubmittingSummary(true);
    try {
      await axios.post(`${API_URL}/api/bookings/${bookingId}/call-summary`, { content });
      await fetchBooking();
      setSummaryText('');
      toast.success('Post-call summary submitted.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit summary');
    } finally {
      setSubmittingSummary(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse-soft text-lg text-slate-600">Loading chat...</div>
      </div>
    );
  }

  if (!booking) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 md:px-8 max-w-4xl">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate(`/booking/${bookingId}`)} data-testid="back-btn">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-slate-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900" data-testid="chat-title">{otherParty}</h2>
                  <p className="text-xs text-slate-500">Consultation Chat</p>
                </div>
              </div>
            </div>
            <Badge className={`status-${booking.status}`}>{booking.status.replace('_', ' ')}</Badge>
          </div>
        </div>
      </header>

      <div className="flex-1 container mx-auto px-4 md:px-8 max-w-4xl py-4">
        <div className="space-y-4">
          <Card className="border-slate-200">
            <div className="p-4 md:p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-900">
                  <PhoneCall className="w-4 h-4 text-teal-600" />
                  <h3 className="font-semibold">Consultation Call Controls</h3>
                </div>
                <p className="text-sm text-slate-600">
                  {formatCallStatus(latestCall)}
                </p>
                {latestCall && (
                  <div className="flex flex-wrap gap-2">
                    <Badge className={CALL_STATUS_STYLES[latestCall.status] || 'bg-slate-100 text-slate-700'}>
                      {latestCall.status}
                    </Badge>
                    <Badge variant="outline">
                      {CALL_LABELS[latestCall.call_type]}
                    </Badge>
                  </div>
                )}
                {!isCallFeatureEnabled && (
                  <p className="text-xs text-slate-500">
                    Calls become available once payment is completed and the booking is active.
                  </p>
                )}
                {isCallFeatureEnabled && (
                  <p className="text-xs text-slate-500">
                    SLA: expert has 30s to respond. Retry cooldown is 2 minutes. Maximum 3 call requests per consultation.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {isClient && (
                  <>
                    <Button
                      type="button"
                      variant="default"
                      disabled={!isCallFeatureEnabled || !!activeCallRequest || requestingCallType === 'video'}
                      onClick={() => handleRequestCall('voice')}
                      data-testid="request-voice-call-btn"
                    >
                      <Mic className="w-4 h-4" />
                      {requestingCallType === 'voice' ? 'Requesting...' : 'Request Voice Call'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!isCallFeatureEnabled || !!activeCallRequest || requestingCallType === 'voice'}
                      onClick={() => handleRequestCall('video')}
                      data-testid="request-video-call-btn"
                    >
                      <Video className="w-4 h-4" />
                      {requestingCallType === 'video' ? 'Requesting...' : 'Request Video Call'}
                    </Button>
                    {activeCallRequest && (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={actingCallId === activeCallRequest.call_id}
                        onClick={() => handleCallAction(activeCallRequest.call_id, 'cancel')}
                        data-testid="cancel-call-request-btn"
                      >
                        <PhoneOff className="w-4 h-4" />
                        Cancel Request
                      </Button>
                    )}
                    {!activeCallRequest && latestCall?.status === 'accepted' && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleOpenWhatsapp}
                        data-testid="open-whatsapp-handoff-btn"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Open WhatsApp
                      </Button>
                    )}
                  </>
                )}
                {isExpert && (
                  <div className="text-xs text-slate-500 max-w-60 text-right">
                    {activeCallRequest
                      ? 'Client can initiate call requests. You will receive an on-screen prompt to accept or reject.'
                      : needsCallSummary
                      ? 'Submit post-call summary before completing consultation.'
                      : latestCall?.status === 'accepted'
                      ? 'Call accepted. Client can start the WhatsApp handoff from this chat.'
                      : 'Waiting for client call request.'}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {needsCallSummary && (
            <Card className="border-amber-200 bg-amber-50">
              <div className="p-4 md:p-5 space-y-3">
                <h4 className="font-semibold text-slate-900">Post-call summary required</h4>
                <p className="text-sm text-slate-700">
                  Add a concise written summary for the client. This is required before marking consultation completed.
                </p>
                <Textarea
                  value={summaryText}
                  onChange={(e) => setSummaryText(e.target.value)}
                  placeholder="Key points discussed, advice given, and clear next actions."
                  className="bg-white"
                  data-testid="call-summary-input"
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleSubmitSummary}
                    disabled={submittingSummary}
                    data-testid="submit-call-summary-btn"
                  >
                    {submittingSummary ? 'Submitting...' : 'Submit Summary'}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <Card className="h-[calc(100vh-260px)] flex flex-col">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                      <Shield className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="font-medium text-slate-900 mb-2">Secure Chat Room</h3>
                    <p className="text-sm text-slate-500 max-w-sm mx-auto">
                      Your conversation is private. Start with the issue summary and key questions before moving to a call.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOwn = msg.sender_id === user?.user_id;
                    return (
                      <div
                        key={msg.message_id}
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                        data-testid={`message-${msg.message_id}`}
                      >
                        <div className={`max-w-[70%] ${isOwn ? 'order-2' : 'order-1'}`}>
                          {!isOwn && (
                            <p className="text-xs text-slate-500 mb-1 px-1">{msg.sender_alias}</p>
                          )}
                          <div
                            className={`rounded-2xl px-4 py-2.5 ${
                              isOwn
                                ? 'bg-slate-900 text-white rounded-br-md'
                                : 'bg-slate-100 text-slate-900 rounded-bl-md'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          </div>
                          <p className={`text-xs text-slate-400 mt-1 px-1 ${isOwn ? 'text-right' : ''}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-4 border-t border-slate-100">
              {booking.status === 'completed' ? (
                <div className="text-center py-2 text-slate-500 text-sm">
                  This consultation has been completed.
                </div>
              ) : (
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1"
                    disabled={sending}
                    data-testid="message-input"
                  />
                  <Button type="submit" disabled={sending || !newMessage.trim()} data-testid="send-message-btn">
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={incomingOpen && !!incomingCallRequest} onOpenChange={setIncomingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Incoming {incomingCallRequest ? CALL_LABELS[incomingCallRequest.call_type] : 'Call'}</DialogTitle>
            <DialogDescription>
              Client wants to discuss this consultation on {incomingCallRequest ? CALL_LABELS[incomingCallRequest.call_type].toLowerCase() : 'call'}.
            </DialogDescription>
          </DialogHeader>

          {incomingCallRequest && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Response needed</p>
              <p className="mt-1">This request will expire in {countdown}s if you do not respond.</p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={!incomingCallRequest || actingCallId === incomingCallRequest.call_id}
              onClick={() => incomingCallRequest && handleCallAction(incomingCallRequest.call_id, 'reject')}
              data-testid="reject-incoming-call-btn"
            >
              Reject
            </Button>
            <Button
              type="button"
              disabled={!incomingCallRequest || actingCallId === incomingCallRequest.call_id}
              onClick={() => incomingCallRequest && handleCallAction(incomingCallRequest.call_id, 'accept')}
              data-testid="accept-incoming-call-btn"
            >
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
