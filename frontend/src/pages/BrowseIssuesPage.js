import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Shield, Search, MapPin, Tag, MessageSquare, Clock, Filter, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function BrowseIssuesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [cities, setCities] = useState([]);
  const [filters, setFilters] = useState({
    city: searchParams.get('city') || '',
    category: searchParams.get('category') || '',
    status: 'open'
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchFilters();
  }, []);

  useEffect(() => {
    fetchIssues();
  }, [filters, page]);

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

  const fetchIssues = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filters.city) params.city = filters.city;
      if (filters.category) params.category = filters.category;
      if (filters.status) params.status = filters.status;

      const response = await axios.get(`${API_URL}/api/issues`, { params });
      setIssues(response.data.issues || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Error fetching issues:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
    
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  const getUrgencyColor = (urgency) => {
    const colors = {
      low: 'bg-slate-100 text-slate-600',
      normal: 'bg-blue-100 text-blue-600',
      high: 'bg-amber-100 text-amber-600',
      urgent: 'bg-red-100 text-red-600'
    };
    return colors[urgency] || colors.normal;
  };

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
              <Link to="/login">
                <Button variant="ghost" data-testid="login-btn">Sign In</Button>
              </Link>
              <Link to="/register">
                <Button data-testid="register-btn">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 md:px-8 max-w-7xl py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Outfit' }}>
            Browse Issues
          </h1>
          <p className="text-slate-600">Find clients seeking expert consultation</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-8">
          <Select value={filters.city} onValueChange={(v) => handleFilterChange('city', v)}>
            <SelectTrigger className="w-[180px] bg-white" data-testid="filter-city">
              <MapPin className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue placeholder="All Cities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Cities</SelectItem>
              {cities.map(city => (
                <SelectItem key={city} value={city}>{city}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.category} onValueChange={(v) => handleFilterChange('category', v)}>
            <SelectTrigger className="w-[180px] bg-white" data-testid="filter-category">
              <Tag className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto text-sm text-slate-500">
            {total} issues found
          </div>
        </div>

        {/* Issues List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-pulse-soft text-slate-500">Loading issues...</div>
          </div>
        ) : issues.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="font-medium text-slate-900 mb-2">No issues found</h3>
              <p className="text-slate-500">Try adjusting your filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {issues.map(issue => (
              <Link
                key={issue.issue_id}
                to={`/issues/${issue.issue_id}`}
                className="block"
                data-testid={`issue-${issue.issue_id}`}
              >
                <Card className="card-hover">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-900 hover:text-teal-600 transition-colors">
                            {issue.title}
                          </h3>
                          <Badge className={getUrgencyColor(issue.urgency)}>
                            {issue.urgency}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-500">
                          Posted by {issue.user_alias} • {new Date(issue.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </div>

                    <p className="text-slate-600 mb-4 line-clamp-2">{issue.description}</p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" /> {issue.city}
                        </span>
                        <span className="flex items-center gap-1">
                          <Tag className="w-4 h-4" /> {issue.category}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-4 h-4" /> {issue.offers_count} offers
                        </span>
                      </div>
                      {issue.budget_min && (
                        <span className="text-sm font-medium text-teal-600">
                          ₹{issue.budget_min} - ₹{issue.budget_max}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > 20 && (
          <div className="flex justify-center gap-2 mt-8">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              data-testid="prev-page-btn"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={page * 20 >= total}
              onClick={() => setPage(p => p + 1)}
              data-testid="next-page-btn"
            >
              Next
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
