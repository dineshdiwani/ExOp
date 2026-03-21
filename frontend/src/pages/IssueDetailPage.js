import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Shield, ArrowLeft, MapPin, Tag, Clock, User, Star, Send, Calendar, DollarSign, MessageSquare, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function IssueDetailPage() {
  const { issueId } = useParams();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOfferDialog, setShowOfferDialog] = useState(false);
  const [offerData, setOfferData] = useState({
    price: '',
    message: '',
    available_slots: [{ date: '', start_time: '', end_time: '' }]
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchIssue();
  }, [issueId]);

  const fetchIssue = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/issues/${issueId}`);
      setIssue(response.data);
    } catch (error) {
      console.error('Error fetching issue:', error);
      toast.error('Issue not found');
      navigate('/issues');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOffer = async () => {
    if (!offerData.price || !offerData.message) {
      toast.error('Please fill in price and message');
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/offers`, {
        issue_id: issueId,
        price: parseInt(offerData.price),
        message: offerData.message,
        available_slots: offerData.available_slots.filter(s => s.date && s.start_time)
      });
      toast.success('Offer sent successfully!');
      setShowOfferDialog(false);
      fetchIssue();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send offer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptOffer = async (offerId) => {
    try {
      // Create booking
      const offer = issue.offers.find(o => o.offer_id === offerId);
      const selectedSlot = offer.available_slots[0] || { date: 'TBD', start_time: 'TBD', end_time: 'TBD' };
      
      const response = await axios.post(`${API_URL}/api/bookings`, {
        offer_id: offerId,
        selected_slot: selectedSlot
      });
      
      toast.success('Offer accepted! Proceed to payment.');
      navigate(`/booking/${response.data.booking_id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to accept offer');
    }
  };

  const addTimeSlot = () => {
    setOfferData(prev => ({
      ...prev,
      available_slots: [...prev.available_slots, { date: '', start_time: '', end_time: '' }]
    }));
  };

  const updateTimeSlot = (index, field, value) => {
    const newSlots = [...offerData.available_slots];
    newSlots[index][field] = value;
    setOfferData(prev => ({ ...prev, available_slots: newSlots }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse-soft text-lg text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!issue) return null;

  const isOwner = user?.user_id === issue.user_id;
  const isExpert = user?.role === 'expert';
  const hasOffered = issue.offers?.some(o => o.expert_id === user?.user_id);

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

      <main className="container mx-auto px-4 md:px-8 max-w-5xl py-8">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6" data-testid="back-btn">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Issue Details */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <Badge className={`status-${issue.status} mb-2`}>{issue.status.replace('_', ' ')}</Badge>
                    <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Outfit' }} data-testid="issue-title">
                      {issue.title}
                    </h1>
                  </div>
                  <Badge className={`urgency-${issue.urgency}`}>{issue.urgency}</Badge>
                </div>

                <div className="flex items-center gap-4 text-sm text-slate-500 mb-6">
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" /> {issue.user_alias}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" /> {issue.city}
                  </span>
                  <span className="flex items-center gap-1">
                    <Tag className="w-4 h-4" /> {issue.category}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" /> {new Date(issue.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="prose prose-slate max-w-none">
                  <p className="text-slate-700 whitespace-pre-wrap" data-testid="issue-description">{issue.description}</p>
                </div>

                {issue.budget_min && (
                  <div className="mt-6 p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2 text-slate-600">
                      <DollarSign className="w-5 h-5" />
                      <span className="font-medium">Budget Range:</span>
                      <span className="text-teal-600 font-semibold">₹{issue.budget_min} - ₹{issue.budget_max}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Offers Section */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle style={{ fontFamily: 'Outfit' }}>
                  Offers ({issue.offers?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!issue.offers || issue.offers.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No offers yet</p>
                    {isExpert && issue.status === 'open' && (
                      <Button className="mt-4" onClick={() => setShowOfferDialog(true)} data-testid="first-offer-btn">
                        Be the first to offer
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {issue.offers.map(offer => (
                      <div key={offer.offer_id} className="p-4 border border-slate-100 rounded-lg" data-testid={`offer-${offer.offer_id}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                              <User className="w-5 h-5 text-slate-400" />
                            </div>
                            <div>
                              <h4 className="font-medium text-slate-900">
                                {offer.expert?.name || offer.expert?.alias}
                              </h4>
                              <div className="flex items-center gap-2 text-sm text-slate-500">
                                {offer.expert_profile?.is_verified && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Check className="w-3 h-3 mr-1" /> Verified
                                  </Badge>
                                )}
                                <span className="flex items-center gap-1">
                                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                  {offer.expert_profile?.avg_rating?.toFixed(1) || 'New'}
                                </span>
                                <span>{offer.expert_profile?.experience_years || 0} yrs exp</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold text-teal-600">₹{offer.price}</div>
                            <Badge className={`status-${offer.status}`}>{offer.status}</Badge>
                          </div>
                        </div>

                        <p className="text-slate-600 text-sm mb-3">{offer.message}</p>

                        {offer.available_slots?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {offer.available_slots.map((slot, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                <Calendar className="w-3 h-3 mr-1" />
                                {slot.date} {slot.start_time}-{slot.end_time}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {isOwner && offer.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleAcceptOffer(offer.offer_id)} data-testid={`accept-offer-${offer.offer_id}`}>
                              Accept Offer
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => navigate(`/experts/${offer.expert_id}`)}>
                              View Profile
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div>
            {/* Action Card */}
            {isExpert && !isOwner && issue.status === 'open' && !hasOffered && (
              <Card className="sticky top-24">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">Interested in this issue?</h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Send an offer to help this client with their problem.
                  </p>
                  <Dialog open={showOfferDialog} onOpenChange={setShowOfferDialog}>
                    <DialogTrigger asChild>
                      <Button className="w-full" data-testid="send-offer-btn">
                        <Send className="w-4 h-4 mr-2" /> Send Offer
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle style={{ fontFamily: 'Outfit' }}>Send Your Offer</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div>
                          <Label>Your Price (₹)</Label>
                          <Input
                            type="number"
                            placeholder="e.g., 1500"
                            value={offerData.price}
                            onChange={(e) => setOfferData(prev => ({ ...prev, price: e.target.value }))}
                            className="mt-1.5"
                            data-testid="offer-price-input"
                          />
                        </div>

                        <div>
                          <Label>Message to Client</Label>
                          <Textarea
                            placeholder="Introduce yourself and explain how you can help..."
                            value={offerData.message}
                            onChange={(e) => setOfferData(prev => ({ ...prev, message: e.target.value }))}
                            className="mt-1.5"
                            data-testid="offer-message-input"
                          />
                        </div>

                        <div>
                          <Label>Available Time Slots</Label>
                          {offerData.available_slots.map((slot, i) => (
                            <div key={i} className="grid grid-cols-3 gap-2 mt-2">
                              <Input
                                type="date"
                                value={slot.date}
                                onChange={(e) => updateTimeSlot(i, 'date', e.target.value)}
                                data-testid={`slot-date-${i}`}
                              />
                              <Input
                                type="time"
                                value={slot.start_time}
                                onChange={(e) => updateTimeSlot(i, 'start_time', e.target.value)}
                                data-testid={`slot-start-${i}`}
                              />
                              <Input
                                type="time"
                                value={slot.end_time}
                                onChange={(e) => updateTimeSlot(i, 'end_time', e.target.value)}
                                data-testid={`slot-end-${i}`}
                              />
                            </div>
                          ))}
                          <Button variant="ghost" size="sm" onClick={addTimeSlot} className="mt-2">
                            + Add another slot
                          </Button>
                        </div>

                        <Button 
                          className="w-full" 
                          onClick={handleSendOffer}
                          disabled={submitting}
                          data-testid="submit-offer-btn"
                        >
                          {submitting ? 'Sending...' : 'Send Offer'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            )}

            {hasOffered && (
              <Card>
                <CardContent className="p-6 text-center">
                  <Check className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                  <h3 className="font-semibold text-slate-900">Offer Sent</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    You've already sent an offer for this issue.
                  </p>
                </CardContent>
              </Card>
            )}

            {!isAuthenticated && (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-slate-900 mb-2">Want to help?</h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Sign in as an expert to send consultation offers.
                  </p>
                  <Button className="w-full" onClick={() => navigate('/login')} data-testid="signin-to-offer-btn">
                    Sign In
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
