import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Shield, Search, MapPin, Tag, Star, Check, User, Briefcase, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function BrowseExpertsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [experts, setExperts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [cities, setCities] = useState([]);
  const [filters, setFilters] = useState({
    city: searchParams.get('city') || '',
    category: searchParams.get('category') || '',
    verified_only: false
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchFilters();
  }, []);

  useEffect(() => {
    fetchExperts();
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

  const fetchExperts = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filters.city) params.city = filters.city;
      if (filters.category) params.category = filters.category;
      if (filters.verified_only) params.verified_only = true;

      const response = await axios.get(`${API_URL}/api/experts`, { params });
      setExperts(response.data.experts || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Error fetching experts:', error);
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
            Browse Experts
          </h1>
          <p className="text-slate-600">Find verified professionals for your consultation needs</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-8">
          <Select value={filters.city || "all"} onValueChange={(v) => handleFilterChange('city', v === "all" ? "" : v)}>
            <SelectTrigger className="w-[180px] bg-white" data-testid="filter-city">
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
            <SelectTrigger className="w-[180px] bg-white" data-testid="filter-category">
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

          <Button
            variant={filters.verified_only ? "default" : "outline"}
            onClick={() => handleFilterChange('verified_only', !filters.verified_only)}
            data-testid="filter-verified"
          >
            <Check className="w-4 h-4 mr-2" /> Verified Only
          </Button>

          <div className="ml-auto text-sm text-slate-500">
            {total} experts found
          </div>
        </div>

        {/* Experts Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-pulse-soft text-slate-500">Loading experts...</div>
          </div>
        ) : experts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="font-medium text-slate-900 mb-2">No experts found</h3>
              <p className="text-slate-500">Try adjusting your filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {experts.map(expert => (
              <Link
                key={expert.user_id}
                to={`/experts/${expert.user_id}`}
                className="block"
                data-testid={`expert-${expert.user_id}`}
              >
                <Card className="h-full card-hover">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4 mb-4">
                      <Avatar className="w-14 h-14">
                        <AvatarImage src={expert.user?.picture} />
                        <AvatarFallback className="bg-slate-100 text-lg">
                          {(expert.user?.name || expert.user?.alias || 'E')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900 truncate">
                            {expert.user?.name || expert.user?.alias}
                          </h3>
                          {expert.is_verified && (
                            <Badge className="bg-teal-100 text-teal-700 text-xs flex-shrink-0">
                              <Check className="w-3 h-3 mr-0.5" /> Verified
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-1 text-amber-500">
                            <Star className="w-4 h-4 fill-amber-400" />
                            <span className="text-sm font-medium">
                              {expert.avg_rating?.toFixed(1) || 'New'}
                            </span>
                          </div>
                          <span className="text-sm text-slate-400">
                            ({expert.ratings_count || 0} reviews)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Briefcase className="w-4 h-4" />
                        <span>{expert.experience_years} years experience</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <User className="w-4 h-4" />
                        <span>{expert.total_consultations} consultations</span>
                      </div>
                      {expert.cities?.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <MapPin className="w-4 h-4" />
                          <span className="truncate">{expert.cities.slice(0, 2).join(', ')}</span>
                        </div>
                      )}
                    </div>

                    {/* Expertise Tags */}
                    {expert.expertise?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {expert.expertise.slice(0, 3).map(exp => (
                          <Badge key={exp} variant="secondary" className="text-xs">
                            {exp}
                          </Badge>
                        ))}
                        {expert.expertise.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{expert.expertise.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <div>
                        <span className="text-lg font-bold text-teal-600">₹{expert.hourly_rate}</span>
                        <span className="text-sm text-slate-500">/session</span>
                      </div>
                      <Button size="sm" variant="ghost" className="text-slate-600">
                        View Profile <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
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
