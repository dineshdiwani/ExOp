import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Shield, Search, MessageSquare, Calendar, Star, LogOut, User, Clock, MapPin, Tag, Filter, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NotificationMenu from '@/components/NotificationMenu';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function ExpertDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  const [myOffers, setMyOffers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ city: '', category: '' });
  const [categories, setCategories] = useState([]);
  const [cities, setCities] = useState([]);

  useEffect(() => {
    fetchData();
    fetchFilters();
  }, []);

  const fetchFilters = async () => {
    try {
      const [catRes, cityRes] = await Promise.all([
        axios.get(`${API_URL}/api/categories`),
        axios.get(`${API_URL}/api/cities`)
      ]);
      setCategories(catRes.data.categories || []);
      setCities(cityRes.data.cities || []);
    } catch (error) {
      console.error('Error fetching filters:', error);
    }
  };

  const fetchData = async () => {
    try {
      const [issuesRes, offersRes, bookingsRes, profileRes] = await Promise.all([
        axios.get(`${API_URL}/api/issues`, { params: { ...filters, status: 'open' } }),
        axios.get(`${API_URL}/api/offers/my/list`),
        axios.get(`${API_URL}/api/bookings`),
        axios.get(`${API_URL}/api/users/profile`)
      ]);
      setIssues(issuesRes.data.issues || []);
      setMyOffers(offersRes.data || []);
      setBookings(bookingsRes.data || []);
      setProfile(profileRes.data || null);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!loading) {
      fetchIssues();
    }
  }, [filters]);

  const fetchIssues = async () => {
    try {
      const params = { status: 'open' };
      if (filters.city) params.city = filters.city;
      if (filters.category) params.category = filters.category;
      
      const response = await axios.get(`${API_URL}/api/issues`, { params });
      setIssues(response.data.issues || []);
    } catch (error) {
      console.error('Error fetching issues:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse-soft text-lg text-slate-600">Loading...</div>
      </div>
    );
  }

  const expertProfile = profile?.expert_profile;

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

            <div className="flex items-center gap-4">
              <NotificationMenu />
              <Link to="/profile">
                <Button variant="ghost" size="icon" data-testid="profile-btn">
                  <User className="w-5 h-5" />
                </Button>
              </Link>
              <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="logout-btn">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 md:px-8 max-w-7xl py-8">
        {/* Welcome & Stats */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Outfit' }} data-testid="welcome-heading">
            Welcome, {user?.name || user?.alias || 'Expert'}
          </h1>
          <p className="text-slate-600">Find clients and manage your consultations</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-slate-900">{expertProfile?.total_consultations || 0}</div>
              <div className="text-sm text-slate-500">Total Consultations</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-slate-900 flex items-center gap-1">
                {expertProfile?.avg_rating?.toFixed(1) || '0.0'}
                <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
              </div>
              <div className="text-sm text-slate-500">Average Rating</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-slate-900">{myOffers.filter(o => o.status === 'pending').length}</div>
              <div className="text-sm text-slate-500">Pending Offers</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-slate-900">{bookings.filter(b => b.status === 'confirmed').length}</div>
              <div className="text-sm text-slate-500">Upcoming Sessions</div>
            </CardContent>
          </Card>
        </div>

        {/* Verification Notice */}
        {!expertProfile?.is_verified && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h3 className="font-medium text-amber-800">Verification Pending</h3>
                <p className="text-sm text-amber-700 mt-1">
                  Complete your profile and KYC verification to receive more visibility and trust from clients.
                </p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate('/profile')} data-testid="complete-profile-btn">
                  Complete Profile
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="browse" className="space-y-6">
          <TabsList>
            <TabsTrigger value="browse" data-testid="tab-browse">Browse Issues</TabsTrigger>
            <TabsTrigger value="offers" data-testid="tab-offers">My Offers ({myOffers.length})</TabsTrigger>
            <TabsTrigger value="bookings" data-testid="tab-bookings">Bookings ({bookings.length})</TabsTrigger>
          </TabsList>

          {/* Browse Issues Tab */}
          <TabsContent value="browse">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-6">
              <Select value={filters.city || "all"} onValueChange={(v) => handleFilterChange('city', v === "all" ? "" : v)}>
                <SelectTrigger className="w-[180px]" data-testid="filter-city">
                  <MapPin className="w-4 h-4 mr-2 text-slate-400" />
                  <SelectValue placeholder="All Cities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cities</SelectItem>
                  {cities.map(city => (
                    <SelectItem key={city} value={city}>{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.category || "all"} onValueChange={(v) => handleFilterChange('category', v === "all" ? "" : v)}>
                <SelectTrigger className="w-[180px]" data-testid="filter-category">
                  <Tag className="w-4 h-4 mr-2 text-slate-400" />
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Issues List */}
            {issues.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">No open issues found</p>
                  <p className="text-sm text-slate-400 mt-1">Try adjusting your filters</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {issues.map(issue => (
                  <Card key={issue.issue_id} className="card-hover" data-testid={`issue-card-${issue.issue_id}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <Link to={`/issues/${issue.issue_id}`} className="font-semibold text-slate-900 hover:text-teal-600 transition-colors">
                            {issue.title}
                          </Link>
                          <p className="text-sm text-slate-500 mt-1">Posted by {issue.user_alias}</p>
                        </div>
                        <Badge className={`urgency-${issue.urgency}`}>
                          {issue.urgency}
                        </Badge>
                      </div>
                      
                      <p className="text-slate-600 text-sm mb-4 line-clamp-2">{issue.description}</p>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" /> {issue.city}
                          </span>
                          <span className="flex items-center gap-1">
                            <Tag className="w-4 h-4" /> {issue.category}
                          </span>
                          {issue.budget_min && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-4 h-4" /> ₹{issue.budget_min} - ₹{issue.budget_max}
                            </span>
                          )}
                        </div>
                        <Button size="sm" onClick={() => navigate(`/issues/${issue.issue_id}`)} data-testid={`send-offer-${issue.issue_id}`}>
                          Send Offer
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* My Offers Tab */}
          <TabsContent value="offers">
            {myOffers.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">No offers sent yet</p>
                  <p className="text-sm text-slate-400 mt-1">Browse issues and send your first offer</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {myOffers.map(offer => (
                  <Card key={offer.offer_id} data-testid={`offer-${offer.offer_id}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <Link to={`/issues/${offer.issue_id}`} className="font-semibold text-slate-900 hover:text-teal-600">
                            {offer.issue?.title || 'Issue'}
                          </Link>
                          <Badge className={`ml-2 status-${offer.status}`}>{offer.status}</Badge>
                        </div>
                        <div className="text-lg font-semibold text-teal-600">₹{offer.price}</div>
                      </div>
                      <p className="text-sm text-slate-600">{offer.message}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Bookings Tab */}
          <TabsContent value="bookings">
            {bookings.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">No bookings yet</p>
                  <p className="text-sm text-slate-400 mt-1">Send offers to clients to get bookings</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {bookings.map(booking => (
                  <Card key={booking.booking_id} className="card-hover" data-testid={`booking-${booking.booking_id}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-slate-900">{booking.issue?.title || 'Consultation'}</h4>
                          <p className="text-sm text-slate-500">Client: {booking.client?.alias || 'Anonymous'}</p>
                        </div>
                        <Badge className={`status-${booking.status}`}>{booking.status.replace('_', ' ')}</Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" /> {booking.selected_slot?.date}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" /> {booking.selected_slot?.start_time} - {booking.selected_slot?.end_time}
                        </span>
                        <span className="font-medium text-teal-600">₹{booking.expert_payout} (your payout)</span>
                      </div>
                      
                      <div className="flex gap-2">
                        {booking.status === 'confirmed' && (
                          <Button size="sm" onClick={() => navigate(`/chat/${booking.booking_id}`)} data-testid={`start-chat-${booking.booking_id}`}>
                            Start Consultation
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => navigate(`/booking/${booking.booking_id}`)} data-testid={`view-booking-${booking.booking_id}`}>
                          View Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
