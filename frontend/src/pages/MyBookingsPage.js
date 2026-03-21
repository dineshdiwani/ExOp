import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Shield, Calendar, Clock, User, MessageSquare, ChevronRight, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function MyBookingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/bookings`);
      setBookings(response.data || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  const filterBookings = (status) => {
    if (status === 'all') return bookings;
    if (status === 'active') return bookings.filter(b => ['confirmed', 'in_progress'].includes(b.status));
    if (status === 'pending') return bookings.filter(b => b.status === 'pending_payment');
    if (status === 'completed') return bookings.filter(b => b.status === 'completed');
    return bookings;
  };

  const isClient = user?.role === 'client';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse-soft text-lg text-slate-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-lg text-slate-900" style={{ fontFamily: 'Outfit' }}>
                ExpertOpinion
              </span>
            </Link>

            <Button variant="ghost" onClick={() => navigate(isClient ? '/dashboard' : '/expert')} data-testid="back-dashboard-btn">
              Back to Dashboard
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 md:px-8 max-w-5xl py-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Outfit' }}>
          My Bookings
        </h1>
        <p className="text-slate-600 mb-8">Manage your consultations and sessions</p>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="all" data-testid="tab-all">All ({bookings.length})</TabsTrigger>
            <TabsTrigger value="active" data-testid="tab-active">Active ({filterBookings('active').length})</TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending">Pending Payment ({filterBookings('pending').length})</TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed">Completed ({filterBookings('completed').length})</TabsTrigger>
          </TabsList>

          {['all', 'active', 'pending', 'completed'].map(tab => (
            <TabsContent key={tab} value={tab}>
              {filterBookings(tab).length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No bookings found</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {filterBookings(tab).map(booking => (
                    <Card 
                      key={booking.booking_id} 
                      className="card-hover cursor-pointer"
                      onClick={() => navigate(`/booking/${booking.booking_id}`)}
                      data-testid={`booking-card-${booking.booking_id}`}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-slate-900">
                                {booking.issue?.title || 'Consultation'}
                              </h3>
                              <Badge className={`status-${booking.status}`}>
                                {booking.status.replace('_', ' ')}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-500 line-clamp-1">
                              {booking.issue?.description}
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-400" />
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-6 text-sm text-slate-500">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4" />
                              <span>
                                {isClient 
                                  ? (booking.expert?.name || booking.expert?.alias)
                                  : (booking.client?.alias || 'Anonymous')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              <span>{booking.selected_slot?.date || 'TBD'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>{booking.selected_slot?.start_time || 'TBD'}</span>
                            </div>
                          </div>
                          <div className="text-lg font-semibold text-teal-600">
                            ₹{isClient ? booking.price : booking.expert_payout}
                          </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                          {booking.status === 'pending_payment' && isClient && (
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/booking/${booking.booking_id}`); }} data-testid={`pay-${booking.booking_id}`}>
                              Pay Now
                            </Button>
                          )}
                          {['confirmed', 'in_progress'].includes(booking.status) && (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/chat/${booking.booking_id}`); }} data-testid={`chat-${booking.booking_id}`}>
                              <MessageSquare className="w-4 h-4 mr-1" /> Chat
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}
