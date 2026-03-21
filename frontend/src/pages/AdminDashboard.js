import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Shield, Users, DollarSign, AlertTriangle, CheckCircle, XCircle, BarChart3, Settings, LogOut, TrendingUp, Clock, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [pendingExperts, setPendingExperts] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, usersRes, expertsRes, disputesRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/stats`),
        axios.get(`${API_URL}/api/admin/users`),
        axios.get(`${API_URL}/api/admin/experts/pending`),
        axios.get(`${API_URL}/api/admin/disputes`)
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data.users || []);
      setPendingExperts(expertsRes.data || []);
      setDisputes(disputesRes.data || []);
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyExpert = async (userId, action) => {
    try {
      await axios.put(`${API_URL}/api/admin/experts/${userId}/verify`, { action });
      toast.success(`Expert ${action}d successfully`);
      fetchData();
    } catch (error) {
      toast.error('Failed to update expert status');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
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
      <header className="bg-slate-900 text-white sticky top-0 z-50">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                <Shield className="w-5 h-5 text-slate-900" />
              </div>
              <span className="font-semibold text-lg" style={{ fontFamily: 'Outfit' }}>
                Admin Panel
              </span>
            </Link>

            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" data-testid="settings-btn">
                <Settings className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={handleLogout} data-testid="logout-btn">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 md:px-8 max-w-7xl py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Users className="w-5 h-5 text-slate-400" />
                <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">+12%</span>
              </div>
              <div className="text-3xl font-bold text-slate-900" data-testid="stat-total-users">{stats?.total_users || 0}</div>
              <div className="text-sm text-slate-500">Total Users</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Scale className="w-5 h-5 text-slate-400" />
                <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">+8%</span>
              </div>
              <div className="text-3xl font-bold text-slate-900" data-testid="stat-total-experts">{stats?.total_experts || 0}</div>
              <div className="text-sm text-slate-500">Verified Experts</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="w-5 h-5 text-slate-400" />
              </div>
              <div className="text-3xl font-bold text-slate-900" data-testid="stat-total-bookings">{stats?.total_bookings || 0}</div>
              <div className="text-sm text-slate-500">Total Bookings</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-5 h-5 text-slate-400" />
              </div>
              <div className="text-3xl font-bold text-teal-600" data-testid="stat-platform-revenue">₹{stats?.platform_revenue?.toLocaleString() || 0}</div>
              <div className="text-sm text-slate-500">Platform Revenue</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="experts" className="space-y-6">
          <TabsList>
            <TabsTrigger value="experts" data-testid="tab-experts">
              Pending Experts ({pendingExperts.length})
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              All Users ({users.length})
            </TabsTrigger>
            <TabsTrigger value="disputes" data-testid="tab-disputes">
              Disputes ({disputes.length})
            </TabsTrigger>
          </TabsList>

          {/* Pending Experts */}
          <TabsContent value="experts">
            <Card>
              <CardHeader>
                <CardTitle style={{ fontFamily: 'Outfit' }}>Expert Verification Queue</CardTitle>
              </CardHeader>
              <CardContent>
                {pendingExperts.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-emerald-300 mx-auto mb-4" />
                    <p className="text-slate-500">No pending verifications</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingExperts.map(expert => (
                      <div key={expert.user_id} className="flex items-center justify-between p-4 border border-slate-100 rounded-lg" data-testid={`pending-expert-${expert.user_id}`}>
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                            <Users className="w-6 h-6 text-slate-400" />
                          </div>
                          <div>
                            <h4 className="font-medium text-slate-900">{expert.user?.name || expert.user?.alias}</h4>
                            <p className="text-sm text-slate-500">{expert.user?.email}</p>
                            <div className="flex gap-2 mt-1">
                              {expert.expertise?.map(exp => (
                                <Badge key={exp} variant="secondary" className="text-xs">{exp}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => handleVerifyExpert(expert.user_id, 'approve')}
                            data-testid={`approve-${expert.user_id}`}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" /> Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleVerifyExpert(expert.user_id, 'reject')}
                            data-testid={`reject-${expert.user_id}`}
                          >
                            <XCircle className="w-4 h-4 mr-1" /> Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* All Users */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle style={{ fontFamily: 'Outfit' }}>User Management</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">User</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Email</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Role</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">City</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.user_id} className="border-b border-slate-50 hover:bg-slate-50" data-testid={`user-row-${u.user_id}`}>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{u.name || u.alias}</div>
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-500">{u.email || 'N/A'}</td>
                          <td className="py-3 px-4">
                            <Badge variant={u.role === 'admin' ? 'destructive' : u.role === 'expert' ? 'default' : 'secondary'}>
                              {u.role}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-500">{u.city || 'N/A'}</td>
                          <td className="py-3 px-4 text-sm text-slate-500">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Disputes */}
          <TabsContent value="disputes">
            <Card>
              <CardHeader>
                <CardTitle style={{ fontFamily: 'Outfit' }}>Active Disputes</CardTitle>
              </CardHeader>
              <CardContent>
                {disputes.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-emerald-300 mx-auto mb-4" />
                    <p className="text-slate-500">No active disputes</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {disputes.map(dispute => (
                      <div key={dispute.booking_id} className="p-4 border border-orange-200 bg-orange-50 rounded-lg" data-testid={`dispute-${dispute.booking_id}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-medium text-slate-900">{dispute.issue?.title}</h4>
                            <div className="flex gap-4 text-sm text-slate-600 mt-1">
                              <span>Client: {dispute.client?.alias}</span>
                              <span>Expert: {dispute.expert?.name || dispute.expert?.alias}</span>
                            </div>
                          </div>
                          <Badge className="bg-orange-100 text-orange-700">Disputed</Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline">Resolve</Button>
                          <Button size="sm" variant="outline">Refund Client</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
