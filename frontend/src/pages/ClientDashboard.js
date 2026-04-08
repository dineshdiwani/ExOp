import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Shield, Plus, MessageSquare, Calendar, ChevronRight, LogOut, User, Clock, MapPin, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import NotificationMenu from '@/components/NotificationMenu';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function ClientDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [issuesRes, bookingsRes] = await Promise.all([
        axios.get(`${API_URL}/api/issues/my/list`),
        axios.get(`${API_URL}/api/bookings`)
      ]);
      setIssues(issuesRes.data || []);
      setBookings(bookingsRes.data || []);
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

  const getStatusBadge = (status) => {
    const styles = {
      open: 'bg-emerald-100 text-emerald-700',
      in_progress: 'bg-amber-100 text-amber-700',
      resolved: 'bg-blue-100 text-blue-700',
      closed: 'bg-slate-100 text-slate-700'
    };
    return <Badge className={styles[status] || styles.open}>{status.replace('_', ' ')}</Badge>;
  };

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
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Outfit' }} data-testid="welcome-heading">
            Welcome, {user?.alias || 'User'}
          </h1>
          <p className="text-slate-600">Manage your issues and consultations</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="card-hover cursor-pointer" onClick={() => navigate('/post-issue')} data-testid="post-issue-card">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center">
                <Plus className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Post New Issue</h3>
                <p className="text-sm text-slate-500">Get expert advice anonymously</p>
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover cursor-pointer" onClick={() => navigate('/experts')} data-testid="browse-experts-card">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Browse Experts</h3>
                <p className="text-sm text-slate-500">Find the right expert for you</p>
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover cursor-pointer" onClick={() => navigate('/my-bookings')} data-testid="my-bookings-card">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">My Bookings</h3>
                <p className="text-sm text-slate-500">{bookings.length} active consultations</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Issues */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold" style={{ fontFamily: 'Outfit' }}>
                My Issues
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/post-issue')} data-testid="new-issue-btn">
                <Plus className="w-4 h-4 mr-1" /> New
              </Button>
            </CardHeader>
            <CardContent>
              {issues.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 mb-4">No issues posted yet</p>
                  <Button onClick={() => navigate('/post-issue')} data-testid="first-issue-btn">
                    Post Your First Issue
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {issues.slice(0, 5).map(issue => (
                    <Link 
                      key={issue.issue_id} 
                      to={`/issues/${issue.issue_id}`}
                      className="block p-4 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors"
                      data-testid={`issue-${issue.issue_id}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-slate-900 line-clamp-1">{issue.title}</h4>
                        {getStatusBadge(issue.status)}
                      </div>
                      <p className="text-sm text-slate-500 line-clamp-2 mb-3">{issue.description}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {issue.city}
                        </span>
                        <span className="flex items-center gap-1">
                          <Tag className="w-3 h-3" /> {issue.category}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> {issue.offers_count} offers
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Bookings */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold" style={{ fontFamily: 'Outfit' }}>
                Recent Bookings
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/my-bookings')} data-testid="view-all-bookings-btn">
                View All <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {bookings.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">No bookings yet</p>
                  <p className="text-sm text-slate-400 mt-1">Book a consultation to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {bookings.slice(0, 5).map(booking => (
                    <Link 
                      key={booking.booking_id} 
                      to={`/booking/${booking.booking_id}`}
                      className="block p-4 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors"
                      data-testid={`booking-${booking.booking_id}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-slate-900">{booking.issue?.title || 'Consultation'}</h4>
                        <Badge className={`status-${booking.status}`}>{booking.status.replace('_', ' ')}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" /> {booking.expert?.alias || booking.expert?.name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" /> {booking.selected_slot?.date}
                        </span>
                      </div>
                      <div className="mt-2 text-sm font-medium text-teal-600">
                        ₹{booking.price}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
