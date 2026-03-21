import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Shield, ArrowLeft, Send, User, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function ChatRoom() {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    fetchData();
    // Poll for new messages every 3 seconds
    pollIntervalRef.current = setInterval(fetchMessages, 3000);
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [bookingId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchData = async () => {
    try {
      const [bookingRes, messagesRes] = await Promise.all([
        axios.get(`${API_URL}/api/bookings/${bookingId}`),
        axios.get(`${API_URL}/api/chat/messages/${bookingId}`)
      ]);
      setBooking(bookingRes.data);
      setMessages(messagesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load chat');
      navigate('/my-bookings');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/chat/messages/${bookingId}`);
      setMessages(response.data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

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
      fetchMessages();
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
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

  const isClient = user?.user_id === booking.client_id;
  const otherParty = isClient 
    ? (booking.expert?.name || booking.expert?.alias)
    : (booking.client?.alias || 'Anonymous Client');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
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

      {/* Chat Area */}
      <div className="flex-1 container mx-auto px-4 md:px-8 max-w-4xl py-4">
        <Card className="h-[calc(100vh-180px)] flex flex-col">
          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Shield className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="font-medium text-slate-900 mb-2">Secure Chat Room</h3>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">
                    Your conversation is private. Start by introducing yourself or explaining your needs.
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

          {/* Input Area */}
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
  );
}
