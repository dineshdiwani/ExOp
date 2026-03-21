import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Shield, ArrowLeft, Calendar, Clock, User, CreditCard, MessageSquare, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function BookingPage() {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);

  useEffect(() => {
    fetchBooking();
  }, [bookingId]);

  const fetchBooking = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/bookings/${bookingId}`);
      setBooking(response.data);
    } catch (error) {
      console.error('Error fetching booking:', error);
      toast.error('Booking not found');
      navigate('/my-bookings');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    setPaymentLoading(true);
    try {
      // Create payment order
      const orderRes = await axios.post(`${API_URL}/api/payments/create-order`, {
        booking_id: bookingId
      });

      // For MVP, simulate payment success
      // In production, integrate with Razorpay checkout
      const verifyRes = await axios.post(`${API_URL}/api/payments/verify`, {
        order_id: orderRes.data.order_id,
        razorpay_payment_id: `pay_${Date.now()}`,
        razorpay_signature: 'mock_signature'
      });

      toast.success('Payment successful!');
      fetchBooking();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Payment failed');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleStatusUpdate = async (status) => {
    try {
      await axios.put(`${API_URL}/api/bookings/${bookingId}/status`, { status });
      toast.success(`Consultation ${status}`);
      fetchBooking();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update status');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse-soft text-lg text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!booking) return null;

  const isClient = user?.user_id === booking.client_id;
  const isExpert = user?.user_id === booking.expert_id;

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
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 md:px-8 max-w-3xl py-8">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6" data-testid="back-btn">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle style={{ fontFamily: 'Outfit' }}>Booking Details</CardTitle>
              <Badge className={`status-${booking.status}`} data-testid="booking-status">
                {booking.status.replace('_', ' ')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Issue Info */}
            <div className="p-4 bg-slate-50 rounded-lg">
              <h3 className="font-medium text-slate-900 mb-2">{booking.issue?.title}</h3>
              <p className="text-sm text-slate-600 line-clamp-2">{booking.issue?.description}</p>
            </div>

            {/* Expert/Client Info */}
            <div className="flex items-center gap-4 p-4 border border-slate-100 rounded-lg">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <User className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <p className="text-sm text-slate-500">
                  {isClient ? 'Expert' : 'Client'}
                </p>
                <p className="font-medium text-slate-900">
                  {isClient 
                    ? (booking.expert?.name || booking.expert?.alias)
                    : (booking.client?.alias || 'Anonymous Client')}
                </p>
              </div>
            </div>

            {/* Schedule */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border border-slate-100 rounded-lg">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm">Date</span>
                </div>
                <p className="font-medium text-slate-900" data-testid="booking-date">
                  {booking.selected_slot?.date || 'TBD'}
                </p>
              </div>
              <div className="p-4 border border-slate-100 rounded-lg">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">Time</span>
                </div>
                <p className="font-medium text-slate-900" data-testid="booking-time">
                  {booking.selected_slot?.start_time || 'TBD'} - {booking.selected_slot?.end_time || 'TBD'}
                </p>
              </div>
            </div>

            {/* Payment Details */}
            <div className="p-4 border border-slate-100 rounded-lg">
              <h4 className="font-medium text-slate-900 mb-3">Payment Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Consultation Fee</span>
                  <span className="text-slate-900">₹{booking.price}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Platform Fee (15%)</span>
                  <span className="text-slate-900">₹{booking.platform_fee}</span>
                </div>
                <div className="border-t border-slate-100 pt-2 mt-2">
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-900">Total</span>
                    <span className="text-teal-600 text-lg">₹{booking.price}</span>
                  </div>
                </div>
                {isExpert && (
                  <div className="flex justify-between text-teal-600 mt-2">
                    <span>Your Payout</span>
                    <span className="font-medium">₹{booking.expert_payout}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Status */}
            {booking.payment_status === 'pending' && isClient && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-800">Payment Required</h4>
                    <p className="text-sm text-amber-700 mt-1">
                      Complete the payment to confirm your consultation booking.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {booking.payment_status === 'paid' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-emerald-700">
                  <Check className="w-5 h-5" />
                  <span className="font-medium">Payment Completed</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-100">
              {/* Payment Button */}
              {booking.status === 'pending_payment' && isClient && (
                <Button 
                  onClick={handlePayment} 
                  disabled={paymentLoading}
                  data-testid="pay-now-btn"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  {paymentLoading ? 'Processing...' : 'Pay Now'}
                </Button>
              )}

              {/* Start Consultation */}
              {booking.status === 'confirmed' && (
                <>
                  <Button onClick={() => navigate(`/chat/${bookingId}`)} data-testid="start-chat-btn">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Start Consultation
                  </Button>
                  {isExpert && (
                    <Button 
                      variant="outline"
                      onClick={() => handleStatusUpdate('in_progress')}
                      data-testid="mark-started-btn"
                    >
                      Mark as Started
                    </Button>
                  )}
                </>
              )}

              {/* Complete Consultation */}
              {booking.status === 'in_progress' && (
                <>
                  <Button onClick={() => navigate(`/chat/${bookingId}`)} data-testid="continue-chat-btn">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Continue Chat
                  </Button>
                  {isExpert && (
                    <Button 
                      variant="outline"
                      onClick={() => handleStatusUpdate('completed')}
                      data-testid="mark-completed-btn"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Mark as Completed
                    </Button>
                  )}
                </>
              )}

              {/* Dispute */}
              {['confirmed', 'in_progress'].includes(booking.status) && isClient && (
                <Button 
                  variant="outline"
                  onClick={() => handleStatusUpdate('disputed')}
                  data-testid="raise-dispute-btn"
                >
                  Raise Dispute
                </Button>
              )}

              {/* Review */}
              {booking.status === 'completed' && isClient && (
                <Button onClick={() => navigate(`/review/${bookingId}`)} data-testid="write-review-btn">
                  Write Review
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
